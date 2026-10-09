import { register } from 'node:module';

// Remplace `./supabase` (importé par src/lib/vault.ts) par un stub : le test
// porte sur le vrai fichier du dépôt, sans client Supabase ni import.meta.env.
const stub = new URL('./supabase-stub.mjs', import.meta.url).href;
register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === './supabase' && context.parentURL?.endsWith('/src/lib/vault.ts')) {
    return { url: ${JSON.stringify(stub)}, shortCircuit: true };
  }
  return next(specifier, context);
}`)
);
