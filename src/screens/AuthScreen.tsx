import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import { useState, type FormEvent, type ReactNode } from 'react';

import { useSession } from '../auth/SessionProvider';
import { supabase } from '../lib/supabase';

// Portage web de mobile-legacy/src/screens/AuthScreen.tsx (connexion, mot de
// passe oublié), en HTML standard. Pas de création de compte : Road est mono-
// utilisateur, et la clé anon embarquée dans l'app permettrait à n'importe qui
// de s'inscrire (DECISIONS.md §36, B2 ; inscriptions aussi à couper côté Supabase).

type Notice = { text: string; tone: 'error' | 'info' };

/**
 * Lien de réinitialisation : même deep link que le mobile (Redirect URL déjà
 * autorisée côté Supabase). Le desktop n'a pas encore de deep link à lui :
 * le lien s'ouvre dans l'app mobile, puis on se reconnecte ici.
 */
const RESET_REDIRECT_URL = 'road://reset-password';

const RESET_SENT =
  'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé. ' +
  'Ouvre-le depuis ton téléphone (l’app Road mobile doit être installée), ' +
  'puis reconnecte-toi ici avec le nouveau mot de passe.';
const NETWORK_ERROR = 'Impossible de joindre le serveur. Vérifie ta connexion puis réessaie.';

/**
 * Message affiché après une demande de réinitialisation. Ne doit jamais révéler
 * si un compte existe : Supabase répond déjà sans erreur pour un email inconnu,
 * et on ne détaille pas les autres erreurs serveur.
 */
function resetErrorMessage(error: unknown): string {
  if (isAuthRetryableFetchError(error)) return NETWORK_ERROR;
  if (isAuthApiError(error) && error.status === 429)
    return 'Trop de demandes : patiente quelques minutes avant de réessayer.';
  return 'La demande n’a pas pu aboutir. Réessaie dans un instant.';
}

/** Équivalent web de AuthLayout : surtitre « Road », grand titre, carte centrale. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="auth">
      <div className="auth__inner">
        <p className="eyebrow">Road</p>
        <h1 className="title">{title}</h1>
        <div className="panel">{children}</div>
      </div>
    </main>
  );
}

/**
 * Connexion email / mot de passe : même compte Supabase que le mobile, donc
 * même auth.uid() et mêmes données via la RLS.
 */
export function AuthScreen({ initialMode = 'signIn' }: { initialMode?: 'signIn' | 'forgot' }) {
  const { error: sessionError } = useSession();
  const [mode, setMode] = useState<'signIn' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const signIn = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setNotice({ text: error.message, tone: 'error' });
    } catch {
      setNotice({ text: NETWORK_ERROR, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setNotice({ text: 'Saisis une adresse email valide.', tone: 'error' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: RESET_REDIRECT_URL,
      });
      setNotice(error ? { text: resetErrorMessage(error), tone: 'error' } : { text: RESET_SENT, tone: 'info' });
    } catch {
      // resetPasswordForEmail relance les erreurs non-Auth : on ne plante pas l'écran.
      setNotice({ text: NETWORK_ERROR, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: 'signIn' | 'forgot') => {
    setMode(next);
    setNotice(null);
  };

  const forgot = mode === 'forgot';

  // Entrée dans le formulaire = action principale (connexion ou envoi du lien).
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    void (forgot ? sendReset() : signIn());
  };

  const message = notice ?? (sessionError ? { text: `Session : ${sessionError}`, tone: 'error' as const } : null);

  return (
    <AuthLayout title={forgot ? 'Mot de passe oublié' : 'Bonjour'}>
      <form onSubmit={onSubmit} style={{ display: 'contents' }}>
        <p className="muted">
          {forgot
            ? 'Indique ton email : on t’envoie un lien pour choisir un nouveau mot de passe.'
            : 'Connecte-toi pour retrouver ta journée.'}
        </p>
        <input
          className="field"
          type="email"
          placeholder="Email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {!forgot && (
          <input
            className="field"
            type="password"
            placeholder="Mot de passe"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {forgot ? (
          <div className="actions">
            <button className="button button--primary" type="submit" disabled={busy}>
              {busy ? 'Envoi…' : 'Envoyer le lien'}
            </button>
            <button className="button button--secondary" type="button" disabled={busy} onClick={() => switchMode('signIn')}>
              Retour à la connexion
            </button>
          </div>
        ) : (
          <div className="actions">
            <button className="button button--primary" type="submit" disabled={busy}>
              {busy ? 'Connexion…' : 'Se connecter'}
            </button>
            <button className="link" type="button" onClick={() => switchMode('forgot')}>
              Mot de passe oublié ?
            </button>
          </div>
        )}
        {message && (
          <p className={`notice notice--${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
