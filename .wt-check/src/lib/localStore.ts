// Accès au localStorage de la webview (conservé par Tauri entre deux lancements).
// Stockage indisponible ou valeur illisible : on se comporte comme si rien
// n'était enregistré, sans jamais planter l'écran.

export function readStored<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota atteint ou stockage refusé : la valeur n'est simplement pas retenue.
  }
}

export function removeStored(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Idem.
  }
}
