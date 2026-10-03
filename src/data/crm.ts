import { supabase } from '../lib/supabase';
import {
  fetchAll,
  insertRow,
  notifyDataChanged,
  softDeleteRow,
  unwrap,
  updateRow,
  type BaseRow,
  type Fields,
} from './base';

// CRM : types et constantes métier repris de mobile-legacy/src/db/crmDb.ts
// (tables `contacts` et `interactions`).

/**
 * Noms des contacts vivants `ids`. Remplace les `LEFT JOIN contacts` du mobile :
 * pas de clé étrangère vers contacts (DECISIONS.md §5), donc pas d'embarquement PostgREST.
 */
export async function contactNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = unwrap(
    await supabase.from('contacts').select('id, name').in('id', unique).is('deleted_at', null)
  ) as { id: string; name: string }[];
  return new Map(rows.map((r) => [r.id, r.name]));
}

export type Contact = BaseRow & {
  name: string;
  /** Texte libre : « Créateur », « Club », « Coach », « Société »… */
  role: string;
  club: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  /** Type de relation commerciale (migration v13), cf. SEGMENTS. */
  segment: ContactSegment | null;
  /** Étape de prospection ; null = contact hors pipeline (client, partenaire…). */
  pipeline_stage: PipelineStage | null;
  /** Montant potentiel du deal, en euros. */
  pipeline_amount: number | null;
  /** Prochaine relance prévue, YYYY-MM-DD. */
  next_followup_date: string | null;
  /** Dernier changement d'étape (instant ISO) ; le trigger serveur fait foi. */
  stage_changed_at: string | null;
};

export const SEGMENTS = [
  'club_amateur',
  'club_pro',
  'marque',
  'agence',
  'joueur',
  'createur_contenu',
  'ligue',
  'district',
  'artiste',
  'organisme_etat',
  'subvention',
  'mecene',
  'sponsor',
  'autre',
] as const;
export type ContactSegment = (typeof SEGMENTS)[number];

// « Joueurs » : segment de relation commerciale validé (DECISIONS.md §31), seul
// emploi autorisé de ce mot dans l'app.
export const SEGMENT_LABELS: Record<ContactSegment, string> = {
  club_amateur: 'Club amateur',
  club_pro: 'Club pro',
  marque: 'Marque',
  agence: 'Agence',
  joueur: 'Joueurs',
  createur_contenu: 'Créateurs de contenus',
  ligue: 'Ligue',
  district: 'District',
  artiste: 'Artiste',
  organisme_etat: 'Organisme d’État',
  subvention: 'Subvention',
  mecene: 'Mécène',
  sponsor: 'Sponsor',
  autre: 'Autre',
};

/** Colonnes du pipeline, dans l'ordre d'affichage. */
export const PIPELINE_STAGES = ['a_demarcher', 'deck_envoye', 'a_relancer', 'signe', 'perdu'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  a_demarcher: 'À démarcher',
  deck_envoye: 'Deck envoyé',
  a_relancer: 'À relancer',
  signe: 'Signé',
  perdu: 'Perdu',
};

/** Valeur lue en base → segment connu (une valeur inattendue est ignorée). */
export const segmentLabel = (s: string | null) =>
  s && s in SEGMENT_LABELS ? SEGMENT_LABELS[s as ContactSegment] : null;

/**
 * Champs à écrire pour passer à l'étape `next` (null = sortir du pipeline) :
 * stage_changed_at n'avance que si l'étape change vraiment.
 */
export function stageFields(
  current: Pick<Contact, 'pipeline_stage' | 'stage_changed_at'> | null,
  next: PipelineStage | null
): Pick<Contact, 'pipeline_stage' | 'stage_changed_at'> {
  const prev = current?.pipeline_stage ?? null;
  if (prev === next) return { pipeline_stage: next, stage_changed_at: current?.stage_changed_at ?? null };
  return { pipeline_stage: next, stage_changed_at: new Date().toISOString() };
}

