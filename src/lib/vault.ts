// Coffre documentaire : chiffrement côté client (AES-256-GCM) avec une clé
// dérivée d'une phrase secrète (PBKDF2-SHA256). Portage Web Crypto de
// mobile-legacy/src/lib/vault.ts (@noble/* en JS pur) : MÊMES paramètres, même
// sel, même hash de vérification et même format de fichier, pour qu'un document
// chiffré sur le mobile s'ouvre sur le Mac et inversement. Le serveur ne voit
// que des octets chiffrés. Cf. DECISIONS.md §16.
import { supabase } from './supabase';

export const VAULT_BUCKET = 'vault-documents';
/** Taille max d'un fichier (alignée sur le mobile et la limite du bucket). */
export const VAULT_MAX_BYTES = 20 * 1024 * 1024;
/**
 * Coût PBKDF2 des nouvelles clés : identique au mobile, OBLIGATOIREMENT. La clé
 * dépend du nombre d'itérations (le sel étant déterministe) ; une autre valeur
 * ici donnerait une autre clé et rendrait illisibles, sur le Mac, les documents
 * chiffrés sur le téléphone (et inversement). Le remonter demande une migration
 * coordonnée des deux apps (rechiffrement), cf. limites du lot 4 desktop.
 */
const KDF_ITERATIONS = 20_000;
const MIN_PASSPHRASE_LENGTH = 10;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const utf8 = (s: string) => encoder.encode(s);

const MAGIC = utf8('AGV1');
const SALT_LEN = 16;
const NONCE_LEN = 12;
const HEADER_LEN = MAGIC.length + 4 + SALT_LEN + NONCE_LEN;

export type VaultConfig = { v: 1; iterations: number; verifier: string };
export type DocumentMeta = { name: string; mime: string };

const configKey = (userId: string) => `vault:${userId}`;

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

const sha256 = async (data: Uint8Array<ArrayBuffer>) => new Uint8Array(await crypto.subtle.digest('SHA-256', data));

/**
 * Sel déterministe par utilisateur : la même phrase donne la même clé sur tous
 * les appareils sans rien stocker côté serveur. Le sel n'est pas un secret ; il
 * empêche seulement de mutualiser une attaque entre comptes.
 */
const saltFor = async (userId: string) => (await sha256(utf8(`agence-vault/v1/${userId}`))).slice(0, SALT_LEN);

/** Hash de vérification local : dérivé de la clé (jamais de la phrase en clair). */
const verifierOf = async (keyBytes: Uint8Array) => toHex(await sha256(concat(utf8('agence-vault/verify'), keyBytes)));

/**
 * Dérive la clé et son hash de vérification. Les octets bruts de la clé ne
 * servent qu'au hash (même définition que le mobile) puis sont effacés : seule
 * reste une CryptoKey non exportable, utilisable pour chiffrer/déchiffrer.
 */
async function deriveKey(userId: string, passphrase: string, iterations: number) {
  const material = await crypto.subtle.importKey('raw', utf8(passphrase.normalize('NFC')), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: await saltFor(userId), iterations },
      material,
      256
    )
  );
  try {
    const verifier = await verifierOf(bits);
    const key = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
    return { key, verifier };
  } finally {
    bits.fill(0);
  }
}

// ---------------------------------------------------------------------------
// Session : la clé ne vit qu'en mémoire, jusqu'au verrouillage, à la
// déconnexion ou à la fermeture de l'app.
// ---------------------------------------------------------------------------

const session = new Map<string, { key: CryptoKey; iterations: number }>();

/** Verrouillage automatique après ce délai sans clic ni frappe dans l'app. */
const AUTO_LOCK_MS = 10 * 60 * 1000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const lockListeners = new Set<() => void>();

export const isVaultUnlocked = (userId: string) => session.has(userId);

/** Prévient les écrans ouverts que le coffre vient d'être verrouillé (à la main ou automatiquement). */
export function onVaultLocked(listener: () => void): () => void {
  lockListeners.add(listener);
  return () => {
    lockListeners.delete(listener);
  };
}

