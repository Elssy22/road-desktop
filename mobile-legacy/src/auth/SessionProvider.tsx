import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { supabase } from '../lib/supabase';

// Recommandation Supabase pour React Native : ne rafraîchir le token
// qu'au premier plan.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

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
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setState((s) => ({ ...s, session, ready: true }))
    );
    return () => data.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/** À utiliser uniquement dans les routes protégées (session garantie). */
export function useUserId(): string {
  const { session } = useSession();
  if (!session) throw new Error('useUserId() appelé sans session active');
  return session.user.id;
}
