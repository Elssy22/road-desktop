import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import type { ColorScheme } from './tokens';

// Thème clair / sombre choisi dans Réglages : propre à l'appareil (pas de sync),
// dans le kv-store SQLite comme les notifications. Pas d'option « système » :
// `userInterfaceStyle: "light"` (app.json) fige l'apparence native, la suivre
// demanderait un nouveau build (DECISIONS.md §26).

const KEY = 'appearance:scheme';

let current: ColorScheme | null = null;
const listeners = new Set<() => void>();

function read(): ColorScheme {
  try {
    return Storage.getItemSync(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function getColorScheme(): ColorScheme {
  current ??= read();
  return current;
}

export function setColorScheme(scheme: ColorScheme) {
  current = scheme;
  Storage.setItemSync(KEY, scheme);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useColorSchemePreference = () => useSyncExternalStore(subscribe, getColorScheme);
