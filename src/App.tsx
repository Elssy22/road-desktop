import { SessionProvider, useSession } from './auth/SessionProvider';
import { AuthScreen } from './screens/AuthScreen';
import { HomeScreen } from './screens/HomeScreen';

function Root() {
  const { session, ready } = useSession();
  // Rien à afficher tant que la session persistée n'a pas été relue (quelques ms).
  if (!ready) return null;
  return session ? <HomeScreen /> : <AuthScreen />;
}

export function App() {
  return (
    <SessionProvider>
      <Root />
    </SessionProvider>
  );
}
