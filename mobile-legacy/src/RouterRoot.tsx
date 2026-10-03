/// <reference types="expo/types" />
// (types de require.context ; normalement fournis par expo-env.d.ts, non versionné)
import { ExpoRoot } from 'expo-router';

import { ErrorBoundary } from './components/ErrorBoundary';

// Équivalent de `expo-router/entry`, mais enveloppé dans un ErrorBoundary : les
// routes sont évaluées pendant le render d'ExpoRoot, donc une erreur au
// chargement d'un module (ex. variables EXPO_PUBLIC_SUPABASE_* manquantes)
// s'affiche à l'écran au lieu d'un écran blanc en build release.
// Ce composant doit rester dans un fichier séparé de l'entrée (Fast Refresh).
export function App() {
  const ctx = require.context('./app', true, /\.tsx?$/);
  return (
    <ErrorBoundary title="Erreur au chargement des écrans">
      <ExpoRoot context={ctx} />
    </ErrorBoundary>
  );
}
