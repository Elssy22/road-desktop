import { Stack } from 'expo-router';

import { SyncIndicator } from '../../../../components/SyncIndicator';

// Le menu reste sous une section ouverte depuis un autre onglet (`withAnchor`),
// pour que « Retour » ramène au menu de l'Agence.
export const unstable_settings = { anchor: 'index' };

/**
 * Onglet « Agence » : une Stack imbriquée dans l'onglet. Le menu est la racine,
 * les sections (contacts, projets, …) s'empilent au-dessus en gardant la barre
 * d'onglets visible.
 */
export default function AgencyLayout() {
  return (
    <Stack screenOptions={{ headerShadowVisible: false, headerBackTitle: 'Retour' }}>
      <Stack.Screen name="index" options={{ title: 'Agence', headerRight: () => <SyncIndicator /> }} />
      <Stack.Screen name="contacts/index" options={{ title: 'Contacts', headerBackTitle: 'Agence' }} />
      <Stack.Screen name="contacts/[id]" options={{ title: 'Contact' }} />
      <Stack.Screen name="contact-form" options={{ title: 'Contact' }} />
      <Stack.Screen name="veille" options={{ title: 'Veille appels d’offres', headerBackTitle: 'Agence' }} />
      <Stack.Screen name="veille-settings" options={{ title: 'Mots-clés de la veille' }} />
      <Stack.Screen name="projects/index" options={{ title: 'Projets', headerBackTitle: 'Agence' }} />
      <Stack.Screen name="projects/[id]" options={{ title: 'Projet' }} />
      <Stack.Screen name="goals" options={{ title: 'Objectifs', headerBackTitle: 'Agence' }} />
      <Stack.Screen name="goal-form" options={{ title: 'Objectif' }} />
      <Stack.Screen name="key-dates" options={{ title: 'Échéancier', headerBackTitle: 'Agence' }} />
      <Stack.Screen name="key-date-form" options={{ title: 'Date clé' }} />
      <Stack.Screen name="calendar" options={{ title: 'Calendrier', headerBackTitle: 'Agence' }} />
      <Stack.Screen name="money" options={{ title: 'Finances', headerBackTitle: 'Agence' }} />
      <Stack.Screen name="money-form" options={{ title: 'Ligne financière' }} />
      <Stack.Screen name="meeting-report" options={{ title: 'Compte-rendu de RDV' }} />
      <Stack.Screen name="vault" options={{ title: 'Coffre', headerBackTitle: 'Agence' }} />
      <Stack.Screen name="vault-document" options={{ title: 'Document' }} />
    </Stack>
  );
}
