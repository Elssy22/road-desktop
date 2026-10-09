import { openUrl } from '@tauri-apps/plugin-opener';

// La webview Tauri n'ouvre pas les liens `target="_blank"` : un lien externe
// (avis BOAMP, itinéraire) passe par le plugin opener, qui le confie au
// navigateur par défaut de macOS. Hors Tauri (`npm run dev` dans un navigateur),
// nouvel onglet classique.

const inTauri = () => '__TAURI_INTERNALS__' in window;

/** Seuls les liens web sont ouverts (l'URL d'un avis vient d'une source externe). */
export async function openExternal(url: string): Promise<void> {
  const { protocol } = new URL(url);
  if (protocol !== 'https:' && protocol !== 'http:') throw new Error(`Lien non pris en charge : ${url}`);
  if (inTauri()) await openUrl(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
