// Coffre documentaire : chiffrement côté client (AES-256-GCM) avec une clé
// dérivée d'une phrase secrète (PBKDF2-SHA256), en JS pur (@noble/*) pour
// rester compatible Expo Go. Le serveur ne voit que des octets chiffrés.
// Cf. DECISIONS.md §16.
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8 } from '@noble/ciphers/utils.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { getRandomBytes } from 'expo-crypto';
import Storage from 'expo-sqlite/kv-store';

export const VAULT_BUCKET = 'vault-documents';
/** Taille max d'un fichier : tout est chiffré en mémoire, en JS. */
export const VAULT_MAX_BYTES = 20 * 1024 * 1024;
/**
 * Coût PBKDF2 des nouvelles clés. Stocké dans chaque fichier : modifiable plus tard.
 * En JS pur (@noble/*, pas d'accélération matérielle), même 60k itérations
 * restait perçu comme long sur un vrai téléphone. On descend à 20k : la phrase
 * secrète doit déjà faire ≥10 caractères (MIN_PASSPHRASE_LENGTH), et le coffre
 * est un chiffrement local (l'attaquant doit déjà avoir l'appareil) — le
 * compromis vitesse/coût est accepté pour un usage mobile fluide.
 */
const KDF_ITERATIONS = 20_000;
const MIN_PASSPHRASE_LENGTH = 10;

const MAGIC = utf8ToBytes('AGV1');
const SALT_LEN = 16;
const NONCE_LEN = 12;
const HEADER_LEN = MAGIC.length + 4 + SALT_LEN + NONCE_LEN;

export type VaultConfig = { v: 1; iterations: number; verifier: string };
export type DocumentMeta = { name: string; mime: string };

const configKey = (userId: string) => `vault:${userId}`;

/**
 * Sel déterministe par utilisateur : la même phrase donne la même clé sur tous
 * les appareils sans rien stocker côté serveur. Le sel n'est pas un secret ; il
 * empêche seulement de mutualiser une attaque entre comptes.
 */
const saltFor = (userId: string) => sha256(utf8ToBytes(`agence-vault/v1/${userId}`)).slice(0, SALT_LEN);

/** Hash de vérification local : dérivé de la clé (jamais de la phrase en clair). */
const verifierOf = (key: Uint8Array) => bytesToHex(sha256(concatBytes(utf8ToBytes('agence-vault/verify'), key)));

const deriveKey = (passphrase: string, salt: Uint8Array, iterations: number) =>
  // asyncTick : rend la main à l'UI régulièrement pendant la dérivation (plusieurs secondes sous Hermes).
  pbkdf2Async(sha256, passphrase.normalize('NFC'), salt, { c: iterations, dkLen: 32, asyncTick: 20 });

// ---------------------------------------------------------------------------
// Session : la clé ne vit qu'en mémoire, jusqu'au verrouillage ou à la fermeture de l'app.
// ---------------------------------------------------------------------------

const session = new Map<string, { key: Uint8Array; iterations: number }>();

export const isVaultUnlocked = (userId: string) => session.has(userId);
export const lockVault = (userId: string) => session.delete(userId);

export function getVaultConfig(userId: string): VaultConfig | null {
  const raw = Storage.getItemSync(configKey(userId));
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as VaultConfig;
    return c.v === 1 && typeof c.verifier === 'string' && c.iterations > 0 ? c : null;
  } catch {
    return null;
  }
}

export function passphraseProblem(passphrase: string, confirmation: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) return `Au moins ${MIN_PASSPHRASE_LENGTH} caractères.`;
  if (passphrase !== confirmation) return 'Les deux saisies ne correspondent pas.';
  return null;
}

/** Première utilisation (ou nouvel appareil) : enregistre le hash de vérification et déverrouille. */
export async function setupVault(userId: string, passphrase: string) {
  const key = await deriveKey(passphrase, saltFor(userId), KDF_ITERATIONS);
  const config: VaultConfig = { v: 1, iterations: KDF_ITERATIONS, verifier: verifierOf(key) };
  await Storage.setItemAsync(configKey(userId), JSON.stringify(config));
  session.set(userId, { key, iterations: KDF_ITERATIONS });
}

/** Lève « Phrase secrète incorrecte » si le hash ne correspond pas. */
export async function unlockVault(userId: string, passphrase: string) {
  const config = getVaultConfig(userId);
  if (!config) throw new Error('Coffre non configuré sur cet appareil.');
  const key = await deriveKey(passphrase, saltFor(userId), config.iterations);
  if (verifierOf(key) !== config.verifier) throw new Error('Phrase secrète incorrecte.');
  session.set(userId, { key, iterations: config.iterations });
}

/** Oublie la phrase sur cet appareil (les documents chiffrés ne sont pas touchés). */
export async function resetVaultOnDevice(userId: string) {
  lockVault(userId);
  await Storage.removeItemAsync(configKey(userId));
}

function sessionKey(userId: string) {
  const s = session.get(userId);
  if (!s) throw new Error('Coffre verrouillé : saisis ta phrase secrète.');
  return s;
}

// ---------------------------------------------------------------------------
// Format d'un fichier chiffré :
//   "AGV1" | itérations (u32 BE) | sel (16) | nonce (12) | AES-GCM(clair, AAD = en-tête)
//   clair = longueur méta (u32 BE) | méta JSON {name, mime} | octets du fichier
// Le nom et le type du fichier sont donc chiffrés aussi ; seul le titre saisi
// dans l'app est stocké en clair (table documents).
// ---------------------------------------------------------------------------

const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
};
const readU32 = (b: Uint8Array, offset: number) => new DataView(b.buffer, b.byteOffset + offset, 4).getUint32(0);

export function encryptDocument(userId: string, bytes: Uint8Array, meta: DocumentMeta): Uint8Array {
  const { key, iterations } = sessionKey(userId);
  const metaBytes = utf8ToBytes(JSON.stringify(meta));
  const header = concatBytes(MAGIC, u32(iterations), saltFor(userId), getRandomBytes(NONCE_LEN));
  const nonce = header.slice(HEADER_LEN - NONCE_LEN);
  const ciphertext = gcm(key, nonce, header).encrypt(concatBytes(u32(metaBytes.length), metaBytes, bytes));
  return concatBytes(header, ciphertext);
}

export function decryptDocument(userId: string, blob: Uint8Array): { meta: DocumentMeta; bytes: Uint8Array } {
  const { key, iterations } = sessionKey(userId);
  if (blob.length <= HEADER_LEN || bytesToHex(blob.slice(0, MAGIC.length)) !== bytesToHex(MAGIC)) {
    throw new Error('Fichier illisible : ce n’est pas un document du coffre.');
  }
  const header = blob.slice(0, HEADER_LEN);
  if (readU32(header, MAGIC.length) !== iterations) {
    throw new Error('Document chiffré avec d’autres paramètres : verrouille puis rouvre le coffre.');
  }
  const nonce = header.slice(HEADER_LEN - NONCE_LEN);
  let plain: Uint8Array;
  try {
    plain = gcm(key, nonce, header).decrypt(blob.slice(HEADER_LEN));
  } catch {
    // Échec d'authentification GCM : mauvaise clé ou fichier modifié.
    throw new Error(
      'Déchiffrement impossible : ce document a été chiffré avec une autre phrase secrète, ou le fichier est corrompu.'
    );
  }
  const metaLen = readU32(plain, 0);
  const meta = JSON.parse(bytesToUtf8(plain.slice(4, 4 + metaLen))) as DocumentMeta;
  return { meta, bytes: plain.slice(4 + metaLen) };
}
