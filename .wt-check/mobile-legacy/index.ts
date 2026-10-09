import { registerRootComponent } from 'expo';
import { createElement, type ComponentType } from 'react';

import { ErrorScreen } from './src/components/ErrorBoundary';

// L'arbre Expo Router (src/RouterRoot) est chargé via require() dans un
// try/catch : une erreur à l'évaluation d'un module a lieu avant tout render,
// hors de portée d'un ErrorBoundary. Sans ça, l'app n'enregistre aucun
// composant => écran blanc.
let Root: ComponentType;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Root = require('./src/RouterRoot').App;
} catch (e) {
  console.error('[startup] échec du chargement de App', e);
  Root = function StartupError() {
    return createElement(ErrorScreen, { title: 'Erreur au démarrage (chargement des modules)', error: e });
  };
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
