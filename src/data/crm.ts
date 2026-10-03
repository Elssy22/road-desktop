import type { BaseRow } from './base';

// CRM : types et constantes métier repris de mobile-legacy/src/db/crmDb.ts
// (tables `contacts` et `interactions`).

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
