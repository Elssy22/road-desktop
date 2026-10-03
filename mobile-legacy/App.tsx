import type { Session } from '@supabase/supabase-js';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';

import { ErrorBoundary } from './src/components/ErrorBoundary';
import { DB_NAME, migrateDb } from './src/db/localDb';
import { supabase } from './src/lib/supabase';
import { AuthScreen } from './src/screens/AuthScreen';
import { TasksScreen } from './src/screens/TasksScreen';

// Recommandation Supabase pour React Native : ne rafraîchir le token
// qu'au premier plan.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

// Au-delà, on signale à l'écran que l'init SQLite semble bloquée.
const DB_INIT_SLOW_MS = 10_000;

async function initDb(db: SQLiteDatabase) {
  try {
    await migrateDb(db);
  } catch (e) {
    throw new Error(`migrateDb() a échoué sur ${DB_NAME}`, { cause: e });
  }
}

// SQLiteProvider appelle onError pendant son render : on relance une erreur
// contextualisée pour qu'elle soit affichée par l'ErrorBoundary qui l'entoure.
function handleDbError(e: Error): never {
  console.error('[SQLiteProvider]', e);
  throw new Error(`Ouverture/initialisation SQLite impossible (${DB_NAME}) : ${e.message}`, {
    cause: e,
  });
}

export default function App() {
  return (
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  );
}

function Root() {
  const [dbReady, setDbReady] = useState(false);
  const markDbReady = useCallback(() => setDbReady(true), []);

  return (
    <View style={styles.container}>
      {/* Rendu hors de SQLiteProvider (qui rend `null` tant que l'init n'est pas finie) :
          si ce texte n'apparaît pas, c'est que le JS n'a même pas démarré. */}
      {!dbReady && <DbInitStatus />}
      <ErrorBoundary title="Erreur d'initialisation SQLite">
        <SQLiteProvider databaseName={DB_NAME} onInit={initDb} onError={handleDbError}>
          <DbReadySignal onReady={markDbReady} />
          <AuthGate />
        </SQLiteProvider>
      </ErrorBoundary>
      <StatusBar style="auto" />
    </View>
  );
}

function DbInitStatus() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), DB_INIT_SLOW_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={styles.boot}>
      <Text style={styles.bootText}>Initialisation de la base locale…</Text>
      {slow && (
        <Text style={styles.bootWarning}>
          Toujours bloqué dans l&apos;init SQLite après {DB_INIT_SLOW_MS / 1000}s ({DB_NAME}).
        </Text>
      )}
    </View>
  );
}

/** Monté seulement une fois que SQLiteProvider rend ses enfants (base ouverte + migrée). */
function DbReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return null;
}

function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // getSession lit la session persistée localement : fonctionne hors ligne.
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) setAuthError(error.message);
        setSession(data.session);
      })
      .catch((e: unknown) => setAuthError(e instanceof Error ? e.message : String(e)))
      .finally(() => setReady(true));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color="#333" />
        <Text style={styles.bootText}>Lecture de la session…</Text>
      </View>
    );
  }
  return (
    <>
      {authError && <Text style={styles.bootWarning}>Session : {authError}</Text>}
      {session ? (
        <TasksScreen key={session.user.id} userId={session.user.id} />
      ) : (
        <AuthScreen />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  boot: { paddingTop: 64, paddingHorizontal: 16, alignItems: 'center', gap: 8 },
  bootText: { fontSize: 15, color: '#333' },
  bootWarning: { fontSize: 13, color: '#b00020', textAlign: 'center', padding: 8 },
});
