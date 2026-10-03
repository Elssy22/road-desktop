import { debriefAt, type AppointmentWithContact } from '../db/appointmentsDb';
import { CATEGORY_LABELS, type KeyDateWithContact } from '../db/keyDatesDb';
import type { ReminderWithLinks } from '../db/remindersDb';
import { addDays, formatLongDate, fromDateKey, toDateKey, type DateKey } from '../lib/dates';
import { countdownLabel, TODAY_ALERT_DAYS } from '../lib/keyDateAlerts';
import type { NotificationSettings } from './settings';

// Calcul (pur) des notifications locales à programmer. Le contenu d'une
// notification programmée est figé au moment où on la programme : on ne peut
// pas lire SQLite à l'heure du déclenchement (cf. DECISIONS.md §18). On
// programme donc un rappel daté par jour, avec les chiffres projetés pour ce
// jour-là, et tout est recalculé à chaque ouverture / modification.

/** Nombre de rappels du matin programmés d'avance. */
export const MORNING_DAYS_AHEAD = 7;
/** Alerte « échéance clé » : même seuil J-7 que l'échéancier et la Vue du jour. */
export const KEY_DATE_NOTICE_DAYS = TODAY_ALERT_DAYS;
/** iOS ne garde que 64 notifications programmées par app : on reste en dessous (7 + 40 + 15 = 62). */
export const MAX_KEY_DATE_NOTIFICATIONS = 40;
/**
 * Notifications ponctuelles programmées d'avance — rappels ET debriefs de RDV,
 * un seul quota partagé (les plus proches ; la suite à la prochaine ouverture).
 */
export const MAX_REMINDER_NOTIFICATIONS = 15;

/** Données jointes à une notification, lues quand on la touche (NotificationResponseHandler). */
export type NotificationData = { kind: 'debrief'; appointmentId: string; contactId: string | null };

export type PlannedNotification = { id: string; date: Date; title: string; body: string; data?: NotificationData };

const atTime = (day: DateKey, hour: number, minute: number) => {
  const d = fromDateKey(day);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function morningBody(dueToday: number, overdue: number): string {
  if (dueToday === 0 && overdue === 0) return "Aucune tâche prévue aujourd'hui.";
  const parts = [];
  if (dueToday > 0) parts.push(`${plural(dueToday, 'tâche')} pour aujourd'hui`);
  if (overdue > 0) parts.push(`${overdue} en retard`);
  return parts.join(' · ');
}

/**
 * Un rappel par jour pour les `MORNING_DAYS_AHEAD` prochains matins (aujourd'hui
 * compris si l'heure n'est pas passée). Chiffres projetés pour chaque jour à
 * partir des tâches non faites : dues ce jour-là / échéance antérieure.
 */
export function planMorningReminders(
  openDueDates: DateKey[],
  settings: NotificationSettings,
  now: Date
): PlannedNotification[] {
  const today = toDateKey(now);
  const out: PlannedNotification[] = [];
  for (let i = 0; out.length < MORNING_DAYS_AHEAD; i++) {
    const day = addDays(today, i);
    const date = atTime(day, settings.hour, settings.minute);
    if (date <= now) continue;
    const dueToday = openDueDates.filter((d) => d === day).length;
    const overdue = openDueDates.filter((d) => d < day).length;
    out.push({
      id: `morning:${day}`,
      date,
      title: capitalize(formatLongDate(day)),
      body: morningBody(dueToday, overdue),
    });
  }
  return out;
}

/** Alerte le jour J-7 de chaque date clé, à l'heure du rappel du matin. */
export function planKeyDateAlerts(
  keyDates: KeyDateWithContact[],
  settings: NotificationSettings,
  now: Date
): PlannedNotification[] {
  return keyDates
    .map((k) => ({ k, date: atTime(addDays(k.date, -KEY_DATE_NOTICE_DAYS), settings.hour, settings.minute) }))
    .filter(({ date }) => date > now)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, MAX_KEY_DATE_NOTIFICATIONS)
    .map(({ k, date }) => ({
      id: `key-date:${k.id}`,
      date,
      title: `Échéance clé à ${countdownLabel(KEY_DATE_NOTICE_DAYS)}`,
      body: [
        k.title || 'Sans titre',
        CATEGORY_LABELS[k.category] ?? k.category,
        formatLongDate(k.date),
        k.contact_name,
      ]
        .filter(Boolean)
        .join(' · '),
    }));
}

/**
 * Une notification à l'heure exacte de chaque rappel non fait encore à venir.
 * Texte fixe par nature (titre du rappel + élément lié), donc pas de problème
 * de contenu figé comme pour le rappel du matin. Indépendant du réglage
 * « Notifications quotidiennes » : un rappel est une demande explicite.
 */
export function planReminders(reminders: ReminderWithLinks[], now: Date): PlannedNotification[] {
  return reminders
    .map((r) => ({ r, date: new Date(r.remind_at) }))
    .filter(({ date }) => date > now)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, MAX_REMINDER_NOTIFICATIONS)
    .map(({ r, date }) => ({
      id: `reminder:${r.id}`,
      date,
      title: r.title || 'Rappel',
      body: [r.task_title && `Tâche : ${r.task_title}`, r.contact_name && `Contact : ${r.contact_name}`]
        .filter(Boolean)
        .join(' · ') || 'Rappel',
    }));
}

/**
 * Debrief d'un RDV : 1 h après sa fin (2 h après le début sans heure de fin),
 * si l'interrupteur du RDV est actif. Le texte nomme le RDV ; les données
 * jointes permettent d'ouvrir le compte-rendu avec le contact prérempli.
 * Comme les rappels, indépendant du réglage « Notifications quotidiennes ».
 */
export function planDebriefs(appointments: AppointmentWithContact[], now: Date): PlannedNotification[] {
  return appointments
    .map((a) => ({ a, date: debriefAt(a) }))
    .filter((x): x is { a: AppointmentWithContact; date: Date } => !!x.date && x.date > now)
    .sort((x, y) => x.date.getTime() - y.date.getTime())
    .slice(0, MAX_REMINDER_NOTIFICATIONS)
    .map(({ a, date }) => ({
      id: `debrief:${a.id}`,
      date,
      title: `Debrief : ${a.title || 'Rendez-vous'}`,
      body: a.contact_name
        ? `RDV avec ${a.contact_name} terminé. Touche pour faire le compte-rendu.`
        : 'RDV terminé. Touche pour faire le compte-rendu.',
      data: { kind: 'debrief', appointmentId: a.id, contactId: a.contact_id },
    }));
}

/** Rappels et debriefs se partagent le quota `MAX_REMINDER_NOTIFICATIONS` : on garde les plus proches. */
export function mergeOneOff(...lists: PlannedNotification[][]): PlannedNotification[] {
  return lists
    .flat()
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, MAX_REMINDER_NOTIFICATIONS);
}