function lockAll() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (session.size === 0) return;
  session.clear();
  for (const l of lockListeners) l();
}

export function lockVault(userId: string) {
  if (!session.delete(userId)) return;
  if (session.size === 0 && idleTimer) clearTimeout(idleTimer);
  for (const l of lockListeners) l();
}

/** Relance le compte à rebours d'inactivité tant qu'une clé est en mémoire. */
function armAutoLock() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = session.size > 0 ? setTimeout(lockAll, AUTO_LOCK_MS) : null;
}

// Coffre ouvert indéfiniment = risque si le Mac reste allumé sans surveillance :
// verrouillage après AUTO_LOCK_MS d'inactivité, et dès que la fenêtre est
// masquée (réduite, Mac en veille ou écran verrouillé).
for (const event of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(event, () => session.size > 0 && armAutoLock(), { passive: true, capture: true });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') lockAll();
});

// Déconnexion (ou session expirée) : plus aucune clé en mémoire.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') lockAll();
});

/**
 * Config de cet appareil (localStorage de la webview), équivalent du kv-store
 * du mobile : nombre d'itérations et hash de vérification, jamais la phrase.
 */
export function getVaultConfig(userId: string): VaultConfig | null {
  const raw = localStorage.getItem(configKey(userId));
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

export type PassphraseStrength = 'faible' | 'moyenne' | 'bonne';

/**
 * Estimation grossière de la robustesse (longueur et variété des caractères),
 * affichée à la création. Indicative seulement : une phrase déjà choisie sur
 * le mobile doit rester acceptée telle quelle. Avec 20 000 itérations PBKDF2
 * (imposées par le format partagé avec le mobile), seule une phrase longue
 * résiste à une attaque hors ligne sur le hash de vérification.
 */
export function passphraseStrength(passphrase: string): PassphraseStrength {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^\p{L}\p{N}]/u].filter((r) => r.test(passphrase)).length;
  const words = passphrase.trim().split(/\s+/).filter(Boolean).length;
  if (passphrase.length >= 20 && (words >= 4 || classes >= 3)) return 'bonne';
  if (passphrase.length >= 14 && (words >= 3 || classes >= 2)) return 'moyenne';
  return 'faible';
}

/**
 * Document existant le plus récent (chiffré), ou null si le coffre est vide.
 * Sert à vérifier une phrase saisie sur un nouvel appareil (B3, DECISIONS.md §36).
 */
async function existingSample(): Promise<Uint8Array<ArrayBuffer> | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('storage_path')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`Vérification de la phrase impossible : ${error.message}`);
  const path = (data as { storage_path: string }[])[0]?.storage_path;
  if (!path) return null;
  const { data: blob, error: downloadError } = await supabase.storage.from(VAULT_BUCKET).download(path);
  if (downloadError || !blob) {
    throw new Error(`Vérification de la phrase impossible : ${downloadError?.message ?? 'document absent'}`);
  }
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Première utilisation (ou nouvel appareil) : enregistre le hash de vérification et déverrouille.
 * Si le coffre contient déjà des documents (chiffrés sur le mobile ou sur un
 * autre Mac), la phrase doit en ouvrir un : sinon une faute de frappe créerait
 * une seconde clé, et les nouveaux documents seraient illisibles avec l'ancienne.
 */
export async function setupVault(userId: string, passphrase: string) {
  const { key, verifier } = await deriveKey(userId, passphrase, KDF_ITERATIONS);
  const sample = await existingSample();
  if (sample) {
    try {
      await decryptWith(key, KDF_ITERATIONS, sample);
    } catch {
      throw new Error(
        'Cette phrase n’ouvre pas les documents déjà présents dans le coffre. Saisis exactement la phrase choisie sur ton autre appareil.'
      );
    }
  }
  const config: VaultConfig = { v: 1, iterations: KDF_ITERATIONS, verifier };
  localStorage.setItem(configKey(userId), JSON.stringify(config));
  session.set(userId, { key, iterations: KDF_ITERATIONS });
  armAutoLock();
}

