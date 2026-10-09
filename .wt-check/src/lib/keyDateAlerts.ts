import { daysBetween, type DateKey } from './dates';

// Alertes de l'échéancier, calculées côté client : paliers J-90, J-30, J-7
// avant la date clé. Le palier J-7 est aussi notifié (src/notifications).

export type AlertLevel = 'j7' | 'j30' | 'j90';

/** Seuil de l'encart de la Vue du jour. */
export const TODAY_ALERT_DAYS = 7;

/** Jours restants jusqu'à `date` (0 le jour même, négatif une fois passée). */
export const daysUntil = (date: DateKey, today: DateKey) => daysBetween(today, date);

export function alertLevel(days: number): AlertLevel | null {
  if (days < 0) return null;
  if (days <= 7) return 'j7';
  if (days <= 30) return 'j30';
  if (days <= 90) return 'j90';
  return null;
}

/** « Aujourd'hui », « Demain », « J-12 », « Passée ». */
export function countdownLabel(days: number): string {
  if (days < 0) return 'Passée';
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Demain';
  return `J-${days}`;
}
