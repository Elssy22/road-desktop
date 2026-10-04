// Message d'erreur affichable, en français. WebKit (webview Tauri) et
// supabase-js remontent certaines erreurs réseau en anglais : elles sont
// traduites ici, une seule fois pour toute l'app.

const NETWORK = 'Connexion au serveur impossible. Vérifie ta connexion puis réessaie.';

const TRANSLATIONS: [RegExp, string][] = [
  [/^(TypeError: )?(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i, NETWORK],
  [/^The network connection was lost\.?$/i, NETWORK],
  [/^JWT expired$/i, 'Session expirée : reconnexion en cours, réessaie dans un instant.'],
];

export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return TRANSLATIONS.find(([pattern]) => pattern.test(raw.trim()))?.[1] ?? raw;
}
