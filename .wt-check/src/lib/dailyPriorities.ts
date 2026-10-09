import type { DateKey } from './dates';

// Les priorités du jour restent sur l'appareil (pas de sync, comme sur le
// mobile) : une clé par utilisateur et par jour dans le localStorage de la webview.
export const MAX_DAILY_PRIORITIES = 3;

const key = (userId: string, day: DateKey) => `daily_priorities:${userId}:${day}`;

export function loadDailyPriorities(userId: string, day: DateKey): string[] {
  const empty = Array<string>(MAX_DAILY_PRIORITIES).fill('');
  try {
    const raw = window.localStorage.getItem(key(userId, day));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return empty;
    return empty.map((_, i) => (typeof parsed[i] === 'string' ? parsed[i] : ''));
  } catch {
    return empty;
  }
}

export function saveDailyPriorities(userId: string, day: DateKey, items: string[]) {
  try {
    window.localStorage.setItem(key(userId, day), JSON.stringify(items.slice(0, MAX_DAILY_PRIORITIES)));
  } catch {
    // Stockage plein ou indisponible : la saisie reste à l'écran, simplement non conservée.
  }
}
