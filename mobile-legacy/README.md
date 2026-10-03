# mobile-legacy — référence de portage (lecture seule)

Copie figée du code de l'app mobile Road (Expo / React Native) au moment du
démarrage du portage desktop Tauri. **Rien ici n'est compilé ni livré** : ni
`tsconfig.json` ni Vite ne regardent ce dossier.

Il sert uniquement de référence pour porter les écrans lot par lot vers le
frontend web de `src/` (cf. DECISIONS.md §35). L'app mobile vivante est dans
son propre dépôt ; ce dossier sera supprimé une fois le portage terminé.

Le code métier pur (sans React Native) a été sorti d'ici vers `src/lib/` et
`src/data/` : c'est cette copie-là qui fait foi pour le desktop.
