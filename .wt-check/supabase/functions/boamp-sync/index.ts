// Edge Function `boamp-sync` : cherche les appels d'offres pertinents pour
// l'agence dans le BOAMP (API Opendatasoft ouverte, sans clé) et les ajoute à
// public.tender_offers. Les mots-clés viennent de public.veille_settings,
// modifiables dans l'app (cf. DECISIONS.md §33).
//
// Déploiement : supabase functions deploy boamp-sync
// Aucun secret à configurer (API publique ; SUPABASE_URL et la clé service role
// sont fournies par Supabase).
//
// Filtre (vérifié le 2026-10-03, repris de regista-dashboard) : avis de marché
// (pas les résultats ni les rectificatifs), marchés de services, objet contenant
// un mot « sport » ET (un mot « activité » OU la catégorie officielle
// « Publicité, Communication »). Sans ce double filtre, « football » seul remonte
// surtout des travaux de vestiaires et de terrains.

import { createClient } from 'npm:@supabase/supabase-js@2';

const BOAMP_API = 'https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records';
/** Plafond de l'API Explore v2.1 pour `limit`. */
const PAGE_SIZE = 100;
const MAX_RECORDS = 500;
const COMMUNICATION_CATEGORY = 'Publicité, Communication';
/** Première synchro, ou mots-clés changés depuis la dernière : on relit un mois d'avis. */
const FULL_WINDOW_DAYS = 30;
/** Recouvrement avec la synchro précédente (avis publiés tard) ; les doublons sont ignorés. */
const OVERLAP_DAYS = 3;
/** Garde-fou contre les appuis répétés sur « Synchroniser ». */
const COOLDOWN_MS = 30_000;
const MAX_KEYWORDS = 30;
const MAX_KEYWORD_LENGTH = 60;
const UPSERT_CHUNK = 200;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

type BoampRecord = {
  idweb: string | null;
  objet: string | null;
  nomacheteur: string | null;
  dateparution: string | null;
  datelimitereponse: string | null;
  url_avis: string | null;
  descripteur_libelle: string[] | null;
  procedure_libelle: string | null;
  code_departement: string[] | null;
};

type OfferRow = {
  user_id: string;
  source: 'boamp';
  external_id: string;
  buyer: string;
  title: string;
  categories: string[];
  procedure: string | null;
  department: string | null;
  published_on: string | null;
  deadline_at: string | null;
  url: string | null;
};

/** Clé service role : nouvelles clés (SUPABASE_SECRET_KEYS) puis clé historique. */
function serviceKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // format inattendu : repli sur la clé historique
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!legacy) throw new Error('Clé service role introuvable dans l’environnement de la fonction.');
  return legacy;
}

/** Mot-clé utilisable dans la requête ODSQL (guillemets et antislash retirés). */
function cleanKeyword(keyword: unknown): string {
  if (typeof keyword !== 'string') return '';
  return keyword.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_KEYWORD_LENGTH);
}

function cleanKeywords(keywords: unknown): string[] {
  const list = Array.isArray(keywords) ? keywords : [];
  return [...new Set(list.map(cleanKeyword).filter(Boolean))].slice(0, MAX_KEYWORDS);
}

const anyOf = (words: string[]) => `(${words.map((w) => `search(objet, "${w}")`).join(' or ')})`;

function buildWhere(sport: string[], activity: string[], sinceDay: string): string {
  const parts = [
    `dateparution >= "${sinceDay}"`,
    `nature_libelle = "Avis de marché"`,
    `type_marche = "SERVICES"`,
    anyOf(sport),
    activity.length
      ? `(${anyOf(activity)} or descripteur_libelle = "${COMMUNICATION_CATEGORY}")`
      : `descripteur_libelle = "${COMMUNICATION_CATEGORY}"`,
  ];
  return parts.join(' and ');
}

function safeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Avis BOAMP → ligne tender_offers ; null si inutilisable ou date limite déjà passée. */
function mapRecord(r: BoampRecord, userId: string, now: number): OfferRow | null {
  const title = r.objet?.trim();
  if (!r.idweb || !title) return null;
  const deadline = r.datelimitereponse ? new Date(r.datelimitereponse) : null;
  const deadlineAt = deadline && !Number.isNaN(deadline.getTime()) ? deadline : null;
  if (deadlineAt && deadlineAt.getTime() < now) return null;
  return {
    user_id: userId,
    source: 'boamp',
    external_id: r.idweb,
    buyer: r.nomacheteur?.trim() || 'Acheteur non précisé',
    title,
    categories: r.descripteur_libelle ?? [],
    procedure: r.procedure_libelle,
    department: r.code_departement?.[0] ?? null,
    published_on: r.dateparution,
    deadline_at: deadlineAt?.toISOString() ?? null,
    url: safeUrl(r.url_avis) ?? `https://www.boamp.fr/pages/avis/?q=idweb:${encodeURIComponent(r.idweb)}`,
  };
}

