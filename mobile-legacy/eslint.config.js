// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions : code Deno (Edge Functions), hors bundle de l'app.
    ignores: ["dist/*", "supabase/functions/*"],
  }
]);