/** Lève « Phrase secrète incorrecte » si le hash ne correspond pas. */
export async function unlockVault(userId: string, passphrase: string) {
  const config = getVaultConfig(userId);
  if (!config) throw new Error('Coffre non configuré sur cet appareil.');
  const { key, verifier } = await deriveKey(userId, passphrase, config.iterations);
  if (verifier !== config.verifier) throw new Error('Phrase secrète incorrecte.');
  session.set(userId, { key, iterations: config.iterations });
  armAutoLock();
}

/** Oublie la phrase sur cet appareil (les documents chiffrés ne sont pas touchés). */
export function resetVaultOnDevice(userId: string) {
  lockVault(userId);
  localStorage.removeItem(configKey(userId));
}

function sessionKey(userId: string) {
  const s = session.get(userId);
  if (!s) throw new Error('Coffre verrouillé : saisis ta phrase secrète.');
  return s;
}

// ---------------------------------------------------------------------------
// Format d'un fichier chiffré (identique au mobile) :
//   "AGV1" | itérations (u32 BE) | sel (16) | nonce (12) | AES-GCM(clair, AAD = en-tête)
//   clair = longueur méta (u32 BE) | méta JSON {name, mime} | octets du fichier
// AES-GCM de Web Crypto, comme @noble/ciphers, ajoute le tag de 16 octets à la
// fin du chiffré. Le nom et le type du fichier sont donc chiffrés aussi ; seul
// le titre saisi dans l'app est stocké en clair (table documents).
// ---------------------------------------------------------------------------

const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
};
const readU32 = (b: Uint8Array, offset: number) => new DataView(b.buffer, b.byteOffset + offset, 4).getUint32(0);

export async function encryptDocument(
  userId: string,
  bytes: Uint8Array,
  meta: DocumentMeta
): Promise<Uint8Array<ArrayBuffer>> {
  const { key, iterations } = sessionKey(userId);
  const metaBytes = utf8(JSON.stringify(meta));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
  const header = concat(MAGIC, u32(iterations), await saltFor(userId), nonce);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: header, tagLength: 128 },
    key,
    concat(u32(metaBytes.length), metaBytes, bytes)
  );
  return concat(header, new Uint8Array(ciphertext));
}

export async function decryptDocument(
  userId: string,
  blob: Uint8Array<ArrayBuffer>
): Promise<{ meta: DocumentMeta; bytes: Uint8Array<ArrayBuffer> }> {
  const { key, iterations } = sessionKey(userId);
  return decryptWith(key, iterations, blob);
}

async function decryptWith(
  key: CryptoKey,
  iterations: number,
  blob: Uint8Array<ArrayBuffer>
): Promise<{ meta: DocumentMeta; bytes: Uint8Array<ArrayBuffer> }> {
  if (blob.length <= HEADER_LEN || toHex(blob.slice(0, MAGIC.length)) !== toHex(MAGIC)) {
    throw new Error('Fichier illisible : ce n’est pas un document du coffre.');
  }
  const header = blob.slice(0, HEADER_LEN);
  if (readU32(header, MAGIC.length) !== iterations) {
    throw new Error('Document chiffré avec d’autres paramètres : verrouille puis rouvre le coffre.');
  }
  const nonce = header.slice(HEADER_LEN - NONCE_LEN);
  let plain: Uint8Array<ArrayBuffer>;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: header, tagLength: 128 },
        key,
        blob.slice(HEADER_LEN)
      )
    );
  } catch {
    // Échec d'authentification GCM : mauvaise clé ou fichier modifié.
    throw new Error(
      'Déchiffrement impossible : ce document a été chiffré avec une autre phrase secrète, ou le fichier est corrompu.'
    );
  }
  const metaLen = readU32(plain, 0);
  const meta = JSON.parse(decoder.decode(plain.slice(4, 4 + metaLen))) as DocumentMeta;
  return { meta, bytes: plain.slice(4 + metaLen) };
}
