import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

// Réglages des notifications : propres à l'appareil (pas de sync), dans le
// kv-store SQLite comme les priorités du jour. Petit store observable pour que
// l'écran Réglages et le planificateur voient la même valeur.

export type NotificationSettings = {
  enabled: boolean;
  /** Heure du rappel du matin (fuseau de l'appareil). */
  hour: number;
  minute: number;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = { enabled: false, hour: 8, minute: 0 };

const KEY = 'notifications:settings';

let current: NotificationSettings | null = null;
const listeners = new Set<() => void>();

const isTime = (h: unknown, m: unknown) =>
  Number.isInteger(h) && Number.isInteger(m) && (h as number) >= 0 && (h as number) < 24 && (m as number) >= 0 && (m as number) < 60;

function read(): NotificationSettings {
  try {
    const raw = Storage.getItemSync(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<NotificationSettings>) : null;
    if (!parsed) return DEFAULT_NOTIFICATION_SETTINGS;
    const time = isTime(parsed.hour, parsed.minute)
      ? { hour: parsed.hour as number, minute: parsed.minute as number }
      : DEFAULT_NOTIFICATION_SETTINGS;
    return { enabled: parsed.enabled === true, hour: time.hour, minute: time.minute };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export function getNotificationSettings(): NotificationSettings {
  current ??= read();
  return current;
}

export function updateNotificationSettings(patch: Partial<NotificationSettings>) {
  current = { ...getNotificationSettings(), ...patch };
  Storage.setItemSync(KEY, JSON.stringify(current));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useNotificationSettings = () => useSyncExternalStore(subscribe, getNotificationSettings);

const pad = (n: number) => String(n).padStart(2, '0');

/** « 08:00 » */
export const formatTime = (hour: number, minute: number) => `${pad(hour)}:${pad(minute)}`;
