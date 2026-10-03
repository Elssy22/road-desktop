import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { SessionProvider, useSession } from './auth/SessionProvider';
import { AppLayout } from './components/AppLayout';
import { AuthScreen } from './screens/AuthScreen';
import { ComingSoonScreen } from './screens/ComingSoonScreen';

function Root() {
  const { session, ready } = useSession();
  // Rien à afficher tant que la session persistée n'a pas été relue (quelques ms).
  if (!ready) return null;
  if (!session) return <AuthScreen />;

  // Routes en hash (#/today) : la webview Tauri sert des fichiers statiques,
  // aucune réécriture d'URL côté serveur n'est nécessaire au rechargement.
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/today" element={<ComingSoonScreen title="Aujourd'hui" />} />
          <Route path="/tasks" element={<ComingSoonScreen title="Tâches" />} />
          <Route path="/calendar" element={<ComingSoonScreen title="Calendrier" />} />
          <Route path="/agency/*" element={<ComingSoonScreen title="Agence" />} />
          <Route path="/notes/*" element={<ComingSoonScreen title="Notes" />} />
          <Route path="/settings/*" element={<ComingSoonScreen title="Réglages" />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export function App() {
  return (
    <SessionProvider>
      <Root />
    </SessionProvider>
  );
}