export type Interaction = BaseRow & {
  contact_id: string;
  /** Texte libre ; l'app propose « appel », « rdv », « mail », « autre ». */
  type: string;
  summary: string;
  /** Instant ISO de l'échange (timestamptz). */
  happened_at: string;
};

export const ROLE_SUGGESTIONS = ['Créateur', 'Club', 'Coach', 'Agent', 'Société', 'Association'];
/** « deck » : envoi du deck, compte comme un contact dans les relances (lib/crmFollowups.ts). */
export const INTERACTION_TYPES = ['appel', 'mail', 'deck', 'rdv', 'autre'] as const;

/** Contact + date de la dernière interaction (null s'il n'y en a jamais eu). */
export type ContactWithLast = Contact & { last_interaction_at: string | null };

// --- Lectures ----------------------------------------------------------------

const CONTACTS = 'contacts';
const INTERACTIONS = 'interactions';

/** Instant le plus récent de `column` par contact (remplace les sous-requêtes MAX du mobile). */
async function latestByContact(table: string, column: string): Promise<Map<string, string>> {
  type Row = { contact_id: string; at: string | null };
  const rows = await fetchAll<Row>((from, to) =>
    supabase
      .from(table)
      .select(`contact_id, at:${column}`)
      .is('deleted_at', null)
      .not('contact_id', 'is', null)
      .order('id')
      .range(from, to)
      .overrideTypes<Row[], { merge: false }>()
  );
  const latest = new Map<string, string>();
  for (const { contact_id: id, at } of rows) {
    if (!at) continue;
    const prev = latest.get(id);
    // Comparaison en instants : les ISO renvoyés par Postgres n'ont pas tous le même format.
    if (!prev || Date.parse(at) > Date.parse(prev)) latest.set(id, at);
  }
  return latest;
}

