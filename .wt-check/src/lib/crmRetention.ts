import type { DateKey } from './dates';

// Durée de conservation des prospects (registre RGPD, DECISIONS.md §32), reprise
// de regista-dashboard (lib/crm/retention.ts) : un prospect non signé sans aucun
// signe de vie depuis 3 ans (création, changement d'étape, interaction, RDV)
// devient candidat à la purge. Jamais supprimé automatiquement : l'écran
// « Purge RGPD » le liste et Landry confirme chaque suppression.

export const PROSPECT_RETENTION_YEARS = 3;

export type RetentionContact = {
  id: string;
  pipeline_stage: string | null;
  created_day: DateKey;
  stage_changed_day: DateKey | null;
  last_interaction_day: DateKey | null;
  last_appointment_day: DateKey | null;
};

/** Date limite : un dernier signe de vie strictement antérieur est trop ancien. */
export function retentionCutoff(today: DateKey): DateKey {
  const [y, m, d] = today.split('-');
  return `${Number(y) - PROSPECT_RETENTION_YEARS}-${m}-${d}`;
}

/** Jour du dernier signe de vie. */
export function lastSignOfLife(c: RetentionContact): DateKey {
  return [c.created_day, c.stage_changed_day, c.last_interaction_day, c.last_appointment_day]
    .filter((d): d is DateKey => d !== null)
    .reduce((max, d) => (d > max ? d : max));
}

/** Prospects candidats à la purge (étape renseignée, hors Signé), du plus ancien au plus récent. */
export function purgeCandidates<T extends RetentionContact>(
  contacts: T[],
  today: DateKey
): (T & { last_sign_day: DateKey })[] {
  const cutoff = retentionCutoff(today);
  return contacts
    .filter((c) => c.pipeline_stage !== null && c.pipeline_stage !== 'signe')
    .map((c) => ({ ...c, last_sign_day: lastSignOfLife(c) }))
    .filter((c) => c.last_sign_day < cutoff)
    .sort((a, b) => a.last_sign_day.localeCompare(b.last_sign_day));
}
