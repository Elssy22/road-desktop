import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SessionProvider, useSession } from '../auth/SessionProvider';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { DB_NAME, migrateDb } from '../db/localDb';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';

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

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function Root() {
  const { colors, scheme } = useTheme();
  const [dbReady, setDbReady] = useState(false);
  const markDbReady = useCallback(() => setDbReady(true), []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Rendu hors de SQLiteProvider (qui rend `null` tant que l'init n'est pas finie) :
          si ce texte n'apparaît pas, c'est que le JS n'a même pas démarré. */}
      {!dbReady && <DbInitStatus />}
      <ErrorBoundary title="Erreur d'initialisation SQLite">
        <SQLiteProvider databaseName={DB_NAME} onInit={initDb} onError={handleDbError}>
          <DbReadySignal onReady={markDbReady} />
          <SessionProvider>
            <RootNavigator />
          </SessionProvider>
        </SQLiteProvider>
      </ErrorBoundary>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

function DbInitStatus() {
  const { colors } = useTheme();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), DB_INIT_SLOW_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={styles.boot}>
      <Text style={[styles.bootText, { color: colors.textMuted }]}>
        Initialisation de la base locale…
      </Text>
      {slow && (
        <Text style={[styles.bootWarning, { color: colors.danger }]}>
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

/** Layout racine protégé : l'espace connecté n'existe que s'il y a une session. */
function RootNavigator() {
  const { session, ready } = useSession();
  const { colors } = useTheme();

  if (!ready) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.textMuted} />
        <Text style={[styles.bootText, { color: colors.textMuted }]}>Lecture de la session…</Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      {/* Cible du lien « mot de passe oublié » : ouvre elle-même une session, donc hors garde. */}
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  boot: { paddingTop: 64, paddingHorizontal: 16, alignItems: 'center', gap: 8 },
  bootText: { fontSize: 15 },
  bootWarning: { fontSize: 13, textAlign: 'center', padding: 8 },
});
