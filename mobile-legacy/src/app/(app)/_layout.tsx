import { Stack } from 'expo-router';

import { useSession } from '../../auth/SessionProvider';
import { NotificationResponseHandler } from '../../notifications/NotificationResponseHandler';
import { NotificationScheduler } from '../../notifications/NotificationScheduler';
import { AppLockGate } from '../../security/AppLockGate';
import { SyncProvider } from '../../sync/SyncProvider';

export default function AppLayout() {
  const { session } = useSession();
  // Pendant la déconnexion, ce layout peut être rendu une dernière fois sans session.
  if (!session) return null;
  const userId = session.user.id;

  return (
    // Verrou biométrique : ni sync ni lecture des données avant le premier déverrouillage.
    <AppLockGate>
      <SyncProvider key={userId} userId={userId}>
        <NotificationScheduler />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* Au-dessus des onglets : plein écran pour éditer, retour vers la liste. */}
          <Stack.Screen
            name="notes/[id]"
            options={{ title: 'Note', headerBackTitle: 'Notes', headerShadowVisible: false }}
          />
          {/* Recherche globale, ouverte depuis la Vue du jour (loupe en en-tête). */}
          <Stack.Screen
            name="search"
            options={{ title: 'Rechercher', headerBackTitle: 'Retour', headerShadowVisible: false }}
          />
          {/* Ouverte depuis la Vue du jour ou les Réglages. */}
          <Stack.Screen
            name="weekly-review"
            options={{ title: 'Revue de la semaine', headerBackTitle: 'Retour', headerShadowVisible: false }}
          />
          {/* Ouverte depuis les Réglages (DECISIONS.md §32). */}
          <Stack.Screen
            name="prospect-purge"
            options={{ title: 'Purge RGPD', headerBackTitle: 'Retour', headerShadowVisible: false }}
          />
          {/* Ouvert depuis la Vue du jour, une tâche, une fiche contact ou le calendrier. */}
          <Stack.Screen
            name="reminder-form"
            options={{ title: 'Rappel', headerBackTitle: 'Retour', headerShadowVisible: false }}
          />
          {/* Ouvert depuis la Vue du jour ou le calendrier. */}
          <Stack.Screen
            name="appointment-form"
            options={{ title: 'Rendez-vous', headerBackTitle: 'Retour', headerShadowVisible: false }}
          />
        </Stack>
        {/* Après la Stack : la navigation est montée quand il traite un toucher reçu à froid. */}
        <NotificationResponseHandler />
      </SyncProvider>
    </AppLockGate>
  );
}
