import { createClient, isAuthRetryableFetchError } from '@supabase/supabase-js';

async function run(label, respond) {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const now = Math.floor(Date.now() / 1000);
  mem.set(
    'sb-x-auth-token',
    JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: now - 100, expires_in: 3600, token_type: 'bearer', user: { id: 'u' } })
  );
  const sb = createClient('https://x.supabase.co', 'anon', {
    auth: { storage, storageKey: 'sb-x-auth-token', autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
    global: { fetch: respond },
  });
  const events = [];
  sb.auth.onAuthStateChange((e) => events.push(e));
  const { data, error } = await sb.auth.getSession();
  console.log(label, { session: !!data.session, err: error?.name, retryable: isAuthRetryableFetchError(error), events, stored: mem.has('sb-x-auth-token') });
  const again = await sb.auth.getSession();
  console.log('  2e getSession', { session: !!again.data.session, err: again.error?.name ?? null });
  const out = await sb.auth.signOut({ scope: 'local' });
  console.log('  signOut local', { err: out.error?.name ?? null, events, stored: mem.has('sb-x-auth-token') });
}

await run('400 refresh_token_not_found', async () =>
  new Response(JSON.stringify({ code: 'refresh_token_not_found', message: 'Invalid Refresh Token' }), {
    status: 400,
    headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
  })
);
await run('reseau coupe', async () => {
  throw new TypeError('Load failed');
});
