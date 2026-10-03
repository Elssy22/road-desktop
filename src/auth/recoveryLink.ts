import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';

/**
 * Deep link de retour du lien « mot de passe oublié » (route `src/app/reset-password.tsx`).
 * Doit correspondre exactement à une *Redirect URL* autorisée côté Supabase, sinon
 * Supabase renvoie vers la Site URL. Fixe en development build / release (où
 * `createURL` peut inclure l'hôte du serveur Metro) ; en Expo Go, `exp://<hôte>/--/reset-password`.
 */
export const resetPasswordRedirectUrl = () =>
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? Linking.createURL('reset-password')
    : 'road://reset-password';

export type RecoveryLink =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; code: string; description: string }
  | { kind: 'none' };

/** Paramètres de la query ET du fragment (le fragment l'emporte). */
function linkParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt < 0 ? url : url.slice(0, hashAt);
  const hash = hashAt < 0 ? '' : url.slice(hashAt + 1);
  const queryAt = beforeHash.indexOf('?');
  const query = queryAt < 0 ? '' : beforeHash.slice(queryAt + 1);
  for (const part of `${query}&${hash}`.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = eq < 0 ? part : part.slice(0, eq);
    const v = eq < 0 ? '' : part.slice(eq + 1);
    try {
      params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch {
      // Paramètre mal encodé : ignoré.
    }
  }
  return params;
}

/**
 * Le client Supabase est en flow implicite (défaut de supabase-js) : après
 * `/auth/v1/verify`, Supabase redirige vers `redirectTo#access_token=…&refresh_token=…&type=recovery`,
 * ou `redirectTo#error=…&error_code=otp_expired&error_description=…` si le lien est expiré/déjà utilisé.
 */
export function parseRecoveryLink(url: string | null): RecoveryLink {
  if (!url) return { kind: 'none' };
  const p = linkParams(url);
  if (p.error || p.error_code)
    return { kind: 'error', code: p.error_code || p.error, description: p.error_description ?? '' };
  if (p.access_token && p.refresh_token)
    return { kind: 'tokens', accessToken: p.access_token, refreshToken: p.refresh_token };
  return { kind: 'none' };
}
