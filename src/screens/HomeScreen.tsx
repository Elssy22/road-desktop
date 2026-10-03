import { useState } from 'react';

import { useSession } from '../auth/SessionProvider';
import { supabase } from '../lib/supabase';

/** Écran provisoire après connexion, en attendant les vrais écrans (étape 2). */
export function HomeScreen() {
  const { session } = useSession();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
  };

  return (
    <main className="auth">
      <div className="auth__inner">
        <p className="eyebrow">Road</p>
        <div className="panel">
          <p style={{ margin: 0 }}>Connecté : {session?.user.email}</p>
          <button className="button button--secondary" type="button" disabled={busy} onClick={() => void signOut()}>
            Se déconnecter
          </button>
        </div>
      </div>
    </main>
  );
}