/** Contacts vivants avec leur dernière interaction, par nom (insensible à la casse). */
export async function listContacts(): Promise<ContactWithLast[]> {
  const [contacts, last] = await Promise.all([
    fetchAll<Contact>((from, to) => supabase.from(CONTACTS).select('*').is('deleted_at', null).order('id').range(from, to)),
    latestByContact(INTERACTIONS, 'happened_at'),
  ]);
  return contacts
    .map((c) => ({ ...c, last_interaction_at: last.get(c.id) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}

/** Contact vivant, ou null s'il n'existe pas ou a été supprimé. */
export async function getContact(id: string): Promise<Contact | null> {
  return unwrap(await supabase.from(CONTACTS).select('*').eq('id', id).is('deleted_at', null).maybeSingle());
}

/** Interactions d'un contact, les plus récentes d'abord. */
export const listInteractions = (contactId: string): Promise<Interaction[]> =>
  fetchAll<Interaction>((from, to) =>
    supabase
      .from(INTERACTIONS)
      .select('*')
      .eq('contact_id', contactId)
      .is('deleted_at', null)
      .order('happened_at', { ascending: false })
      .order('id')
      .range(from, to)
  );

export type AutoTask = { id: string; title: string; due_date: string | null };

/** Relance automatique en cours du contact (DECISIONS.md §32), la plus proche d'abord. */
export async function getOpenAutoTask(contactId: string): Promise<AutoTask | null> {
  const rows = unwrap(
    await supabase
      .from('tasks')
      .select('id, title, due_date')
      .eq('contact_id', contactId)
      .not('auto_kind', 'is', null)
      .is('deleted_at', null)
      .eq('done', false)
      .order('due_date', { nullsFirst: false })
      .limit(1)
  ) as AutoTask[];
  return rows[0] ?? null;
}

/** Prospect + instants utiles au calcul de rétention (lib/crmRetention.ts). */
export type RetentionRow = Contact & { last_interaction_at: string | null; last_appointment_at: string | null };

/** Prospects (étape renseignée) avec leur dernière interaction et leur dernier RDV. */
export async function listProspectsForRetention(): Promise<RetentionRow[]> {
  const [prospects, interactions, appointments] = await Promise.all([
    fetchAll<Contact>((from, to) =>
      supabase
        .from(CONTACTS)
        .select('*')
        .is('deleted_at', null)
        .not('pipeline_stage', 'is', null)
        .order('id')
        .range(from, to)
    ),
    latestByContact(INTERACTIONS, 'happened_at'),
    latestByContact('appointments', 'start_at'),
  ]);
  return prospects.map((c) => ({
    ...c,
    last_interaction_at: interactions.get(c.id) ?? null,
    last_appointment_at: appointments.get(c.id) ?? null,
  }));
}

// --- Écritures ---------------------------------------------------------------

export const addContact = (fields: Fields<Contact>) => insertRow(CONTACTS, fields);

export const updateContact = (id: string, patch: Partial<Fields<Contact>>) => updateRow(CONTACTS, id, patch);

/** Change l'étape de prospection (null = « client actif », sorti du pipeline). */
export const setPipelineStage = (contact: Contact, stage: PipelineStage | null) =>
  updateRow(CONTACTS, contact.id, stageFields(contact, stage));

export const addInteraction = (fields: Fields<Interaction>) => insertRow(INTERACTIONS, fields);

export const softDeleteInteraction = (id: string) => softDeleteRow(INTERACTIONS, id);

/** Tables dont le lien facultatif vers un contact est détaché à sa suppression. */
const DETACHED_ON_DELETE = ['money_items', 'documents', 'reminders', 'appointments', 'key_dates'];

/**
 * Supprime le contact, son historique et ses tâches rattachées (relances
 * automatiques) ; dates clés, finances, documents, rappels et RDV liés sont
 * conservés mais détachés. Pas de transaction via PostgREST : le contact est
 * supprimé en dernier, une erreur en route laisse donc la fiche visible et la
 * suppression peut être relancée.
 */
export async function softDeleteContact(contactId: string) {
  try {
    await deleteContactRows(contactId, false);
  } finally {
    notifyDataChanged();
  }
}

/**
 * Purge RGPD (DECISIONS.md §32) : comme softDeleteContact, mais les données
 * personnelles sont d'abord effacées (nom, coordonnées, notes, montant ;
 * résumés des interactions et titres des tâches, lignes déjà supprimées
 * comprises). Restent l'id, les dates, le segment et l'étape.
 */
export async function purgeContacts(contactIds: string[]) {
  try {
    for (const id of contactIds) await deleteContactRows(id, true);
  } finally {
    // Même après un échec en route, les contacts déjà purgés doivent disparaître de l'écran.
    notifyDataChanged();
  }
}

async function deleteContactRows(contactId: string, anonymize: boolean) {
  const ts = new Date().toISOString();
  const tombstone = { deleted_at: ts, updated_at: ts };
  if (anonymize) {
    unwrap(await supabase.from(INTERACTIONS).update({ summary: '', updated_at: ts }).eq('contact_id', contactId));
    unwrap(await supabase.from('tasks').update({ title: '', updated_at: ts }).eq('contact_id', contactId));
  }
  unwrap(await supabase.from(INTERACTIONS).update(tombstone).eq('contact_id', contactId).is('deleted_at', null));
  unwrap(await supabase.from('tasks').update(tombstone).eq('contact_id', contactId).is('deleted_at', null));
  for (const table of DETACHED_ON_DELETE) {
    unwrap(
      await supabase
        .from(table)
        .update({ contact_id: null, updated_at: ts })
        .eq('contact_id', contactId)
        .is('deleted_at', null)
    );
  }
  const personal = anonymize
    ? { name: '', role: '', club: null, phone: null, email: null, notes: null, pipeline_amount: null }
    : {};
  unwrap(await supabase.from(CONTACTS).update({ ...personal, ...tombstone }).eq('id', contactId));
}
