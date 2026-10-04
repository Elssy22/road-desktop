import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { notifyDataChanged } from '../data/base';
import { supabase } from '../lib/supabase';

// Repris du mobile. Sans équivalent d'AppState ici : dans une webview,
// supabase-js suspend et relance seul le rafraîchissement du token selon la
// visibilité de la page.

type SessionState = {
  session: Session | null;
  /** false tant que la session persistée n'a pas été relue. */
  ready: boolean;
  error: string | null;
};

const SessionContext = createContext<SessionState>({ session: null, ready: false, error: null });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, ready: false, error: null });

  useEffect(() => {
    // getSession lit la session persistée localement : fonctionne hors ligne.
    supabase.auth
      .getSession()
      .then(({ data, error }) =>
        setState({ session: data.session, ready: true, error: error?.message ?? null })
      )
      .catch((e: unknown) =>
        setState((s) => ({ ...s, ready: true, error: e instanceof Error ? e.message : String(e) }))
      );
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState((s) => ({ ...s, session, ready: true }));
      // Jeton renouvelé (après une veille ou une coupure réseau) : les lectures
      // refusées pendant l'indisponibilité de la session (lib/supabase.ts) sont relancées.
      // Différé : supabase-js déconseille d'appeler ses méthodes dans ce rappel.
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') setTimeout(notifyDataChanged, 0);
    });
    // Retour du réseau : getSession relance le renouvellement si le jeton a
    // expiré entre-temps (TOKEN_REFRESHED ci-dessus), sinon on relit directement.
    const onOnline = () => {
      void supabase.auth.getSession().then(() => notifyDataChanged());
    };
    window.addEventListener('online', onOnline);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