async function fetchOffers(where: string, userId: string): Promise<OfferRow[]> {
  const now = Date.now();
  const offers: OfferRow[] = [];
  for (let offset = 0; offset < MAX_RECORDS; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      where,
      limit: String(PAGE_SIZE),
      offset: String(offset),
      order_by: 'dateparution desc',
      select:
        'idweb, objet, nomacheteur, dateparution, datelimitereponse, url_avis, descripteur_libelle, procedure_libelle, code_departement',
    });
    const res = await fetch(`${BOAMP_API}?${params}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new Error(`BOAMP indisponible (HTTP ${res.status})${detail ? ` — ${detail}` : ''}`);
    }
    const body = (await res.json()) as { total_count?: number; results?: BoampRecord[] };
    const results = body.results ?? [];
    for (const record of results) {
      const offer = mapRecord(record, userId, now);
      if (offer) offers.push(offer);
    }
    if (results.length < PAGE_SIZE || offset + PAGE_SIZE >= (body.total_count ?? 0)) break;
  }
  return offers;
}

/** Jour calendaire YYYY-MM-DD à Paris, `days` jours avant `from`. */
function parisDay(from: Date, days = 0): string {
  const shifted = new Date(from.getTime() - days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(shifted);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  // 1. Authentification : JWT Supabase de l'appelant.
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Non authentifié.' }, 401);

  let admin;
  try {
    admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (e) {
    console.error('boamp-sync: configuration', (e as Error).message);
    return json({ error: 'Fonction mal configurée.' }, 500);
  }

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return json({ error: 'Session invalide ou expirée.' }, 401);

  // 2. Réglages : créés avec les valeurs par défaut à la première utilisation.
  // Pas de liste d'utilisateurs autorisés (contrairement à Qonto) : les données
  // BOAMP sont publiques et chacun n'écrit que ses propres lignes.
  const { error: initError } = await admin
    .from('veille_settings')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
  const { data: settings, error: readError } = await admin
    .from('veille_settings')
    .select('sport_keywords, activity_keywords, last_run_at, last_run_status, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (initError || readError || !settings) {
    console.error('boamp-sync: réglages', (initError ?? readError)?.message);
    return json({ error: 'Réglages de veille illisibles (migration 015 appliquée ?).' }, 500);
  }

  const lastRun = settings.last_run_at ? new Date(settings.last_run_at) : null;
  if (lastRun && settings.last_run_status === 'ok' && Date.now() - lastRun.getTime() < COOLDOWN_MS) {
    return json({ error: 'Synchronisation déjà faite à l’instant, réessaie dans quelques secondes.' }, 429);
  }

  const sport = cleanKeywords(settings.sport_keywords);
  const activity = cleanKeywords(settings.activity_keywords);
  if (sport.length === 0) {
    return json({ error: 'Ajoute au moins un mot-clé « sport » dans les réglages de la veille.' }, 400);
  }

  // 3. Fenêtre : depuis la dernière synchro réussie (avec recouvrement), ou un
  // mois si c'est la première ou si les mots-clés ont changé depuis.
  const keywordsChanged = lastRun && new Date(settings.updated_at).getTime() > lastRun.getTime();
  const sinceDay =
    lastRun && !keywordsChanged ? parisDay(lastRun, OVERLAP_DAYS) : parisDay(new Date(), FULL_WINDOW_DAYS);

  const syncedAt = new Date().toISOString();
  try {
    const offers = await fetchOffers(buildWhere(sport, activity, sinceDay), userId);
    let added = 0;
    // Avis déjà connus ignorés : leur statut (et toute modification faite dans
    // l'app) n'est jamais écrasé par une synchro.
    for (let i = 0; i < offers.length; i += UPSERT_CHUNK) {
      const { data, error } = await admin
        .from('tender_offers')
        .upsert(offers.slice(i, i + UPSERT_CHUNK), {
          onConflict: 'user_id,source,external_id',
          ignoreDuplicates: true,
        })
        .select('id');
      if (error) throw new Error(`Base : ${error.message}`);
      added += data?.length ?? 0;
    }
    await admin
      .from('veille_settings')
      .update({ last_run_at: syncedAt, last_run_status: 'ok', last_run_message: null })
      .eq('user_id', userId);
    return json({ added, found: offers.length, since: sinceDay, synced_at: syncedAt });
  } catch (e) {
    const message = (e as Error).message;
    console.error('boamp-sync:', message);
    await admin
      .from('veille_settings')
      .update({ last_run_status: 'erreur', last_run_message: message.slice(0, 300) })
      .eq('user_id', userId);
    return json({ error: message }, 502);
  }
});
