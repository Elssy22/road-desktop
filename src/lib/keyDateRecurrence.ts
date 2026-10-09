import { fromDateKey, toDateKey, type DateKey } from './dates';

// Échéances récurrentes (déclarations URSSAF, TVA, CFE…), calculées côté client
// (DECISIONS.md §39) : rien n'est régénéré en base. La colonne `date` reste la
// première échéance de la série ; les occurrences suivantes s'en déduisent à la
// lecture, mois après mois, au jour `recurrence_day` (ramené au dernier jour des
// mois plus courts). Les séries annuelles gardent le jour et le mois de `date`.

export type Recurrence = 'monthly' | 'quarterly' | 'yearly';

export const RECURRENCES = ['monthly', 'quarterly', 'yearly'] as const;

/** Libellés du sélecteur du formulaire. */
export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  yearly: 'Annuelle',
};

/** Libellés des lignes de liste (« Tous les mois · le 15 »). */
export const RECURRENCE_SHORT_LABELS: Record<Recurrence, string> = {
  monthly: 'Tous les mois',
  quarterly: 'Tous les trimestres',
  yearly: 'Tous les ans',
};

/** Le jour du mois n'a de sens que pour ces séries (les annuelles suivent `date`). */
export const usesRecurrenceDay = (r: Recurrence | null): r is 'monthly' | 'quarterly' =>
  r === 'monthly' || r === 'quarterly';

const STEP_MONTHS: Record<Recurrence, number> = { monthly: 1, quarterly: 3, yearly: 12 };

export type Series = { date: DateKey; recurrence: Recurrence | null; recurrence_day: number | null };

const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

/** Occurrence n° `n` (0 = mois de `date`), éventuellement antérieure à `date` (cf. occurrences). */
function nth(s: Series & { recurrence: Recurrence }, n: number): DateKey {
  const anchor = fromDateKey(s.date);
  const day = usesRecurrenceDay(s.recurrence) ? (s.recurrence_day ?? anchor.getDate()) : anchor.getDate();
  const months = anchor.getMonth() + n * STEP_MONTHS[s.recurrence];
  const year = anchor.getFullYear() + Math.floor(months / 12);
  const month = months % 12;
  return toDateKey(new Date(year, month, Math.min(day, daysInMonth(year, month))));
}

/**
 * Occurrences de la série à partir de `from` inclus, dans l'ordre. Jamais avant
 * `date` : avec un jour du mois antérieur à celui de `date`, la série démarre le mois suivant.
 */
function* occurrences(s: Series & { recurrence: Recurrence }, from: DateKey): Generator<DateKey> {
  const start = from > s.date ? from : s.date;
  const a = fromDateKey(s.date);
  const b = fromDateKey(start);
  const elapsed = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  // Un pas de marge : l'occurrence du mois de `start` peut tomber avant lui.
  for (let n = Math.max(0, Math.floor(elapsed / STEP_MONTHS[s.recurrence]) - 1); ; n++) {
    const d = nth(s, n);
    if (d >= start) yield d;
  }
}

/** Prochaine échéance à partir d'aujourd'hui inclus ; `date` telle quelle si ponctuelle. */
export function nextOccurrence(s: Series, today: DateKey): DateKey {
  if (!s.recurrence) return s.date;
  return occurrences({ ...s, recurrence: s.recurrence }, today).next().value as DateKey;
}

/** Échéances comprises entre `from` et `to` inclus. */
export function occurrencesBetween(s: Series, from: DateKey, to: DateKey): DateKey[] {
  if (!s.recurrence) return s.date >= from && s.date <= to ? [s.date] : [];
  const out: DateKey[] = [];
  for (const d of occurrences({ ...s, recurrence: s.recurrence }, from)) {
    if (d > to) break;
    out.push(d);
  }
  return out;
}

/**
 * Chaque échéance récurrente ramenée à sa prochaine occurrence (`date` remplacée),
 * puis tri par date : une série passée n'est jamais affichée « en retard ».
 * Le tri est stable, l'ordre de création départage les égalités.
 */
export function atNextOccurrence<T extends Series>(rows: T[], today: DateKey): T[] {
  return rows
    .map((r) => (r.recurrence ? { ...r, date: nextOccurrence(r, today) } : r))
    .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

/** « Tous les mois · le 15 », « Tous les ans ». */
export function recurrenceLabel(s: Series): string | null {
  if (!s.recurrence) return null;
  const label = RECURRENCE_SHORT_LABELS[s.recurrence];
  return usesRecurrenceDay(s.recurrence) && s.recurrence_day ? `${label} · le ${s.recurrence_day}` : label;
}
