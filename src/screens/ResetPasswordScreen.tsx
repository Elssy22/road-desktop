import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { KeyRound } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { useSession } from '../auth/SessionProvider';
import type { RecoveryLink } from '../auth/recoveryLink';
import { CategoryCard, ScreenHeader } from '../components/ui';
import { supabase } from '../lib/supabase';
import { AuthLayout } from './AuthScreen';

// Portage web de mobile-legacy/src/screens/ResetPasswordScreen.tsx.
// Minimum par défaut de Supabase Auth ; le serveur reste juge (politique du projet).
const MIN_PASSWORD_LENGTH = 6;
const NETWORK_ERROR = 'Impossible de joindre le serveur. Vérifie ta connexion puis réessaie.';
const LINK_INVALID = 'Ce lien de réinitialisation est invalide, expiré ou déjà utilisé. Demande un nouveau lien.';

type Step = { name: 'checking' } | { name: 'form' } | { name: 'invalid'; message: string } | { name: 'done' };

function linkErrorMessage(code: string): string {
  if (code === 'otp_expired') return 'Ce lien a expiré ou a déjà été utilisé. Demande un nouveau lien de réinitialisation.';
  return LINK_INVALID;
}

function updateErrorMessage(error: unknown): string {
  if (isAuthRetryableFetchError(error)) return NETWORK_ERROR;
  if (isAuthApiError(error)) {
    if (error.code === 'same_password') return 'Le nouveau mot de passe doit être différent de l’ancien.';
    if (error.code === 'weak_password') return `Mot de passe trop faible : ${error.message}`;
    if (error.code === 'reauthentication_needed')
      return 'Supabase demande de confirmer ton identité : déconnecte-toi puis passe par « Mot de passe oublié ».';
  }
  return 'Le mot de passe n’a pas pu être modifié. Réessaie dans un instant.';
}

/** Étape de départ : lien d'erreur, jetons à échanger, ou session déjà ouverte. */
function initialStep(link: RecoveryLink, hasSession: boolean): Step {
  if (link.kind === 'error') return { name: 'invalid', message: linkErrorMessage(link.code) };
  if (link.kind === 'tokens') return { name: 'checking' };
  return hasSession ? { name: 'form' } : { name: 'invalid', message: LINK_INVALID };
}

/**
 * Choix d'un nouveau mot de passe, dans deux situations :
 * - `layout="auth"` : cible d'un lien « mot de passe oublié » arrivé dans la
 *   webview (`#access_token=…&type=recovery`). `setSession` ouvre la session de
 *   récupération avant `updateUser`. Aujourd'hui le lien envoyé par AuthScreen
 *   s'ouvre dans l'app mobile (pas de deep link desktop) : cet écran prend le
 *   relais le jour où le lien arrive ici.
 * - `layout="app"` : Réglages › Compte › Changer le mot de passe, session ouverte.
 * `onFinish(next)` quitte l'écran ; `next = 'forgot'` demande un nouveau lien.
 */
export function ResetPasswordScreen({
  link,
  layout,
  onFinish,
}: {
  link: RecoveryLink;
  layout: 'auth' | 'app';
  onFinish: (next?: 'forgot') => void;
}) {
  const { session } = useSession();
  const [step, setStep] = useState<Step>(() => initialStep(link, !!session));
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Les jetons d'un lien ne sont échangés qu'une fois (StrictMode monte deux fois).
  const handled = useRef(false);

  useEffect(() => {
    if (link.kind !== 'tokens' || handled.current) return;
    handled.current = true;
    supabase.auth
      .setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
      .then(({ error: e }) =>
        setStep(
          e ? { name: 'invalid', message: isAuthRetryableFetchError(e) ? NETWORK_ERROR : LINK_INVALID } : { name: 'form' }
        )
      )
      .catch(() => setStep({ name: 'invalid', message: NETWORK_ERROR }));
  }, [link]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }
    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (!err) setStep({ name: 'done' });
      else if (isAuthApiError(err) && (err.status === 401 || err.code === 'session_not_found'))
        setStep({
          name: 'invalid',
          message: layout === 'app' ? 'Ta session a expiré : reconnecte-toi puis réessaie.' : LINK_INVALID,
        });
      else setError(updateErrorMessage(err));
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const backLabel = layout === 'app' ? 'Retour aux réglages' : 'Continuer';

  let title: string;
  let content: ReactNode;
  switch (step.name) {
    case 'checking':
      title = 'Nouveau mot de passe';
      content = <p className="muted">Vérification du lien…</p>;
      break;
    case 'invalid':
      title = layout === 'app' ? 'Modification impossible' : 'Lien invalide';
      content = (
        <>
          <p className="notice notice--error" role="alert">
            {step.message}
          </p>
          <div className="actions">
            {session ? (
              <button type="button" className="button button--primary" onClick={() => onFinish()}>
                Retour à l’app
              </button>
            ) : (
              <button type="button" className="button button--primary" onClick={() => onFinish('forgot')}>
                Demander un nouveau lien
              </button>
            )}
          </div>
        </>
      );
      break;
    case 'done':
      title = 'Mot de passe modifié';
      content = (
        <>
          <p className="muted">
            Ton nouveau mot de passe est enregistré{layout === 'auth' ? '. Tu es connecté.' : ' (il vaut aussi sur le mobile).'}
          </p>
          <div className="actions">
            <button type="button" className="button button--primary" onClick={() => onFinish()}>
              {backLabel}
            </button>
          </div>
        </>
      );
      break;
    case 'form':
      title = layout === 'app' ? 'Changer le mot de passe' : 'Nouveau mot de passe';
      content = (
        <form onSubmit={(e) => void submit(e)} style={{ display: 'contents' }}>
          <p className="muted">Choisis un nouveau mot de passe pour {session?.user.email ?? 'ton compte'}.</p>
          <input
            className="field"
            type="password"
            placeholder="Nouveau mot de passe"
            aria-label="Nouveau mot de passe"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            className="field"
            type="password"
            placeholder="Confirmation"
            aria-label="Confirmation du mot de passe"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <div className="actions">
            <button type="submit" className="button button--primary" disabled={busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            {layout === 'app' && (
              <button type="button" className="button button--secondary" disabled={busy} onClick={() => onFinish()}>
                Annuler
              </button>
            )}
          </div>
          {error && (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          )}
        </form>
      );
      break;
  }

  if (layout === 'auth') return <AuthLayout title={title}>{content}</AuthLayout>;
  return (
    <div className="screen">
      <ScreenHeader eyebrow="Réglages" title={title} />
      <CategoryCard category="contacts" icon={KeyRound} title="Compte">
        <div className="form">{content}</div>
      </CategoryCard>
    </div>
  );
}
