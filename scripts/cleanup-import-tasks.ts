// Nettoyage des relances « Envoyer le deck » nées de l'import de contacts du
// 2026-10-04 (bug B1, DECISIONS.md §36). À lancer par Landry, connecté avec son
// propre compte : la RLS limite tout à ses lignes, aucune clé service_role.
//
// Lancement (Node ≥ 23, qui exécute le TypeScript directement), depuis la racine :
//   ROAD_EMAIL=… ROAD_PASSWORD=… node scripts/cleanup-import-tasks.ts            # lecture seule
//   ROAD_EMAIL=… ROAD_PASSWORD=… node scripts/cleanup-import-tasks.ts --apply --expect=279
// Options : --day=AAAA-MM-JJ (jour de l'import, 2026-10-04 par défaut).
// Les variables VITE_SUPABASE_* sont lues dans .env.local.
//
// Contacts importés = contacts vivants créés ce jour-là (UTC) dont `stage_changed_at` est
// partagé par au moins MIN_BATCH contacts : l'import pose le même instant sur tout le fichier,
// une création à la main a le sien. Le rapport (sans nom ni titre) est écrit dans
// claude_cleanup_import_tasks.json (ignoré par git).
//
// --apply, et seulement si le nombre de contacts importés vaut --expect :
// 1. « Envoyer le deck » ouvertes de ces contacts → suppression logique (deleted_at),
//    auto_kind conservé : le mobile y voit une étape sautée et ne la recrée pas ;
// 2. contacts « À démarcher » sans tâche deck → tâche deck déjà supprimée, même id que le
//    mobile (lib/followupTaskId.ts), pour qu'il ne la crée pas à sa prochaine ouverture ;
// 3. contacts « Deck envoyé » → stage_changed_at effacé : sinon la relance 1 serait créée
//    pour chacun à J+5 (même règle que les nouveaux imports).
// Aucune autre tâche n'est touchée, jamais de DELETE.

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

import { autoTaskId } from '../src/lib/followupTaskId.ts';

const MIN_BATCH = 10;
const OUT = 'claude_cleanup_import_tasks.json';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const apply = process.argv.includes('--apply');
const day = arg('day') ?? '2026-10-04';
const expect = arg('expect');

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')])
);
const { ROAD_EMAIL, ROAD_PASSWORD } = process.env;
if (!ROAD_EMAIL || !ROAD_PASSWORD) throw new Error('ROAD_EMAIL et ROAD_PASSWORD requis.');
if (apply && !expect) throw new Error('--apply exige --expect=<nombre de contacts importés attendu>.');

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const check = <T>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message);
  return data as T;
};

const { user } = check(await supabase.auth.signInWithPassword({ email: ROAD_EMAIL, password: ROAD_PASSWORD }));
const userId = user!.id;

type ContactRow = { id: string; pipeline_stage: string | null; stage_changed_at: string | null; created_at: string };
type TaskRow = { id: string; contact_id: string; auto_kind: string; done: boolean; deleted_at: string | null; created_at: string; due_date: string | null };

const contactsOfDay = check(
  await supabase
    .from('contacts')
    .select('id, pipeline_stage, stage_changed_at, created_at')
    .is('deleted_at', null)
    .gte('created_at', `${day}T00:00:00Z`)
    .lt('created_at', `${day}T23:59:59.999Z`)
    .order('id')
    .range(0, 9999)
) as ContactRow[];

const perStamp = new Map<string, number>();
for (const c of contactsOfDay) {
  if (c.stage_changed_at) perStamp.set(c.stage_changed_at, (perStamp.get(c.stage_changed_at) ?? 0) + 1);
}
const imported = contactsOfDay.filter((c) => c.stage_changed_at && (perStamp.get(c.stage_changed_at) ?? 0) >= MIN_BATCH);
const importedIds = new Set(imported.map((c) => c.id));

// Toutes les tâches automatiques de ces contacts, supprimées comprises (par paquets : URL courte).
const autoTasks: TaskRow[] = [];
const ids = [...importedIds];
for (let i = 0; i < ids.length; i += 100) {
  autoTasks.push(
    ...(check(
      await supabase
        .from('tasks')
        .select('id, contact_id, auto_kind, done, deleted_at, created_at, due_date')
        .in('contact_id', ids.slice(i, i + 100))
        .not('auto_kind', 'is', null)
    ) as TaskRow[])
  );
}

