import type { SQLiteDatabase } from 'expo-sqlite';

import {
  detachWhereInTx,
  fromSqlRow,
  getRow,
  insertRow,
  softDeleteRowInTx,
  softDeleteWhereInTx,
  updateRow,
  updateRowInTx,
  type BaseRow,
  type EntitySpec,
  type Fields,
} from './entityTable';
import { APPOINTMENTS } from './appointmentsDb';
import { DOCUMENTS } from './documentsDb';
import { KEY_DATES } from './keyDatesDb';
import { softDeleteContactTasksInTx } from './localDb';
import { MONEY_ITEMS } from './moneyDb';
import { REMINDERS } from './remindersDb';

// CRM : tables `contacts` et `interactions` (migration locale v4).

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

export const CONTACTS: EntitySpec<Contact> = {
  entity: 'contacts',
  columns: {
    name: 'text',
    role: 'text',
    club: 'text',
    phone: 'text',
    email: 'text',
    notes: 'text',
    segment: 'text',
    pipeline_stage: 'text',
    pipeline_amount: 'num',
    next_followup_date: 'date',
    stage_changed_at: 'ts',
  },
};

export const INTERACTIONS: EntitySpec<Interaction> = {
  entity: 'interactions',
  columns: { contact_id: 'text', type: 'text', summary: 'text', happened_at: 'ts' },
};

export const ROLE_SUGGESTIONS = ['Créateur', 'Club', 'Coach', 'Agent', 'Société', 'Association'];
/** « deck » : envoi du deck, compte comme un contact dans les relances (lib/crmFollowups.ts). */
export const INTERACTION_TYPES = ['appel', 'mail', 'deck', 'rdv', 'autre'] as const;

/** Contact + date de la dernière interaction (null s'il n'y en a jamais eu). */
export type ContactWithLast = Contact & { last_interaction_at: string | null };

export async function listContacts(db: SQLiteDatabase, userId: string): Promise<ContactWithLast[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT c.*, (
       SELECT MAX(i.happened_at) FROM interactions i
       WHERE i.contact_id = c.id AND i.deleted_at IS NULL
     ) AS last_interaction_at
     FROM contacts c
     WHERE c.user_id = ? AND c.deleted_at IS NULL
     ORDER BY c.name COLLATE NOCASE`,
    userId
  );
  return rows.map((r) => ({
    ...fromSqlRow(CONTACTS, r),
    last_interaction_at: (r.last_interaction_at as string | null) ?? null,
  }));
}

export const getContact = (db: SQLiteDatabase, id: string) => getRow(db, CONTACTS, id);

/** Plus récentes d'abord. */
export async function listInteractions(db: SQLiteDatabase, contactId: string): Promise<Interaction[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM interactions WHERE contact_id = ? AND deleted_at IS NULL
     ORDER BY happened_at DESC`,
    contactId
  );
  return rows.map((r) => fromSqlRow(INTERACTIONS, r));
}

export const addContact = (db: SQLiteDatabase, userId: string, fields: Fields<Contact>) =>
  insertRow(db, CONTACTS, userId, fields);

/** Change l'étape de prospection (null = « client actif », sorti du pipeline). */
export const setPipelineStage = (db: SQLiteDatabase, contact: Contact, stage: PipelineStage | null) =>
  updateRow(db, CONTACTS, contact, stageFields(contact, stage));

export const addInteraction =(db: SQLiteDatabase, userId: string, fields: Fields<Interaction>) =>
  insertRow(db, INTERACTIONS, userId, fields);

/**
 * Supprime le contact, son historique et ses relances automatiques ; les dates
 * clés, lignes financières et documents du coffre, rappels et rendez-vous liés
 * sont conservés mais détachés.
 */
export async function softDeleteContact(db: SQLiteDatabase, contact: Pick<Contact, 'id' | 'user_id'>) {
  await db.withTransactionAsync(() => softDeleteContactInTx(db, contact));
}

async function softDeleteContactInTx(db: SQLiteDatabase, contact: Pick<Contact, 'id' | 'user_id'>) {
  await softDeleteWhereInTx(db, INTERACTIONS, 'contact_id', contact.id);
  await softDeleteContactTasksInTx(db, contact.id);
  await detachWhereInTx(db, MONEY_ITEMS, 'contact_id', contact.id);
  await detachWhereInTx(db, DOCUMENTS, 'contact_id', contact.id);
  await detachWhereInTx(db, REMINDERS, 'contact_id', contact.id);
  await detachWhereInTx(db, APPOINTMENTS, 'contact_id', contact.id);
  const keyDates = await db.getAllAsync<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM key_dates WHERE contact_id = ? AND deleted_at IS NULL',
    contact.id
  );
  for (const k of keyDates) await updateRowInTx(db, KEY_DATES, k, { contact_id: null });
  await softDeleteRowInTx(db, CONTACTS, contact);
}

/**
 * Purge RGPD (DECISIONS.md §32) : comme softDeleteContact, mais les données
 * personnelles sont d'abord effacées. La suppression reste logique (tombstone
 * propagé par la sync, cf. §5) : seuls l'id, les dates et l'étape survivent,
 * sur l'appareil comme côté Supabase. Interactions et tâches déjà supprimées
 * sont anonymisées aussi.
 */
export async function purgeContacts(db: SQLiteDatabase, contacts: Pick<Contact, 'id' | 'user_id'>[]) {
  await db.withTransactionAsync(async () => {
    for (const contact of contacts) {
      const interactions = await db.getAllAsync<{ id: string; user_id: string }>(
        'SELECT id, user_id FROM interactions WHERE contact_id = ?',
        contact.id
      );
      for (const i of interactions) await updateRowInTx(db, INTERACTIONS, i, { summary: '' });
      await softDeleteContactTasksInTx(db, contact.id, true);
      await updateRowInTx(db, CONTACTS, contact, {
        name: '',
        role: '',
        club: null,
        phone: null,
        email: null,
        notes: null,
        pipeline_amount: null,
      });
      await softDeleteContactInTx(db, contact);
    }
  });
}

/** Prospect + jours utiles au calcul de rétention (lib/crmRetention.ts). */
export type RetentionRow = Contact & { last_interaction_at: string | null; last_appointment_at: string | null };

/** Prospects (étape renseignée) avec leur dernière interaction et leur dernier RDV. */
export async function listProspectsForRetention(db: SQLiteDatabase, userId: string): Promise<RetentionRow[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT c.*,
       (SELECT MAX(i.happened_at) FROM interactions i
        WHERE i.contact_id = c.id AND i.deleted_at IS NULL) AS last_interaction_at,
       (SELECT MAX(a.start_at) FROM appointments a
        WHERE a.contact_id = c.id AND a.deleted_at IS NULL) AS last_appointment_at
     FROM contacts c
     WHERE c.user_id = ? AND c.deleted_at IS NULL AND c.pipeline_stage IS NOT NULL`,
    userId
  );
  return rows.map((r) => ({
    ...fromSqlRow(CONTACTS, r),
    last_interaction_at: (r.last_interaction_at as string | null) ?? null,
    last_appointment_at: (r.last_appointment_at as string | null) ?? null,
  }));
}
