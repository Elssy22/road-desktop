// Edge Function `summarize-meeting` : transforme les notes brutes d'un RDV en
// résumé + tâches suggérées via OpenRouter. Sans état : elle ne lit ni n'écrit
// rien en base, elle reçoit le texte et renvoie le résultat. L'app enregistre
// (note, tâches) seulement après validation explicite de l'utilisateur.
//
// Déploiement : supabase functions deploy summarize-meeting
// Secrets requis : OPENROUTER_API_KEY et SUMMARIZE_ALLOWED_USER_IDS (uuid des
// comptes autorisés, séparés par des virgules ; cf. DECISIONS.md §15 et §36).

import { createClient } from 'npm:@supabase/supabase-js@2';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'anthropic/claude-haiku-4.5';
/** Garde-fou coût : ~30 min de dictée tiennent largement dans cette limite. */
const MAX_INPUT_CHARS = 20_000;
const MAX_TASKS = 20;
const TIMEOUT_MS = 45_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Erreur renvoyée telle quelle à l'app (message lisible + code stable). */
class FnError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

type SuggestedTask = { title: string; due_date: string | null };
type Result = { summary: string; suggested_tasks: SuggestedTask[] };

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Compte-rendu structuré du RDV, en français.' },
    suggested_tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Action concrète, commençant par un verbe.' },
          due_date: {
            type: ['string', 'null'],
            description: 'Échéance au format YYYY-MM-DD si elle est mentionnée ou déductible, sinon null.',
          },
        },
        required: ['title', 'due_date'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'suggested_tasks'],
  additionalProperties: false,
};

function systemPrompt(today: string): string {
  return [
    "Tu es l'assistant d'un agent indépendant (clients : créateurs, clubs, coachs, sociétés).",
    "On te donne ses notes brutes de rendez-vous, souvent dictées (ponctuation approximative, fautes de transcription).",
    '',
    'Produis :',
    '- summary : compte-rendu clair en français (quelques phrases ou puces avec « - » : contexte, points discutés, décisions, prochaines étapes). N’invente rien qui ne soit pas dans les notes.',
    '- suggested_tasks : les actions à faire par l’agent qui ressortent des notes (0 si aucune). Titre court commençant par un verbe à l’infinitif.',
    `- due_date : date au format YYYY-MM-DD si une échéance est explicite ou déductible (« vendredi », « dans 15 jours ») — nous sommes le ${today}. Sinon null.`,
    '',
    'Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni bloc de code :',
    '{"summary": "...", "suggested_tasks": [{"title": "...", "due_date": "YYYY-MM-DD" | null}]}',
  ].join('\n');
}

/** Clé publique du projet (suffit pour vérifier un JWT ; pas besoin de la service role). */
function projectKey(): string {
  const keys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // format inattendu : repli sur la clé historique
    }
  }
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (!legacy) throw new Error('Clé publique Supabase introuvable dans l’environnement de la fonction.');
  return legacy;
}

const isDateKey = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/**
 * Parsing défensif : le modèle peut entourer le JSON de ```json … ``` ou d'une
 * phrase. On isole le premier objet `{ … }` puis on valide champ par champ.
 */
