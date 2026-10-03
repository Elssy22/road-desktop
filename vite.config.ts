import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error pas de @types/node : seul process.env est utilisé ici
import process from 'node:process';

// Fourni par `tauri dev` quand la webview tourne sur un autre appareil (mobile) ;
// absent en desktop, où Vite écoute simplement sur localhost.
const host = process.env.TAURI_DEV_HOST;

// Réglages recommandés par Tauri v2 (https://v2.tauri.app/start/frontend/vite/).
export default defineConfig({
  plugins: [react()],
  // Ne pas effacer la console : les erreurs Rust de `tauri dev` y apparaissent.
  clearScreen: false,
  // VITE_* : variables de .env.local exposées au frontend (Supabase).
  // TAURI_ENV_* : infos de build injectées par la CLI Tauri.
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  server: {
    // Tauri attend un port fixe (devUrl de tauri.conf.json) : échouer plutôt que changer.
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**', '**/mobile-legacy/**'] },
  },
  build: {
    // macOS : la webview est WKWebView (moteur Safari du système).
    target: 'safari16',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
