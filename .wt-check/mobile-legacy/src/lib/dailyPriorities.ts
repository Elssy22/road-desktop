import Storage from 'expo-sqlite/kv-store';

import type { DateKey } from './dates';

// Les priorités du jour restent sur l'appareil (pas de sync) : une clé par
// utilisateur et par jour dans le kv-store SQLite.
export const MAX_DAILY_PRIORITIES = 3;

const key = (userId: string, day: DateKey) => `daily_priorities:${userId}:${day}`;

export function loadDailyPriorities(userId: string, day: DateKey): string[] {
  const empty = Array<string>(MAX_DAILY_PRIORITIES).fill('');
  try {
    const raw = Storage.getItemSync(key(userId, day));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return empty;
    return empty.map((_, i) => (typeof parsed[i] === 'string' ? parsed[i] : ''));
  } catch {
    return empty;
  }
}

export function saveDailyPriorities(userId: string, day: DateKey, items: string[]) {
  void Storage.setItemAsync(key(userId, day), JSON.stringify(items.slice(0, MAX_DAILY_PRIORITIES)));
}