export function parseResult(content: string): Result {
  const unfenced = content.replace(/```(?:json)?/gi, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('aucun objet JSON');
  // deno-lint-ignore no-explicit-any
  const raw: any = JSON.parse(unfenced.slice(start, end + 1));

  const summary = typeof raw?.summary === 'string' ? raw.summary.trim() : '';
  if (!summary) throw new Error('champ summary manquant');

  const tasks: SuggestedTask[] = [];
  for (const t of Array.isArray(raw.suggested_tasks) ? raw.suggested_tasks : []) {
    const title = typeof t === 'string' ? t.trim() : typeof t?.title === 'string' ? t.title.trim() : '';
    if (!title) continue;
    tasks.push({ title: title.slice(0, 200), due_date: isDateKey(t?.due_date) ? t.due_date : null });
    if (tasks.length >= MAX_TASKS) break;
  }
  return { summary, suggested_tasks: tasks };
}

/** Traduit une erreur HTTP OpenRouter en message pour l'utilisateur (jamais la clé). */
function openRouterError(status: number, detail: string): FnError {
  if (status === 401 || status === 403)
    return new FnError('Clé OpenRouter invalide ou révoquée (configuration serveur).', 502, 'provider_auth');
  if (status === 402) return new FnError('Crédits OpenRouter épuisés. Recharge le compte puis réessaie.', 502, 'quota');
  if (status === 429) return new FnError('Trop de demandes vers l’IA pour le moment. Réessaie dans une minute.', 429, 'rate_limited');
  if (status === 408 || status >= 500)
    return new FnError('Le service d’IA est indisponible pour le moment. Réessaie plus tard.', 503, 'provider_down');
  return new FnError(`Requête refusée par OpenRouter (HTTP ${status})${detail ? ` : ${detail}` : ''}.`, 502, 'provider_error');
}

async function callOpenRouter(notes: string, today: string, structured: boolean): Promise<Response> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) throw new FnError('Secret OPENROUTER_API_KEY non configuré côté Supabase.', 500, 'config');
  const body: Record<string, unknown> = {
    model: MODEL,
    temperature: 0.2,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: systemPrompt(today) },
      { role: 'user', content: `Notes du rendez-vous :\n\n${notes}` },
    ],
  };
  if (structured) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'meeting_summary', strict: true, schema: SCHEMA },
    };
  }
  try {
    return await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Agence MVP' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const timeout = (e as Error).name === 'TimeoutError';
    throw new FnError(
      timeout ? 'L’IA a mis trop de temps à répondre. Réessaie.' : 'Impossible de joindre le service d’IA.',
      503,
      timeout ? 'timeout' : 'provider_down',
    );
  }
}

async function summarize(notes: string, today: string): Promise<Result> {
  // 1er essai en sortie structurée ; si le fournisseur refuse response_format (400),
  // second essai avec le seul prompt strict. Le parsing reste défensif dans les deux cas.
  let res = await callOpenRouter(notes, today, true);
  if (res.status === 400) {
    console.warn('summarize-meeting: response_format refusé, repli sur le prompt seul');
    await res.body?.cancel();
    res = await callOpenRouter(notes, today, false);
  }
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    console.error('summarize-meeting: OpenRouter HTTP', res.status, detail);
    throw openRouterError(res.status, detail);
  }

  // deno-lint-ignore no-explicit-any
  const data: any = await res.json().catch(() => null);
  // OpenRouter peut répondre 200 avec un objet `error` (erreur du fournisseur en cours de route).
  if (data?.error) {
    const code = Number(data.error.code) || 502;
    console.error('summarize-meeting: erreur fournisseur', code, String(data.error.message ?? '').slice(0, 200));
    throw openRouterError(code, String(data.error.message ?? '').slice(0, 200));
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new FnError('Réponse vide de l’IA. Réessaie.', 502, 'invalid_output');
  }
  try {
    return parseResult(content);
  } catch (e) {
    console.error('summarize-meeting: JSON invalide', (e as Error).message);
    throw new FnError('L’IA a renvoyé une réponse illisible. Réessaie.', 502, 'invalid_output');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.', code: 'method' }, 405);

  try {
    // 1. Authentification : JWT Supabase de l'appelant.
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) throw new FnError('Non authentifié.', 401, 'unauthenticated');
    let supabase;
    try {
      supabase = createClient(Deno.env.get('SUPABASE_URL')!, projectKey(), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } catch (e) {
      console.error('summarize-meeting: configuration', (e as Error).message);
      throw new FnError('Fonction mal configurée.', 500, 'config');
    }
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userError || !userId) throw new FnError('Session invalide ou expirée. Reconnecte-toi.', 401, 'unauthenticated');

    // 2. Autorisation (coût OpenRouter) : seuls les comptes listés dans le
    // secret peuvent appeler la fonction ; secret absent = personne (comme
    // qonto-sync), pour qu'un compte créé par un inconnu ne vide pas le crédit.
    const allowed = (Deno.env.get('SUMMARIZE_ALLOWED_USER_IDS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!allowed.includes(userId)) {
      throw new FnError('Compte non autorisé à utiliser le résumé IA.', 403, 'forbidden');
    }

    // 3. Entrée.
    // deno-lint-ignore no-explicit-any
    const input: any = await req.json().catch(() => null);
    const notes = typeof input?.notes === 'string' ? input.notes.trim() : '';
    if (!notes) throw new FnError('Les notes du RDV sont vides.', 400, 'empty');
    if (notes.length > MAX_INPUT_CHARS) {
      throw new FnError(`Notes trop longues (${notes.length} caractères, ${MAX_INPUT_CHARS} max).`, 413, 'too_long');
    }
    // Date locale de l'appareil (pour « vendredi », « dans 15 jours ») ; à défaut, date UTC.
    const today = isDateKey(input?.today) ? input.today : new Date().toISOString().slice(0, 10);

    // 4. Appel IA. Le contenu des notes n'est jamais journalisé.
    return json(await summarize(notes, today));
  } catch (e) {
    if (e instanceof FnError) return json({ error: e.message, code: e.code }, e.status);
    console.error('summarize-meeting: erreur inattendue', (e as Error).message);
    return json({ error: 'Erreur inattendue pendant le résumé.', code: 'internal' }, 500);
  }
});
