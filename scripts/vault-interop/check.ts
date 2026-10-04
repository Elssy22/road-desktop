// Vérification manuelle : le coffre web (src/lib/vault.ts, Web Crypto) et celui
// du mobile (@noble/*, mobile-legacy/src/lib/vault.ts) produisent la même clé,
// le même hash de vérification et des fichiers lisibles dans les deux sens.
//
// Lancement (Node ≥ 23, qui exécute le TypeScript directement) :
//   npm install --no-save @noble/ciphers@2 @noble/hashes@2
//   node --import ./scripts/vault-interop/hooks.mjs ./scripts/vault-interop/check.ts
// Toutes les lignes doivent afficher « true » ou « refusée ».
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  },
});
const web = await import('../../src/lib/vault.ts');
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8 } from '@noble/ciphers/utils.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, utf8ToBytes, randomBytes } from '@noble/hashes/utils.js';

// Copie fidèle de mobile-legacy/src/lib/vault.ts (sans expo).
const MAGIC = utf8ToBytes('AGV1');
const HEADER_LEN = 4 + 4 + 16 + 12;
const saltFor = (u: string) => sha256(utf8ToBytes(`agence-vault/v1/${u}`)).slice(0, 16);
const verifierOf = (k: Uint8Array) => bytesToHex(sha256(concatBytes(utf8ToBytes('agence-vault/verify'), k)));
const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
};
const readU32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset + o, 4).getUint32(0);
const mDerive = (p: string, u: string) => pbkdf2Async(sha256, p.normalize('NFC'), saltFor(u), { c: 20000, dkLen: 32 });
function mEncrypt(key: Uint8Array, u: string, bytes: Uint8Array, meta: object) {
  const mb = utf8ToBytes(JSON.stringify(meta));
  const header = concatBytes(MAGIC, u32(20000), saltFor(u), randomBytes(12));
  const nonce = header.slice(HEADER_LEN - 12);
  return concatBytes(header, gcm(key, nonce, header).encrypt(concatBytes(u32(mb.length), mb, bytes)));
}
function mDecrypt(key: Uint8Array, blob: Uint8Array) {
  const header = blob.slice(0, HEADER_LEN);
  const nonce = header.slice(HEADER_LEN - 12);
  const plain = gcm(key, nonce, header).decrypt(blob.slice(HEADER_LEN));
  const ml = readU32(plain, 0);
  return { meta: JSON.parse(bytesToUtf8(plain.slice(4, 4 + ml))), bytes: plain.slice(4 + ml) };
}

const user = '3f6c1a2e-0000-4000-8000-123456789abc';
const pass = 'Café crème été 2026'; // forme décomposée : vérifie la normalisation NFC
const mKey = await mDerive(pass, user);
await web.setupVault(user, pass);
const cfg = web.getVaultConfig(user)!;
console.log('verifier identique :', cfg.verifier === verifierOf(mKey), cfg.iterations);

const data = new TextEncoder().encode('Contrat confidentiel — ' + 'x'.repeat(5000));
const meta = { name: 'contrat été.pdf', mime: 'application/pdf' };
const webBlob = await web.encryptDocument(user, data, meta);
const r1 = mDecrypt(mKey, webBlob);
console.log('web → mobile :', JSON.stringify(r1.meta) === JSON.stringify(meta) && bytesToHex(r1.bytes) === bytesToHex(data));
const mBlob = mEncrypt(mKey, user, data, meta);
const r2 = await web.decryptDocument(user, new Uint8Array(mBlob));
console.log('mobile → web :', JSON.stringify(r2.meta) === JSON.stringify(meta) && bytesToHex(r2.bytes) === bytesToHex(data));

web.lockVault(user);
try {
  await web.unlockVault(user, 'mauvaise phrase!');
  console.log('mauvaise phrase : ACCEPTÉE (bug)');
} catch (e) {
  console.log('mauvaise phrase refusée :', (e as Error).message);
}
await web.unlockVault(user, 'Café crème été 2026'); // forme composée
console.log('bonne phrase (NFC) : déverrouillé', web.isVaultUnlocked(user));
const tampered = new Uint8Array(webBlob);
tampered[tampered.length - 1] ^= 1;
try {
  await web.decryptDocument(user, tampered);
  console.log('altération : ACCEPTÉE (bug)');
} catch (e) {
  console.log('altération refusée :', (e as Error).message.slice(0, 40));
}
web.lockVault(user);
try {
  await web.encryptDocument(user, data, meta);
  console.log('verrouillé : chiffrement ACCEPTÉ (bug)');
} catch (e) {
  console.log('verrouillé, chiffrement refusé :', (e as Error).message);
}
