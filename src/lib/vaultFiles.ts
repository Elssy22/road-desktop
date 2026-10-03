// Entrées/sorties du coffre : lecture du fichier choisi, envoi/téléchargement
// des octets chiffrés (Storage), ouverture du document déchiffré. Tout le
// chiffrement est dans vault.ts ; ici, rien ne sort en clair de l'appareil.
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { supabase } from './supabase';
import { VAULT_BUCKET, VAULT_MAX_BYTES, type DocumentMeta } from './vault';

/** Dossier temporaire des documents déchiffrés pour ouverture ; vidé à la sortie du coffre. */
const openedDir = () => new Directory(Paths.cache, 'vault-open');

/** `uri` : file:// (iOS, copie en cache) ou content:// SAF (Android, lu via ContentResolver). */
export async function readPickedFile(uri: string, size: number | undefined): Promise<Uint8Array> {
  if (size != null && size > VAULT_MAX_BYTES) throw new Error(tooLarge(size));
  const bytes = await new File(uri).bytes();
  if (bytes.length > VAULT_MAX_BYTES) throw new Error(tooLarge(bytes.length));
  return bytes;
}

const tooLarge = (size: number) =>
  `Fichier trop volumineux (${(size / 1024 / 1024).toFixed(1)} Mo, ${VAULT_MAX_BYTES / 1024 / 1024} Mo max).`;

/** Envoie des octets DÉJÀ chiffrés ; renvoie le chemin dans le bucket. */
export async function uploadEncrypted(userId: string, encrypted: Uint8Array): Promise<string> {
  const path = `${userId}/${randomUUID()}.bin`;
  const body = encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength) as ArrayBuffer;
  const { error } = await supabase.storage
    .from(VAULT_BUCKET)
    .upload(path, body, { contentType: 'application/octet-stream', upsert: false });
  if (error) throw new Error(`Envoi impossible : ${error.message}`);
  return path;
}

/** Télécharge les octets chiffrés via une URL signée courte (pas de Blob, peu fiable sous React Native). */
export async function downloadEncrypted(path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(VAULT_BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) throw new Error(`Téléchargement impossible : ${error?.message ?? 'URL absente'}`);
  const tmp = new File(Paths.cache, `vault-dl-${randomUUID()}.bin`);
  try {
    const file = await File.downloadFileAsync(data.signedUrl, tmp, { idempotent: true });
    return await file.bytes();
  } finally {
    if (tmp.exists) tmp.delete();
  }
}

/** Best effort : un échec laisse un fichier chiffré orphelin, illisible et sans danger. */
export async function removeEncrypted(path: string): Promise<void> {
  const { error } = await supabase.storage.from(VAULT_BUCKET).remove([path]);
  if (error) console.warn('vault: suppression Storage échouée', error.message);
}

const safeName = (name: string) => name.replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'document';

/** Écrit le clair dans le cache puis ouvre la feuille de partage (« Ouvrir avec… »). */
export async function openDecrypted(meta: DocumentMeta, bytes: Uint8Array): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Ouverture de fichiers non disponible sur cet appareil.');
  clearOpenedDocuments();
  const dir = openedDir();
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, safeName(meta.name));
  file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType: meta.mime || undefined, dialogTitle: meta.name });
}

/** Supprime les copies déchiffrées temporaires. */
export function clearOpenedDocuments() {
  try {
    const dir = openedDir();
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('vault: nettoyage du cache échoué', e instanceof Error ? e.message : String(e));
  }
}
