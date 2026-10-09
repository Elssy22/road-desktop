// Dates "calendaires" au format YYYY-MM-DD, toujours dans le fuseau local de
// l'appareil (une échéance est un jour, pas un instant). Comparables en texte.

export type DateKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

export const toDateKey = (d: Date): DateKey => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromDateKey = (key: DateKey): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayKey = (): DateKey => toDateKey(new Date());

export const addDays = (key: DateKey, days: number): DateKey => {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

/** Lundi de la semaine contenant `key` (semaine du lundi au dimanche). */
export const startOfWeek = (key: DateKey): DateKey => {
  const day = fromDateKey(key).getDay(); // 0 = dimanche
  return addDays(key, day === 0 ? -6 : 1 - day);
};

/** Nombre de jours de `from` à `to` (négatif si `to` est passé). */
export const daysBetween = (from: DateKey, to: DateKey): number =>
  Math.round((fromDateKey(to).getTime() - fromDateKey(from).getTime()) / 86_400_000);

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
const MONTHS_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];
export const MONTH_NAMES = MONTHS;
export const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** "jeudi 2 octobre" */
export const formatLongDate = (key: DateKey): string => {
  const d = fromDateKey(key);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** "Jeudi 2 octobre" : majuscule au seul premier mot (`textTransform: 'capitalize'` les prend tous). */
export const formatLongDateTitle = (key: DateKey): string => {
  const s = formatLongDate(key);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** "1 oct. 2026" */
export const formatShortDate = (key: DateKey): string => {
  const d = fromDateKey(key);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};

/** Date de modification : "14:05" si c'est aujourd'hui, sinon "Hier", "lun. 6 oct."… */
export const formatEditedLabel = (iso: string, today: DateKey = todayKey()): string => {
  const d = new Date(iso);
  const key = toDateKey(d);
  return key === today ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : formatDueLabel(key, today);
};

/** Libellé court et relatif : "Aujourd'hui", "Demain", "Hier", "lun. 6 oct." */
export const formatDueLabel = (key: DateKey, today: DateKey = todayKey()): string => {
  if (key === today) return "Aujourd'hui";
  if (key === addDays(today, 1)) return 'Demain';
  if (key === addDays(today, -1)) return 'Hier';
  const d = fromDateKey(key);
  const label = `${DAYS[d.getDay()].slice(0, 3)}. ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return d.getFullYear() === fromDateKey(today).getFullYear() ? label : `${label} ${d.getFullYear()}`;
};
