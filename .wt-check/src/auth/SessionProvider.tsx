import { isAuthRefreshDiscardedError, isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { notifyDataChanged } from '../data/base';
import { errorMessage } from '../lib/errors';
import { SESSION_REFUSED_EVENT, supabase } from '../lib/supabase';

// Repris du mobile. Sans équivalent d'AppState ici : dans une webview,
// supabase-js suspend et relance seul le rafraîchissement du token selon la
// visibilité de la page.

type SessionState = {
  session: Session | null;
  /** false tant que la session persistée n'a pas été relue. */
  ready: boolean;
  error: string | null;
  /** Session perdue sans déconnexion demandée : AuthScreen l'explique. */
  expired: boolean;
};

const SessionContext = createContext<SessionState>({ session: null, ready: false, error: null, expired: false });

/**
 * Nouvelle vérification après un échec passager : un peu plus que les 60 s
 * pendant lesquelles auth-js resservirait le même échec sans retenter
 * (REFRESH_FAILURE_COOLDOWN_MS).
 */
const RETRY_MS = 65_000;

// Déconnexion demandée depuis l'app (useSignOut) : pas de message « session expirée ».
let userSigningOut = false;
export function setUserSigningOut(value: boolean) {
  userSigningOut = value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, ready: false, error: null, expired: false });

  useEffect(() => {
    // getSession lit la session persistée localement : fonctionne hors ligne.
    supabase.auth
      .getSession()
      .then(({ data, error }) =>
        setState((s) => ({ ...s, session: data.session, ready: true, error: error?.message ?? null }))
      )
      .catch((e: unknown) => setState((s) => ({ ...s, ready: true, error: errorMessage(e) })));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const lost = event === 'SIGNED_OUT' && !userSigningOut;
      setState((s) => ({
        ...s,
        session,
        ready: true,
        // SIGNED_OUT peut arriver deux fois de suite (auth-js puis verify) : le
        // second, sans session à perdre, ne doit pas effacer le message.
        expired: event === 'SIGNED_IN' ? false : s.expired || (lost && s.session !== null),
      }));
      // Jeton renouvelé (après une veille ou une coupure réseau) : les lectures
      // refusées pendant l'indisponibilité de la session (lib/supabase.ts) sont relancées.
      // Différé : supabase-js déconseille d'appeler ses méthodes dans ce rappel.
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') setTimeout(notifyDataChanged, 0);
    });

    // Lecture refusée faute de jeton : session passagèrement indisponible
    // (réseau, veille) ou définitivement perdue (jeton de rafraîchissement
    // expiré ou révoqué) ? auth-js tranche à chaque renouvellement : une erreur
    // « retryable » (réseau, 5xx) laisse la session en place, un refus du
    // serveur (4xx) la retire. Dans le second cas, getSession renvoie une
    // erreur non retryable, ou plus rien si la session a déjà été retirée.
    let checking = false;
    let retry: number | undefined;
    const verify = async () => {
      if (checking) return;
      checking = true;
      window.clearTimeout(retry);
      try {
        const { data, error } = await supabase.auth.getSession();
        if (data.session) return;
        if (error && (isAuthRetryableFetchError(error) || isAuthRefreshDiscardedError(error))) {
          // Passager : TOKEN_REFRESHED relancera les lectures. Hors ligne,
          // l'évènement `online` reprendra la main.
          if (navigator.onLine) retry = window.setTimeout(() => void verify(), RETRY_MS);
          return;
        }
        // Session morte. auth-js a normalement déjà émis SIGNED_OUT ; la
        // déconnexion locale (sans appel réseau) le garantit, et l'état est
        // mis à jour même si l'évènement manquait.
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        setState((s) => ({ ...s, session: null, expired: s.expired || s.session !== null }));
      } catch {
        // getSession n'a pas abouti : rien ne permet de conclure, on réessaiera.
        if (navigator.onLine) retry = window.setTimeout(() => void verify(), RETRY_MS);
      } finally {
        checking = false;
      }
    };
    const onRefused = () => void verify();
    window.addEventListener(SESSION_REFUSED_EVENT, onRefused);

    // Retour du réseau : getSession relance le renouvellement si le jeton a
    // expiré entre-temps (TOKEN_REFRESHED ci-dessus), sinon on relit directement.
    const onOnline = () => {
      void supabase.auth.getSession().then(() => notifyDataChanged());
    };
    window.addEventListener('online', onOnline);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener(SESSION_REFUSED_EVENT, onRefused);
      window.removeEventListener('online', onOnline);
      window.clearTimeout(retry);
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
