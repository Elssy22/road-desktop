// Objectifs de chiffre d'affaires (kind = 'ca') : période comptée et avancement.
// Fonctions pures ; la somme des encaissements est faite en SQLite (qontoReceiptsDb.ts).
import { addDays, formatShortDate, type DateKey } from './dates';

export type GoalKind = 'manuel' | 'ca';
export type CaPeriod = 'trimestre' | 'semestre' | 'annee';

export const CA_PERIODS: readonly { value: CaPeriod; label: string }[] = [
  { value: 'trimestre', label: 'Trimestre' },
  { value: 'semestre', label: 'Semestre' },
  { value: 'annee', label: 'Année' },
];

const PERIOD_MONTHS: Record<CaPeriod, number> = { trimestre: 3, semestre: 6, annee: 12 };

const pad = (n: number) => String(n).padStart(2, '0');

/** `key` décalé de `months` mois ; jour ramené au dernier du mois si besoin (31 mai − 3 mois → 28 févr.). */
function addMonthsClamped(key: DateKey, months: number): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}

/**
 * Jours comptés, bornes incluses : les N mois qui se terminent à la date cible.
 * Trimestre au 2026-12-31 → 2026-10-01…2026-12-31 ; au 2026-06-15 → 2026-03-16…2026-06-15.
 */
export function caPeriodBounds(targetDate: DateKey, period: CaPeriod): { start: DateKey; end: DateKey } {
  return { start: addMonthsClamped(addDays(targetDate, 1), -PERIOD_MONTHS[period]), end: targetDate };
}

/** "du 1 oct. 2026 au 31 déc. 2026" */
export function formatCaPeriod(targetDate: DateKey, period: CaPeriod): string {
  const { start, end } = caPeriodBounds(targetDate, period);
  return `du ${formatShortDate(start)} au ${formatShortDate(end)}`;
}

/** Euros sans centimes quand le montant est rond : "12 400 €", "12 399,60 €". */
export function formatEuros(amount: number): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return amount.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Pourcentage entier, plafonné à 100 ; arrondi vers le bas pour n'afficher 100 % qu'une fois la cible atteinte. */
export function caProgress(collectedCents: number, targetAmount: number | null): number {
  if (!targetAmount || targetAmount <= 0) return 0;
  return Math.min(100, Math.max(0, Math.floor(collectedCents / targetAmount)));
}
