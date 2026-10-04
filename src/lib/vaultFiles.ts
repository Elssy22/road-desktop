// Entrées/sorties du coffre : lecture du fichier choisi, envoi/téléchargement
// des octets chiffrés (Storage), affichage ou enregistrement du document
// déchiffré. Portage web de mobile-legacy/src/lib/vaultFiles.ts. Tout le
// chiffrement est dans vault.ts ; ici, rien ne sort en clair de la machine.
import { supabase } from './supabase';
import { VAULT_BUCKET, VAULT_MAX_BYTES, type DocumentMeta } from './vault';

const tooLarge = (size: number) =>
  `Fichier trop volumineux (${(size / 1024 / 1024).toFixed(1)} Mo, ${VAULT_MAX_BYTES / 1024 / 1024} Mo max).`;

/** Vérifie la taille avant toute lecture : tout est chiffré en mémoire. */
export function checkFileSize(size: number): string | null {
  return size > VAULT_MAX_BYTES ? tooLarge(size) : null;
}

/** Fichier choisi (input type=file) → octets en mémoire, sans copie sur disque. */
export async function readPickedFile(file: File): Promise<Uint8Array<ArrayBuffer>> {
  const problem = checkFileSize(file.size);
  if (problem) throw new Error(problem);
  return new Uint8Array(await file.arrayBuffer());
}

/** Envoie des octets DÉJÀ chiffrés ; renvoie le chemin dans le bucket. */
export async function uploadEncrypted(userId: string, encrypted: Uint8Array<ArrayBuffer>): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.bin`;
  const { error } = await supabase.storage
    .from(VAULT_BUCKET)
    .upload(path, new Blob([encrypted], { type: 'application/octet-stream' }), {
      contentType: 'application/octet-stream',
      upsert: false,
    });
  if (error) throw new Error(`Envoi impossible : ${error.message}`);
  return path;
}

/** Télécharge les octets chiffrés (RLS Storage : uniquement le dossier de l'utilisateur). */
export async function downloadEncrypted(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const { data, error } = await supabase.storage.from(VAULT_BUCKET).download(path);
  if (error || !data) throw new Error(`Téléchargement impossible : ${error?.message ?? 'fichier absent'}`);
  return new Uint8Array(await data.arrayBuffer());
}

/** Best effort : un échec laisse un fichier chiffré orphelin, illisible et sans danger. */
export async function removeEncrypted(path: string): Promise<void> {
  const { error } = await supabase.storage.from(VAULT_BUCKET).remove([path]);
  if (error) console.warn('vault: suppression Storage échouée', error.message);
}

// Caractères de contrôle retirés exprès : interdits ou piégeux dans un nom de fichier.
// eslint-disable-next-line no-control-regex
export const safeName =(name: string) => name.replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'document';

/** Aperçu intégré possible : images uniquement (la CSP de la webview autorise `img-src blob:`). */
export const canPreview = (meta: DocumentMeta) => /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i.test(meta.mime);

/**
 * URL mémoire (blob:) du document déchiffré, pour l'aperçu ou l'enregistrement.
 * Elle ne vit que dans la webview : la révoquer (URL.revokeObjectURL) dès que
 * l'écran se ferme ou que le coffre est verrouillé.
 */
export function decryptedUrl(meta: DocumentMeta, bytes: Uint8Array<ArrayBuffer>): string {
  return URL.createObjectURL(new Blob([bytes], { type: meta.mime || 'application/octet-stream' }));
}

/**
 * Enregistre une copie en clair là où l'utilisateur le choisit (téléchargement
 * de la webview). C'est la seule opération qui écrit le clair sur disque, et
 * elle n'a lieu que sur action explicite.
 */
export function saveDecrypted(url: string, meta: DocumentMeta) {
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName(meta.name);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
