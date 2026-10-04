// Règles de base TypeScript + React (DECISIONS.md §37) : de quoi éviter la dérive entre
// les lots, pas un style imposé. La mise en forme relève de Prettier (`npm run format`).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // mobile-legacy : référence React Native, non compilée ici ; supabase/functions : Deno.
  { ignores: ['dist', 'src-tauri', 'mobile-legacy', 'supabase', '.claude', '.cta-ref'] },
  {
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  }
);