const openDeck = autoTasks.filter((t) => t.auto_kind === 'deck' && !t.done && t.deleted_at === null);
const withDeck = new Set(autoTasks.filter((t) => t.auto_kind === 'deck').map((t) => t.contact_id));
const needTombstone = imported.filter((c) => c.pipeline_stage === 'a_demarcher' && !withDeck.has(c.id));
const deckSent = imported.filter((c) => c.pipeline_stage === 'deck_envoye');
const otherOpen = autoTasks.filter((t) => t.auto_kind !== 'deck' && !t.done && t.deleted_at === null);

// Aperçu anonymisé : ni nom ni titre, ids tronqués.
const short = (id: string) => `${id.slice(0, 8)}…`;
const contactIndex = new Map(imported.map((c, i) => [c.id, i + 1]));
const report = {
  generated_at: new Date().toISOString(),
  mode: apply ? 'apply' : 'read-only',
  import_day: day,
  contacts_created_that_day: contactsOfDay.length,
  imported_contacts: imported.length,
  imported_by_stage: Object.fromEntries(
    [...new Set(imported.map((c) => c.pipeline_stage ?? 'aucune'))].map((s) => [
      s,
      imported.filter((c) => (c.pipeline_stage ?? 'aucune') === s).length,
    ])
  ),
  open_deck_tasks_to_soft_delete: openDeck.length,
  deck_tombstones_to_insert: needTombstone.length,
  deck_sent_contacts_to_reset: deckSent.length,
  other_open_auto_tasks_untouched: otherOpen.length,
  preview: openDeck.slice(0, 5).map((t) => ({
    task: short(t.id),
    title: `Envoyer le deck à <contact importé n° ${contactIndex.get(t.contact_id)}>`,
    auto_kind: t.auto_kind,
    due_date: t.due_date,
    created_at: t.created_at,
  })),
  applied: null as null | Record<string, number>,
};

if (apply) {
  if (String(imported.length) !== expect) {
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    throw new Error(`Contacts importés trouvés : ${imported.length}, attendu : ${expect}. Rien n'a été modifié.`);
  }
  const ts = new Date().toISOString();
  let softDeleted = 0;
  for (let i = 0; i < openDeck.length; i += 100) {
    const rows = check(
      await supabase
        .from('tasks')
        .update({ deleted_at: ts, updated_at: ts })
        .in('id', openDeck.slice(i, i + 100).map((t) => t.id))
        .eq('auto_kind', 'deck')
        .is('deleted_at', null)
        .select('id')
    ) as { id: string }[];
    softDeleted += rows.length;
  }
  const tombstones = await Promise.all(
    needTombstone.map(async (c) => ({
      id: await autoTaskId(userId, c.id, 'deck'),
      title: 'Envoyer le deck',
      done: false,
      due_date: null,
      priority: 1,
      contact_id: c.id,
      auto_kind: 'deck',
      created_at: ts,
      updated_at: ts,
      deleted_at: ts,
    }))
  );
  let inserted = 0;
  for (let i = 0; i < tombstones.length; i += 100) {
    // ignoreDuplicates : une tâche du même id créée entre-temps par le mobile n'est pas écrasée.
    const rows = check(
      await supabase
        .from('tasks')
        .upsert(tombstones.slice(i, i + 100), { onConflict: 'id', ignoreDuplicates: true })
        .select('id')
    ) as { id: string }[];
    inserted += rows.length;
  }
  let reset = 0;
  for (let i = 0; i < deckSent.length; i += 100) {
    const rows = check(
      await supabase
        .from('contacts')
        .update({ stage_changed_at: null, updated_at: ts })
        .in('id', deckSent.slice(i, i + 100).map((c) => c.id))
        .select('id')
    ) as { id: string }[];
    reset += rows.length;
  }
  report.applied = { deck_tasks_soft_deleted: softDeleted, deck_tombstones_inserted: inserted, deck_sent_contacts_reset: reset };
}

writeFileSync(OUT, JSON.stringify(report, null, 2));
const { preview: _preview, ...summary } = report;
console.log(JSON.stringify(summary, null, 2));
console.log(`Rapport complet : ${OUT}`);
await supabase.auth.signOut();
