# Décisions d'architecture

Notes courtes sur les choix faits pendant le Lot 1 du MVP (Expo SDK 57).

## 1. Navigation : Expo Router

- Routes dans `src/app/` ; le code non-route reste dans `src/screens`, `src/components`, etc.
  Les fichiers de route sont de simples adaptateurs vers les écrans.
- Layout racine (`src/app/_layout.tsx`) : `ErrorBoundary` → thème → `SQLiteProvider` → session →
  `Stack` avec deux `Stack.Protected` (`(app)` si session, `sign-in` sinon).
  `redirectTo` n'existe qu'à partir du SDK 58 : on s'appuie sur le comportement par défaut
  des groupes protégés.
- Onglets : `Tabs` importé depuis `expo-router/js-tabs` (l'export `Tabs` de `expo-router`
  est déprécié dans cette version). Onglets JS plutôt que natifs (`unstable-native-tabs`) :
  API stable, rendu identique Android/macOS à venir.
- Point d'entrée : `index.ts` reste le `main` et monte `ExpoRoot` (`src/RouterRoot.tsx`)
  dans un `ErrorBoundary` au lieu d'utiliser `expo-router/entry`. On garde ainsi le
  garde-fou « erreur affichée plutôt qu'écran blanc » du commit 60ef072 : les modules de
  route sont évalués au render d'`ExpoRoot`, donc une variable d'env manquante s'affiche.

## 2. Moteur de sync partagé (`SyncProvider`)

- La boucle de sync du spike (déclencheurs : démarrage, retour réseau, premier plan,
  polling 15 s ; garde « une seule sync en vol + relance ») est déplacée telle quelle de
  `useOfflineTasks` vers `src/sync/SyncProvider.tsx`, monté une fois par utilisateur dans
  `src/app/(app)/_layout.tsx`. Plusieurs onglets lisent les tâches : un seul moteur évite
  des syncs concurrentes.
- Les hooks de données (`useOfflineTasks`, …) relisent SQLite quand `dataVersion` change
  (après écriture locale ou sync qui a poussé/tiré quelque chose).
- L'état de sync est affiché discrètement (icône en en-tête, détail dans Réglages) au lieu
  du bandeau permanent du spike.

## 3. Priorités du jour

- Stockées uniquement en local (`expo-sqlite/kv-store`, clé par utilisateur et par jour),
  sans sync, comme demandé. Un nouveau jour repart d'une liste vierge.

## 4. Notes (offline-first, même sync que les tâches)

- **Sync généralisée plutôt que dupliquée.** `syncEngine.ts` décrit chaque table synchronisée
  par un `SyncedTable<T>` (colonnes, curseur, lecture de l'outbox, normalisation, application
  LWW) ; `push`/`pull` sont restés identiques sur le fond, simplement paramétrés.
  La clé de curseur des tâches (`pull_cursor:<user>`) est conservée telle quelle pour ne rien
  re-télécharger ; les notes ont `pull_cursor:notes:<user>`.
- **Tables indépendantes.** `syncOnce` synchronise tâches puis notes, chacune dans son propre
  `try` : si la migration 003 n'est pas encore appliquée, l'erreur des notes est affichée mais
  les tâches continuent de se synchroniser. L'acquittement de l'outbox se fait par table.
- **Outbox commune.** Migration locale v3 : `sync_queue.task_id` renommée `row_id`, ajout de
  `entity` (`'tasks'` par défaut, donc les actions déjà en attente restent valides) et de la
  table locale `notes`. Le compteur « en attente » couvre tâches + notes.
- **Code tâches.** Seuls les appels à `enqueue` (paramètre `entity`) et la lecture de l'outbox
  (`readPendingTasks`) ont changé ; écritures, LWW et hooks des tâches sont inchangés.
  Les fonctions de données des notes sont dans `src/db/notesDb.ts`.
- **Serveur.** `supabase/migrations/003_notes.sql` : même structure (`server_updated_at`
  comme curseur, tombstone `deleted_at`), mêmes policies RLS que `tasks`. Le trigger LWW
  utilise une fonction générique `lww_before_write()` (même corps que `tasks_before_write`) ;
  `tasks` garde sa fonction d'origine pour ne pas toucher à ce qui marche.
- **Navigation.** Onglet `notes` (liste) dans `(tabs)` ; l'édition est une route de la Stack
  `(app)` (`/notes/[id]`), au-dessus des onglets, avec retour vers la liste. `/notes/new`
  ouvre une nouvelle note : l'id est généré tout de suite mais la ligne n'est écrite qu'à
  la première saisie (ouvrir puis quitter ne crée pas de note vide).
- **Édition.** Pas de bouton « Enregistrer » : sauvegarde automatique 700 ms après la dernière
  frappe, à la perte de focus et à la sortie de l'écran (évite une entrée d'outbox par
  caractère). La note est lue une seule fois à l'ouverture : une sync pendant l'édition
  n'écrase pas la saisie ; la sauvegarde suivante l'emporte (last-write-wins, à la note entière).
  Une note vidée n'est pas supprimée automatiquement : suppression explicite (corbeille).
- **Liste.** Épinglées en tête (section dédiée), puis par date de modification. Recherche
  côté client sur titre + corps, insensible à la casse et aux accents, tous les mots requis.
  Épinglage depuis la liste ou l'éditeur.

## 5. Lot 2 — onglet « Agence » et tables métier

- **Navigation : un seul onglet de plus.** La barre passe à 5 onglets (Aujourd'hui, Tâches,
  Notes, Agence, Réglages) — limite raisonnable, on n'ira pas au-delà. CRM, projets,
  objectifs et échéancier sont des outils de travail de fond, consultés moins souvent que
  la vue du jour : ils sont regroupés sous `Agence`, dont la racine est un menu (une ligne
  par section, avec un indicateur d'alerte : contacts à relancer, échéances proches…).
- **Stack imbriquée dans l'onglet** (`src/app/(app)/(tabs)/agency/_layout.tsx`) plutôt que
  des routes de la Stack `(app)` comme l'éditeur de notes : la barre d'onglets reste visible
  pendant la navigation dans les sections, et chaque section garde son historique quand on
  change d'onglet. L'onglet masque son propre en-tête (`headerShown: false`) ; c'est la
  Stack interne qui affiche les titres (et l'indicateur de sync sur le menu).
- **Formulaires = routes** (`agency/contact-form?id=…`) plutôt que des feuilles modales :
  plusieurs champs texte, clavier et défilement se comportent mieux dans un écran.
- **Couche données générique** (`src/db/entityTable.ts`) : chaque nouvelle table est décrite
  par un `EntitySpec` (nom + type de chaque colonne : `text`, `int`, `bool`, `date`, `ts`).
  Insert/update/suppression logique (+ outbox), lecture, application LWW du pull et
  normalisation des horodatages en sont dérivés ; `syncEngine.fromSpec()` en fait un
  `SyncedTable`. Les tables du Lot 2 n'ont ainsi qu'une description et des requêtes
  métier (`crmDb.ts`, …). `tasks` et `notes` gardent leur code dédié (rien de cassé).
- **Ordre de sync** : `TABLES` dans `syncEngine.ts`, parents avant enfants. Chaque table
  reste dans son propre `try` (une migration non appliquée n'affecte que sa table).
- **Pas de clé étrangère côté serveur entre tables synchronisées** : les tables se
  synchronisent indépendamment (un enfant peut arriver avant son parent, ou être poussé
  alors que la table parente est en erreur) et toutes les suppressions sont logiques.
  L'intégrité est assurée par l'app : supprimer un parent supprime logiquement ses enfants
  (contact → interactions) ou détache les liens facultatifs ; les lectures ignorent les
  liens vers des lignes supprimées.
- **Hook générique `useLocalQuery`** : une requête SQLite relancée à chaque `dataVersion`,
  même principe que `useOfflineTasks` sans un hook dédié par écran.
- **Migrations** : une migration locale (`PRAGMA user_version`) et une migration Supabase
  par fonctionnalité (004 CRM, …), mêmes colonnes techniques (`server_updated_at` curseur,
  `deleted_at` tombstone), même trigger générique `lww_before_write()` et mêmes policies
  RLS que `notes`.
- **Routes typées** : `experiments.typedRoutes` est actif ; `.expo/types/router.d.ts` est
  régénéré par `npx expo start` quand on ajoute des routes (à lancer une fois avant
  `npx tsc --noEmit`).

## 6. CRM

- `contacts.role` et `interactions.type` sont du texte libre (l'app propose des suggestions)
  pour ne pas figer le vocabulaire métier.
- **« Relance »** : badge si la dernière interaction date de 45 jours ou plus (`lib/followUp.ts`).
  Sans aucune interaction, on compte depuis la création du contact (un contact ajouté hier
  n'est pas à relancer). Calcul côté client, pas de notification.
- La liste charge la date de dernière interaction par sous-requête SQLite (une seule requête,
  pas de N+1). Filtre « À relancer » à côté de la recherche (nom, rôle, club, notes).
- Interaction : date du jour par défaut (heure courante), autre jour possible ; appui long
  pour supprimer. Supprimer un contact supprime son historique.

## 7. Projets & suivi

- **Numérotation des migrations Supabase décalée d'un cran** par rapport au brief : 004 est
  déjà prise par le CRM, donc projets + `tasks.project_id` = **005**, objectifs = 006,
  échéancier = 007. Migration locale v5.
- **`tasks.project_id` dans la même migration que les projets** (005) : les deux vont
  ensemble et l'app les utilise ensemble. Colonne nullable, sans FK ni changement de RLS ou
  de trigger. Le code dédié aux tâches n'a reçu que la colonne (lecture, push, LWW) et
  `setTaskProject`. Comme pour 002, la sync des tâches échoue tant que 005 n'est pas
  appliquée (l'outbox est conservée).
- **Ordre de sync** : `projects` avant `tasks` (une tâche rattachée arrive après son projet),
  `project_steps` en dernier. Simple confort, pas une contrainte (pas de FK).
- **Statut** : texte libre côté base (`actif`, `en_pause`, `terminé`), valeurs proposées par
  l'app (`PROJECT_STATUSES`). La liste est filtrée sur « Actif » par défaut, avec compteur
  par statut et « Tous ».
- **Réordonner les étapes : flèches haut/bas** plutôt qu'un glisser-déposer (pas de
  dépendance native en plus, fiable au doigt, accessible). Un déplacement renumérote les
  positions 0..n-1 dans l'ordre affiché et n'écrit que les étapes qui changent : deux
  appareils qui ajoutent une étape en même temps (même position) se réconcilient au
  premier déplacement. Tri d'affichage : `position`, puis `created_at`.
- **Tâches liées** : on rattache une tâche existante (à faire, sans projet) depuis la fiche
  projet ; appui long pour la détacher ; cocher/décocher directement depuis la fiche. Les
  tâches restent gérées dans l'onglet Tâches (pas de création de tâche depuis le projet).
- **Suppression d'un projet** : ses étapes sont supprimées logiquement, ses tâches sont
  conservées et détachées (`project_id = null`, poussé comme une modification).
- **Édition titre/description** dans la fiche, enregistrée à la perte de focus ; les champs
  sont lus une fois à l'ouverture (même principe que l'éditeur de notes). Un titre vidé
  reprend sa valeur précédente.

## 8. Objectifs

- Table `goals` (migration Supabase **006**, locale v6), même modèle que le CRM.
  `progress` entier 0–100 : contrainte `check` côté serveur, borné par l'app
  (`clampProgress`) avant écriture.
- **Liste** triée : objectifs en cours d'abord, par date cible (sans date ensuite), atteints
  en dernier. Barre de progression (verte à 100 %), date cible en rouge si dépassée, lien
  vers le projet associé (ignoré si le projet a été supprimé).
- **Formulaire = route** (`agency/goal-form?id=…`) comme pour les contacts : titre,
  avancement (±10 % ou paliers 0/25/50/75/100), date cible, projet (projets non terminés +
  celui déjà lié). Suppression depuis le formulaire.
- Supprimer un projet détache ses objectifs (`project_id = null`), comme ses tâches.
- Objectifs de chiffre d'affaires calculés depuis Qonto : voir §34.

## 9. Échéancier contractuel

- Table `key_dates` (migration Supabase **007**, locale v7). `category` en texte libre
  (`fin_contrat`, `licence`, `autre` proposés), `date` = colonne `date` sans fuseau.
- **Alertes calculées côté client** (`lib/keyDateAlerts.ts` ; notification locale à J-7
  ajoutée au §18) : badge
  J-7 ou moins en rouge, J-30 en orange, J-90 en bleu ; rien au-delà ni une fois la date
  passée. Libellé « Aujourd'hui », « Demain », « J-12 ».
- **Liste** : « À venir » (de la plus proche à la plus lointaine, par défaut) et « Passées »
  (la plus récente d'abord) ; une échéance passée n'est pas supprimée (historique).
- **Vue du jour** : encart « Échéances proches » si au moins une date clé tombe entre
  aujourd'hui et J+7 ; masqué sinon. Les échéances passées n'y figurent pas (elles
  resteraient indéfiniment). Le badge du menu Agence compte les mêmes échéances.
- **Navigation depuis un autre onglet** : `unstable_settings.anchor = 'index'` sur la Stack
  Agence et `router.push(…, { withAnchor: true })` depuis la Vue du jour, pour que
  « Retour » ramène au menu Agence plutôt que de laisser une Stack sans racine.
- Lien facultatif vers un contact (choisi dans une feuille). Supprimer un contact détache
  ses dates clés (`contact_id = null`) au lieu de les supprimer.
- **Routes typées** : `.expo/types/router.d.ts` est mis à jour à la main dans cet
  environnement (pas de `expo start`) ; `npx expo start` le régénère pour les routes réelles.

## 10. Lot 3 — recherche globale

- **Accès** : loupe dans l'en-tête de la Vue du jour (à gauche de l'indicateur de sync).
  L'écran `/search` est une route de la Stack `(app)`, au-dessus des onglets (comme
  l'éditeur de notes) : plein écran, champ focalisé à l'ouverture, retour vers la Vue du jour.
- **Recherche côté client**, sans FTS : on relit les listes locales (SQLite) et on filtre
  avec `makeMatcher` (même règle que la recherche des notes : casse et accents ignorés,
  tous les mots requis). Tâches : titre ; notes : titre + corps ; contacts : nom ;
  projets : titre. Volume d'un agent solo = quelques centaines de lignes, largement suffisant.
- **Résultats groupés par type**, 20 par groupe au plus (« + N autres : précise la
  recherche »). Tâches à faire avant les tâches faites.
- **Ouverture d'un résultat** :
  - note → éditeur poussé au-dessus de la recherche (retour = résultats conservés) ;
  - contact / projet → `router.navigate(…, { withAnchor: true })` : la recherche se ferme,
    on bascule sur l'onglet Agence avec le menu sous la fiche (même principe que la Vue du jour) ;
  - tâche → pas d'écran de détail dans l'app : on peut la cocher sur place et l'appui ouvre
    son menu habituel (échéance, priorité, suppression) directement dans la recherche.
- **Vocabulaire** : l'agence gère des clients (créateurs, clubs, coachs, agents, sociétés,
  associations), pas de joueurs. Suggestions de rôle, placeholders et commentaires SQL
  ont été neutralisés (plus de « joueur », « entraîneur », « mercato »).

## 11. Suivi financier léger

- Table `money_items` (migration Supabase **008**, locale v8), même modèle que le CRM
  (`EntitySpec`, sync générique, LWW, RLS « own rows »). Pas de compta : libellé, montant,
  devise, type, statut, échéance, liens facultatifs contact / projet.
- **Montant** : `numeric(12,2)` côté serveur (`check (amount >= 0)`), `REAL` en SQLite.
  Nouveau type de colonne `num` dans `entityTable.ts` : passé tel quel au push, converti en
  nombre au pull si PostgREST renvoie du texte. Saisie « 1 200,50 » ou « 1200.50 », deux
  décimales max, montants négatifs refusés (un avoir = une ligne à part).
- **Devise** : code ISO 4217, `EUR` par défaut ; EUR/USD/GBP/CHF proposés. Les totaux sont
  **par devise** (« 1 200,00 € · 300,00 $ »), jamais convertis.
- **`kind` et `status` en texte libre** côté base (comme `projects.status`), valeurs
  proposées par l'app : `commission_attendue` / `facture_emise` / `paiement_recu` et
  `en_attente` / `payé` / `en_retard`. Choisir « Paiement reçu » passe le statut à « Payé ».
- **Retard calculé** : une ligne `en_attente` dont l'échéance est passée s'affiche dans le
  groupe « En retard » (`effectiveStatus`) sans être réécrite — pas d'écriture ni de sync
  déclenchée par le simple passage du temps. Le statut `en_retard` reste saisissable à la main.
- **Liste** (`Agence › Finances`) : groupes En retard → En attente → Payé, total par groupe
  en en-tête, échéance la plus proche d'abord. Le menu Agence affiche le nombre de lignes
  non payées et un badge « N en retard ».
- **Formulaire = route** (`agency/money-form?id=…`) comme les autres sections.
- Supprimer un contact ou un projet **détache** ses lignes financières (`detachWhereInTx`,
  nouvel utilitaire générique) au lieu de les supprimer.

## 12. Revue hebdomadaire

- **Écran `/weekly-review`** dans la Stack `(app)` (au-dessus des onglets), accessible depuis
  une ligne en bas de la Vue du jour et depuis Réglages › Organisation.
- **Lecture seule, aucune nouvelle table métier** : tout est relu dans SQLite à chaque
  `dataVersion` (`useLocalQuery`). Semaine = lundi → dimanche, jours locaux (`startOfWeek`).
  - Tâches terminées de la semaine : `done = 1` et `updated_at` dans la semaine.
    **Approximation** : il n'y a pas de `completed_at`, c'est la dernière modification
    d'une tâche faite qui compte (une tâche cochée lundi puis renommée mardi compte
    mardi ; une tâche cochée la semaine d'avant puis modifiée réapparaît). Suffisant pour
    un bilan ; une colonne `completed_at` synchronisée pourra venir plus tard.
  - En retard (à faire, échéance passée), projets **actifs** (étapes faites / total),
    objectifs (avancement, date cible) : état **actuel**.
  - Échéances de la semaine **suivant** la semaine revue (échéancier).
- **Navigation entre semaines** (flèches, jamais au-delà de la semaine en cours) : faire
  la revue le lundi matin sur « Semaine dernière » est le cas courant.
- **Bilan libre** (« Ce qui a été fait », « Ce qui glisse », « Priorité de la semaine
  prochaine ») : table **locale** `weekly_reviews` (migration locale v9), clé
  `(user_id, week_start)`, **sans outbox ni sync** — choix MVP assumé : le bilan reste sur
  l'appareil où il a été écrit et disparaît si l'app est désinstallée. Sauvegarde
  automatique 600 ms après la frappe, à la perte de focus et à la sortie de l'écran.
  Pas de migration Supabase pour cette étape.

## 13. Reporté au Lot 4

> Traité au Lot 4 : CR de RDV → §15, coffre chiffré → §16 (les choix y diffèrent
> parfois des propositions ci-dessous).

### Coffre documentaire chiffré — non fait

Pas fait dans le Lot 3, volontairement. Ce n'est pas faute de temps : il reste trop de
décisions et de risques pour le livrer sans test réel.

- **Gestion de la clé = décision produit.** Le chiffrement côté client ne vaut que par sa
  clé. Une clé par appareil (SecureStore) rend un document envoyé depuis l'iPhone
  illisible sur le Mac à venir. Une clé dérivée d'une phrase secrète (KDF en JS sous Hermes,
  lente) implique qu'un oubli fait perdre tous les contrats, sans récupération possible.
  Landry doit choisir avant qu'on code.
- **Nouveaux modules natifs** : `expo-document-picker` et `expo-file-system` (absents
  aujourd'hui), plus une lib AES en JS pur (`expo-crypto` ne fait que hash et aléa). Ça
  impose un nouveau build de dev iOS. Leur prise en charge par react-native-macos reste à
  vérifier (cf. SETUP_MAC.md).
- **Offline-first des fichiers** : il faut une file d'envoi dédiée (copie locale, envoi au
  retour du réseau, reprise après échec), distincte de l'outbox des lignes. Impossible à
  valider sans appareil ni projet Supabase de test, et ce sont des contrats clients.

**Proposition pour le Lot 4** (à valider) :
1. Table `documents` (id, user_id, title, file_path local, storage_path, contact_id,
   project_id, mime, size, created_at, updated_at, deleted_at), synchronisée via
   `EntitySpec` (migration Supabase **010** — 009 est prise par Qonto, §14 —, locale v10). Le fichier suit sa propre file d'envoi.
2. Bucket Storage **privé** `documents`, chemins `<user_id>/<document_id>`, policies
   `storage.objects` limitées à `(storage.foldername(name))[1] = auth.uid()::text` pour
   select/insert/update/delete. C'est le minimum même avec chiffrement.
3. Chiffrement AES-GCM côté client avant envoi si la clé est validée (option recommandée :
   phrase secrète + clé de données enveloppée et stockée chiffrée sur Supabase, ce qui
   donne le multi-appareil sans que le serveur voie la clé). Sinon, compromis documenté :
   bucket privé + RLS stricte seulement (chiffrement au repos assuré par Supabase, mais
   lisible par qui détient la service key).

### CR de RDV assisté par IA — hors périmètre (Lot 4 ou suivant)

Intention seulement, rien n'est codé. Depuis la fiche d'un contact ou d'un projet : dictée
vocale du compte rendu → transcription → appel LLM qui produit un résumé (enregistré comme
interaction du contact) et une liste de tâches proposées. L'utilisateur coche les tâches à
créer : rien n'est créé sans validation. À cadrer avant de coder :
- où tourne l'appel LLM : Edge Function Supabase, pour que la clé d'API ne soit jamais
  dans l'app ;
- coût et confidentialité : contenu des RDV clients envoyé à un tiers ;
- comportement hors ligne : enregistrement audio local, traitement au retour du réseau ;
- permissions micro (config plugin dans `app.json`).

## 14. Import Qonto (banque pro)

**Objectif** : alimenter Finances avec les données réelles de Qonto (transactions, factures
clients, devis), sans saisie manuelle. **Import seulement** : l'app n'écrit jamais dans Qonto.

### Architecture et sécurité

```
App Expo ──functions.invoke('qonto-sync') + JWT──▶ Edge Function ──slug:clé──▶ API Qonto
   ▲                                                    │ (service role)
   └──────── select qonto_items (RLS user_id) ◀─────────┘ upsert qonto_items
```

- **La clé Qonto ne quitte jamais le serveur.** Elle vit dans les secrets Supabase
  (`QONTO_ORGANIZATION_SLUG`, `QONTO_SECRET_KEY`), lus par `Deno.env.get()` dans
  `supabase/functions/qonto-sync/`. Rien dans `src/`, aucun `EXPO_PUBLIC_*`, aucun bundle.
  En-tête Qonto : `Authorization: {slug}:{clé}` (concaténation, pas du Basic Auth).
  La fonction ne journalise jamais cet en-tête ; seuls le code HTTP et le message d'erreur
  Qonto (tronqué) remontent.
- **Authentification** : `verify_jwt` (défaut) au niveau de la passerelle, puis
  `auth.getUser(jwt)` dans la fonction pour obtenir l'utilisateur appelant.
- **Autorisation — ajout par rapport à la demande initiale** : un JWT valide ne suffit pas.
  N'importe quel compte du projet Supabase (inscription ouverte, compte de test…) pourrait
  sinon déclencher l'import et lire les données bancaires de l'agence. La fonction exige
  que l'appelant figure dans le secret `QONTO_ALLOWED_USER_IDS` (UUID séparés par des
  virgules) et **refuse tout (403) si le secret est absent**.
- **Écriture via la service role uniquement** : la fonction crée son client avec la clé
  secrète (`SUPABASE_SECRET_KEYS.default`, repli sur l'historique
  `SUPABASE_SERVICE_ROLE_KEY`). Côté base (migration 009), `authenticated` n'a que
  `select`, filtré par la policy `user_id = auth.uid()` ; aucune policy d'écriture.
- Le code Deno est exclu de `tsconfig.json` et d'ESLint (globals `Deno`, imports `npm:`) :
  il n'est jamais importé par l'app ni embarqué par Metro.

### Données (`qonto_items`, migration 009)

- `qonto_id` unique (UUID Qonto) → upsert idempotent : relancer la sync met à jour, ne
  duplique pas. `raw` garde l'objet Qonto complet pour de futurs usages.
- `kind` : `transaction` / `client_invoice` / `quote` (endpoint `/v2/quotes` vérifié dans la
  doc Qonto, même scope que les factures). `/v2/clients` n'est **pas** importé : ce n'est pas
  le CRM de l'app.
- `amount` **signé** pour les transactions (débit négatif) ; total TTC (`total_amount.value`)
  pour factures et devis. Pas de contrainte `>= 0`, contrairement à `money_items`.
- `qonto_date` : date de règlement (ou d'émission si en cours) pour une transaction, date
  d'émission pour facture/devis — tronquée en date UTC. `due_date` (ajout) : échéance de
  facture ou expiration de devis, pour calculer le retard comme dans `money_items`.
- `status` : statut Qonto brut (`unpaid`, `paid`, `pending_approval`, `completed`…), traduit
  uniquement à l'affichage.

### Périmètre d'import

- Transactions : tous les comptes (`/v2/bank_accounts`), statuts `completed` et `pending`,
  **modifiées depuis 90 jours** (`TRANSACTIONS_WINDOW_DAYS`). Les plus anciennes déjà
  importées restent en base.
- Factures et devis : liste complète à chaque sync (volumes faibles).
- Chaque type est importé indépendamment : un type en erreur (ex. scope manquant sur la clé)
  n'empêche pas les autres ; la réponse détaille `imported` par type et `errors`.
- **Limite connue** : un élément supprimé côté Qonto (brouillon de facture supprimé) reste
  dans `qonto_items`. Pas de purge pour l'instant.

### Côté app

- `Agence › Finances` : section **« Depuis Qonto »** sous les lignes saisies à la main,
  sous-titrée « Importé automatiquement · lecture seule ». Lignes non cliquables.
- Bouton **« Synchroniser Qonto »** → `supabase.functions.invoke('qonto-sync')`, indicateur
  de chargement, puis message : nombre importé par type, ou erreur (corps JSON de la
  fonction lu via `FunctionsHttpError.context`).
- Regroupement par type puis statut, avec total par devise : Factures en retard (impayée,
  échéance passée — calculé, pas stocké) → impayées → brouillons → payées → annulées ;
  Devis en attente → acceptés → annulés ; Transactions en cours → effectuées.
- **Hors moteur offline-first, volontairement** : simple `select` à l'ouverture de l'écran et
  après une sync (300 lignes max, les plus récentes). Hors ligne, la section est vide ; les
  `money_items` restent pleinement offline et ne sont pas modifiés par l'import.

### Mise en service

1. Appliquer `supabase/migrations/009_qonto_items.sql` (SQL Editor).
2. Ajouter le secret d'autorisation (UUID du compte de Landry, visible dans
   Authentication › Users) : `supabase secrets set QONTO_ALLOWED_USER_IDS=<uuid>`.
3. Déployer : `supabase functions deploy qonto-sync`.
4. Vérifier que la clé API Qonto donne accès aux factures/devis (scope
   `client_invoices.read`) ; sinon seules les transactions s'importent et l'écran l'indique.

## 15. Lot 4 — compte-rendu de RDV assisté par IA

```
App ──functions.invoke('summarize-meeting', {notes, today}) + JWT──▶ Edge Function ──Bearer──▶ OpenRouter
 ▲                                                                   (sans état)               (claude-haiku-4.5)
 └── { summary, suggested_tasks[] } ◀───────────────────────────────────┘
 └── validation → note + tâches cochées (+ interaction) écrites en local → outbox → sync habituelle
```

- **Dictée = clavier natif** : pas d'enregistrement audio, pas de permission micro, pas de
  module natif (le cadrage du §13 prévoyait une transcription : abandonné, le micro du
  clavier iOS/Android suffit). Fonctionne dans Expo Go.
- **Edge Function `summarize-meeting`, sans état** : ne lit ni n'écrit en base. Clé
  `OPENROUTER_API_KEY` lue par `Deno.env.get()`, jamais dans l'app ni dans les logs ; le
  texte des notes n'est jamais journalisé (seuls codes HTTP et messages d'erreur tronqués).
- **Auth** : `verify_jwt` (défaut) à la passerelle puis `auth.getUser(jwt)` dans la
  fonction, avec la **clé publique** du projet (`SUPABASE_PUBLISHABLE_KEYS.default`, repli
  `SUPABASE_ANON_KEY`) — la service role est inutile puisque rien n'est écrit.
- **Autorisation — écart assumé avec qonto-sync** : ici pas de données sensibles côté
  serveur, seulement un coût OpenRouter. Le secret `SUMMARIZE_ALLOWED_USER_IDS` est donc
  **facultatif** : s'il est défini, seuls ces comptes peuvent appeler la fonction ; sinon,
  tout compte authentifié du projet. Recommandé de le définir si l'inscription est ouverte.
- **Sortie JSON** : `response_format: { type: 'json_schema', strict: true }` (doc
  OpenRouter « Structured Outputs », supporté par le fournisseur Anthropic). Si OpenRouter
  répond 400 (paramètre refusé par le fournisseur routé), **second essai sans
  `response_format`**, avec le seul prompt strict. Dans les deux cas, **parsing défensif** :
  retrait des blocs de code Markdown, extraction du premier `{…}`, validation champ par
  champ (résumé non vide obligatoire, tâches sans titre ignorées, `due_date` gardée
  seulement si c'est une vraie date `YYYY-MM-DD`, 20 tâches max). JSON illisible → 502
  `invalid_output`, message « réessaie ». L'app revalide la forme de la réponse.
- **Dates relatives** : l'app envoie sa date locale (`today`) pour que « vendredi » ou
  « dans 15 jours » soient résolus par le modèle.
- **Garde-fous** : 20 000 caractères max en entrée (413), `max_tokens` 2000,
  `temperature` 0.2, délai 45 s.
- **Erreurs** : réponse `{ error, code }` avec un message en français ; codes HTTP
  OpenRouter traduits (401/403 clé invalide, 402 crédits épuisés, 429 trop de demandes,
  5xx/408 indisponible, délai dépassé, réseau). Erreur réseau côté app
  (`FunctionsFetchError`) → « Pas de connexion ».

### Écran `Agence › Compte-rendu de RDV` (`/agency/meeting-report`)

- Accès : nouvelle ligne du menu Agence, et icône ✨ dans l'en-tête de la fiche contact
  (`?contactId=…` pré-remplit le contact). Contact choisi avec la même feuille que
  l'échéancier.
- **Notes brutes jamais perdues** : brouillon dans le kv-store local
  (`meeting_draft:<user>`, 600 ms après la frappe et à la sortie de l'écran). Il survit à
  un échec IA, à un retour arrière ou à la fermeture de l'app ; effacé seulement après
  « Enregistrer » ou via « Effacer » (avec confirmation). Un seul brouillon par utilisateur.
- **Validation explicite** : le résultat s'affiche (résumé **modifiable**, tâches cochées
  par défaut, titre et échéance modifiables). Rien n'est écrit avant « Enregistrer ».
  « Relancer le résumé » remplace le résultat affiché.
- **Enregistrer** = une seule transaction SQLite locale (`db/meetingReportDb.ts`) puis
  l'outbox habituelle (fonctionne hors ligne une fois le résumé obtenu) :
  - une **note** « CR RDV · <contact> · <date> » : le résumé, puis les notes brutes sous
    « — Notes brutes — » ;
  - une **tâche** par suggestion cochée (`due_date` si fournie) ;
  - si un contact est lié et la case « Ajouter à l'historique » cochée (par défaut) : une
    **interaction** `rdv` avec le résumé (tronqué à 280 caractères, le CR complet est dans
    la note).
- **Écart : pas de colonne `notes.contact_id`.** La table `notes` n'a pas de lien vers un
  contact ; en ajouter un demandait une migration serveur + locale et de toucher au code
  dédié des notes (sync, LWW) pour un seul usage. Le lien est donc porté par le titre de
  la note et par l'interaction dans l'historique du contact (case décochable). Les tâches
  n'ont pas non plus de lien contact (aucune colonne prévue).
- **Confidentialité** : le texte part chez OpenRouter puis Anthropic ; l'écran le dit
  sous le champ de saisie. Aucune migration SQL pour cette étape.
- **Non testé de bout en bout** dans cet environnement (pas de Deno, de CLI Supabase ni
  d'appareil) : tsc et lint passent côté app ; la fonction est à vérifier après déploiement.

### Mise en service

1. Vérifier le secret : `supabase secrets list` (doit contenir `OPENROUTER_API_KEY`).
2. Facultatif : `supabase secrets set SUMMARIZE_ALLOWED_USER_IDS=<uuid>`.
3. Déployer : `supabase functions deploy summarize-meeting`.

## 16. Lot 4 — coffre documentaire chiffré

Réponse aux questions ouvertes du §13 : **clé dérivée d'une phrase secrète**, choisie par
l'utilisateur (décision du brief Lot 4), et **pas de nouveau build** : tout tourne dans
Expo Go.

### Dépendances (toutes compatibles Expo Go)

- `expo-document-picker`, `expo-file-system`, `expo-sharing` : modules Expo inclus dans
  Expo Go (vérifié dans la doc SDK 57), installés par `npx expo install` (versions ~57).
  `expo-sharing` ajoute son config plugin dans `app.json` (sans effet dans Expo Go).
- `@noble/ciphers` et `@noble/hashes` 2.4 : **JS pur**, audités, sans module natif.
  `expo-crypto` (déjà présent) fournit l'aléa (nonces) ; il ne fait ni AES ni PBKDF2.
- **Installation** : l'arbre npm avait déjà un conflit de peer deps (react-dom /
  react-native-worklets, sans lien avec ce lot). `--legacy-peer-deps` retirait 33 paquets
  (react-dom, reanimated, metro-config…) : abandonné. Installé avec
  `npx expo install … -- --force` : le lockfile ne gagne que les 5 paquets.

### Cryptographie (`src/lib/vault.ts`)

- **KDF** : PBKDF2-HMAC-SHA256, **150 000 itérations**, clé de 256 bits, phrase normalisée
  NFC, `pbkdf2Async` (rend la main à l'UI). PBKDF2 plutôt que scrypt : scrypt en JS pur
  est beaucoup plus lent et gourmand en mémoire sous Hermes. 150 k est en dessous des
  600 k recommandés par l'OWASP (cible WebCrypto/natif) : compromis pour un calcul en JS
  pur de quelques secondes sur mobile, **à mesurer sur l'iPhone** et à remonter si c'est
  rapide. Le nombre d'itérations est écrit dans chaque fichier et dans la config locale.
- **Sel déterministe par utilisateur** : `SHA-256("agence-vault/v1/" + user_id)[0..16]`.
  La même phrase donne donc la même clé sur tous les appareils, **sans rien stocker côté
  serveur**. Le sel n'est pas secret ; il est unique par compte, ce qui suffit à
  empêcher une attaque mutualisée.
- **Vérification locale** : seul `SHA-256("agence-vault/verify" ‖ clé)` est stocké, dans le
  kv-store SQLite (`vault:<user>`) avec le nombre d'itérations. **La phrase n'est stockée
  nulle part**, ni la clé sur disque. La clé vit en mémoire (Map module) jusqu'au
  verrouillage (cadenas dans l'en-tête du coffre) ou à la fermeture de l'app.
- **Chiffrement** : AES-256-GCM, nonce aléatoire de 96 bits par fichier, en-tête
  authentifié en AAD. Format : `"AGV1" | itérations u32 | sel 16 | nonce 12 | GCM(clair)`,
  avec `clair = len u32 | {"name","mime"} JSON | octets`. Le **nom et le type du fichier
  sont chiffrés** ; seul le **titre** saisi dans l'app est en clair (table `documents`),
  l'écran d'ajout le signale.
- **Mauvaise phrase** : refusée au déverrouillage (hash) ; sur un autre appareil configuré
  avec une autre phrase, l'échec d'authentification GCM donne « chiffré avec une autre
  phrase secrète, ou fichier corrompu ». « Autre phrase / autre appareil ? » oublie la
  config locale pour ressaisir.
- **Pas de changement de phrase** (il faudrait rechiffrer tous les fichiers) ni de
  récupération : l'avertissement « si vous l'oubliez, les documents chiffrés sont perdus
  définitivement, sans récupération possible » est affiché à la création, avec une case
  « J'ai compris » obligatoire et une double saisie (10 caractères min.).

### Données et stockage

- Table `documents` (migration Supabase **010**, locale **v10**) exactement selon le brief
  (id, user_id, title, storage_path, contact_id, project_id, created_at, updated_at,
  deleted_at) + `server_updated_at` (curseur de sync), synchronisée via `EntitySpec` comme
  le CRM : même trigger LWW, mêmes policies RLS « own rows ».
- Bucket **privé** `vault-documents` créé par la migration (`insert into storage.buckets`,
  limite 21 Mo). Policies `storage.objects` select/insert/update/delete limitées à
  `bucket_id = 'vault-documents' and (storage.foldername(name))[1] = auth.uid()::text`
  (syntaxe de la doc Supabase « Storage access control »). Chemins
  `<user_id>/<uuid>.bin`, `contentType` `application/octet-stream`.
- **Envoi en ligne uniquement** : lecture → chiffrement → upload, et la ligne `documents`
  n'est écrite (outbox) **qu'après** l'upload réussi : jamais de ligne sans fichier. Hors
  ligne, l'ajout échoue avec un message ; pas de file d'envoi de fichiers (§13) pour ce MVP.
- **Téléchargement** : URL signée de 60 s + `File.downloadFileAsync` vers le cache (pas de
  `Blob`, peu fiable sous React Native), lecture des octets, suppression du fichier chiffré
  temporaire, déchiffrement en mémoire.
- **Ouverture** : le clair est écrit dans `cache/vault-open/` puis proposé via
  `expo-sharing` (« Ouvrir avec… »). **Compromis** : une copie en clair existe le temps
  de l'ouverture ; le dossier est vidé à chaque ouverture et en quittant le coffre (l'OS
  peut aussi purger le cache). Pas d'aperçu intégré.
- **Taille max 20 Mo** : tout est chiffré en mémoire, en JS, sur le thread UI.
- **Suppression** : logique pour la ligne (sync habituelle) + suppression immédiate du
  fichier dans Storage en *best effort* ; en cas d'échec (hors ligne), un fichier chiffré
  orphelin reste, illisible. Supprimer un contact ou un projet **détache** ses documents.

### Non vérifié dans cet environnement

Pas d'appareil, de projet Supabase de test ni d'exécution de Node/Metro autorisée ici :
tsc et lint passent, mais **ni le bundling Metro des paquets ESM `@noble/*`, ni la durée
réelle du PBKDF2 sous Hermes, ni l'aller-retour upload/téléchargement n'ont été testés**.
À valider sur l'iPhone dans Expo Go : créer le coffre (mesurer le temps), ajouter un PDF,
le rouvrir, verrouiller, rouvrir avec une mauvaise phrase (refus attendu).

### Mise en service

1. Appliquer `supabase/migrations/010_documents.sql` (SQL Editor) — crée la table, le bucket
   privé et les policies Storage. Si l'éditeur refuse l'`insert` dans `storage.buckets`,
   créer le bucket privé `vault-documents` dans Storage › New bucket puis relancer le script.
2. Aucune Edge Function ni secret pour le coffre.

## 17. Mot de passe oublié

Trou découvert à l'usage : sans alternative, il a fallu supprimer puis recréer un compte
Supabase à la main.

### Côté app (`src/screens/AuthScreen.tsx`)

- Lien « Mot de passe oublié ? » sous le formulaire de connexion : bascule le même écran
  en mode « Mot de passe oublié » (pas de nouvelle route : `sign-in` est hors du layout
  protégé, un simple mode évite de toucher à la garde de session). L'email déjà tapé est
  conservé.
- Appel `supabase.auth.resetPasswordForEmail(email, { redirectTo })`, `redirectTo` =
  `Linking.createURL('reset-password')` (voir « Lien reçu par email » plus bas).
- Ouvrable directement en mode « Mot de passe oublié » via `/sign-in?mode=forgot` (retour
  depuis un lien expiré).
- **Pas d'énumération de comptes** : Supabase répond sans erreur pour un email inconnu (et
  n'envoie rien) ; l'app affiche toujours « Si un compte existe avec cet email, un lien de
  réinitialisation a été envoyé… ». Les erreurs serveur ne sont pas détaillées, sauf le
  429 (trop de demandes).
- Erreur réseau (`AuthRetryableFetchError`, ou exception relancée par le SDK) : message
  « Impossible de joindre le serveur… », sans plantage.

### Confirmation email

La configuration Auth du projet n'est pas versionnée (pas de `supabase/config.toml`, rien
dans les migrations). Indices : `SPIKE_RESULTS.md` laisse « Confirm email » au choix, et
l'inscription gère déjà le cas « pas de session → confirme ton email ». Le message de
réinitialisation est volontairement neutre et vaut dans les deux configurations.

### Lien reçu par email → écran « Nouveau mot de passe » (`/reset-password`)

Supabase n'héberge aucune page de saisie d'un nouveau mot de passe : le lien de l'email
(`https://<projet>.supabase.co/auth/v1/verify?…&type=recovery&redirect_to=…`) vérifie le
jeton puis redirige vers `redirect_to`, **à condition que cette URL figure dans les
*Redirect URLs* du projet** — sinon Supabase redirige silencieusement vers la *Site URL*
(par défaut `http://localhost:3000`, d'où le problème initial).

Ce qui a été vérifié (doc + code installé, `@supabase/auth-js` 2.117.2, Expo SDK 57) :

- **Flow implicite** : c'est le `flowType` par défaut de `createClient` (non surchargé dans
  `src/lib/supabase.ts`). Les jetons arrivent donc dans le **fragment** :
  `road://reset-password#access_token=…&refresh_token=…&expires_in=…&type=recovery`, et
  en cas de lien expiré / déjà utilisé :
  `road://reset-password#error=access_denied&error_code=otp_expired&error_description=…`.
  Pas de `?code=` (PKCE) → pas d'`exchangeCodeForSession`.
- **Pas d'event `PASSWORD_RECOVERY` ici** : supabase-js ne l'émet que lorsqu'il lit
  lui-même l'URL (`detectSessionInUrl`, web uniquement — désactivé chez nous) ou via
  `verifyOtp({ type: 'recovery' })`. Côté React Native, la doc Supabase (« Native Mobile
  Deep Linking ») relit les jetons de l'URL et appelle `supabase.auth.setSession(...)`,
  qui émet `SIGNED_IN`. On suit cette méthode ; écouter `PASSWORD_RECOVERY` aurait été du
  code mort.
- **Expo Router ignore le fragment** pour le routage (`extractPathFromURL` ne garde que
  hôte + chemin + query) : `road://reset-password#…` ouvre bien la route
  `src/app/reset-password.tsx`, mais les jetons ne sont **pas** dans
  `useLocalSearchParams`. L'écran relit l'URL brute avec `Linking.useLinkingURL()`
  (`useURL` est déprécié en SDK 57). Pas besoin de `+native-intent`.
- **Scheme custom suffisant** : la doc Supabase RN utilise un scheme custom avec wildcard
  (`com.supabase://**`) ; un lien universel (https) n'est pas requis. `road` est déjà le
  `scheme` de `app.json`.

Implémentation :

- `src/auth/recoveryLink.ts` : `resetPasswordRedirectUrl()` — `road://reset-password` en
  dur en development build / release (`Linking.createURL` y inclurait l'hôte du serveur
  Metro en dev, ce qui ne correspondrait plus à l'URL autorisée), `createURL` seulement
  dans Expo Go (`exp://…/--/reset-password`) — et `parseRecoveryLink(url)` (query +
  fragment → jetons / erreur / rien).
- `src/screens/ResetPasswordScreen.tsx` (route `reset-password`, déclarée **hors** des deux
  `Stack.Protected` du layout racine : elle crée elle-même la session) :
  1. jetons présents → `setSession` → formulaire « Nouveau mot de passe » + confirmation ;
  2. `supabase.auth.updateUser({ password })` → « Mot de passe modifié » → `router.replace('/')`
     (l'utilisateur est **directement connecté**, la garde laisse passer vers `(app)`) ;
  3. erreurs : lien expiré (`otp_expired`) / invalide / `setSession` refusé / session
     perdue (401) → message + bouton « Demander un nouveau lien »
     (`/sign-in?mode=forgot`), ou « Retour à l'app » si une session existe déjà (la route
     `sign-in` est alors gardée) ; mots de passe différents ou < 6 caractères (minimum par
     défaut Supabase, le serveur reste juge) ; `same_password`, `weak_password`, réseau.
- Effet de bord assumé : ouvrir le lien connecte l'utilisateur (session de récupération),
  même s'il quitte l'écran sans changer son mot de passe. Si un *autre* compte était
  connecté sur l'appareil, il est remplacé (le `SyncProvider`, indexé par `userId`, se
  remonte).
- Le coffre chiffré (§16) dépend de sa propre phrase secrète, pas du mot de passe du
  compte : non impacté.

### ⚠️ Étape manuelle — dashboard Supabase (Landry)

Sans elle, le lien continue de rediriger vers `http://localhost:3000`.

1. Supabase Dashboard → projet Road → **Authentication** → **URL Configuration**.
2. Section **Redirect URLs** → **Add URL** → saisir exactement :

   ```
   road://reset-password
   ```

   → **Save URLs**.
3. Ne **pas** toucher à la *Site URL* (elle sert de repli et aux autres emails).
4. (Optionnel, tests dans Expo Go uniquement) : Expo Go n'ouvre pas `road://` ;
   `createURL` y produit `exp://<IP>:8081/--/reset-password`. Pour tester dans Expo Go,
   ajouter aussi `exp://**` (à retirer ensuite : wildcard large). Le parcours complet
   se teste plutôt dans un development build (`eas build --profile development`) ou la
   build de preview, où le scheme `road://` est enregistré.

Test : « Mot de passe oublié ? » → ouvrir l'email **sur le téléphone où Road est
installée** → le lien ouvre l'app sur « Nouveau mot de passe ». Un lien ouvert sur un
ordinateur ne peut pas ouvrir l'app (le navigateur affichera une erreur de scheme).

Contournement de secours inchangé : `supabase.auth.admin.updateUserById(id, { password })`
côté serveur (clé `service_role`, jamais dans l'app).

## 18. Notifications locales quotidiennes

Notifications **100 % locales** (`expo-notifications` ~57.0.21, programmées sur
l'appareil) : aucune push, aucun serveur, aucun jeton. Code dans `src/notifications/`.

### Ce que l'API permet vraiment (doc SDK 57 + types/natif du paquet installé)

- **Déclencheurs** (`SchedulableTriggerInputTypes`) : `DAILY` `{ hour, minute }` est le
  déclencheur quotidien multiplateforme ; `CALENDAR` est **iOS uniquement** (`@platform ios`),
  pas une option pour une app Android + iOS. `DATE` `{ date }` = une seule fois, partout.
- **Contenu figé à la programmation.** `scheduleNotificationAsync` prend un `content`
  (titre, texte) fixé au moment de l'appel ; rien ne permet d'exécuter du JS à l'heure du
  déclenchement d'une notification *locale* pour en calculer le texte (`registerTaskAsync`
  s'exécute à la *réception*, quand le contenu est déjà affiché, et app fermée seulement
  pour une push « headless » — pas pour une locale). Un trigger `DAILY` répéterait donc chaque jour **le même texte**, faux dès le
  lendemain. `expo-background-task` ne donne pas d'heure garantie (fenêtre choisie par
  l'OS, minimum 15 min, souvent bien plus) : inutilisable pour « à 8 h ».
- **Android** : `POST_NOTIFICATIONS` (Android 13+) et `RECEIVE_BOOT_COMPLETED` sont déjà
  déclarées dans le manifeste de la lib (fusion automatique) ; le prompt système
  d'Android 13 n'apparaît qu'**après création d'un canal**, d'où
  `setNotificationChannelAsync('reminders')` avant `requestPermissionsAsync`. Les
  notifications programmées survivent au redémarrage (récepteur `BOOT_COMPLETED` de la lib).
- **Heure exacte** : sans `SCHEDULE_EXACT_ALARM`, la lib (`ExpoSchedulingDelegate`) se
  rabat sur `setAndAllowWhileIdle` (alarme inexacte, quelques minutes de décalage possibles
  en Doze). **Volontairement non ajoutée** : Google Play la réserve aux apps
  réveil/agenda, et elle est refusée par défaut depuis Android 14. Un rappel à 8 h 05 est
  acceptable.
- **iOS** : 64 notifications locales programmées au maximum par app (limite système, au-delà
  iOS ne garde que les plus proches). On en programme au plus 7 + 40.
- **Plugin de config** : pas indispensable pour du local, mais ajouté dans `app.json` pour
  l'icône de notification Android (`android-icon-monochrome.png`, silhouette sur fond
  transparent ; sans elle Android affiche un carré blanc) et la couleur d'accent.

### Rappel du matin : solution retenue

Au lieu d'un `DAILY` au texte figé, on programme **7 notifications `DATE`**, une par matin
à venir (aujourd'hui inclus si l'heure n'est pas passée), chacune avec les chiffres
**projetés pour ce jour-là** à partir des tâches non faites de SQLite :
« 3 tâches pour aujourd'hui · 2 en retard » (dues ce jour / échéance antérieure ; une
tâche due aujourd'hui et non faite compte « en retard » dans le rappel de demain). Titre :
la date du jour (« Vendredi 2 octobre »).

Tout est **annulé puis reprogrammé** (`rescheduleNotifications`) : au lancement, au retour
au premier plan, à chaque changement des données locales (`dataVersion` du
`SyncProvider`, donc saisie *et* sync), au changement de jour et de réglage. Debounce de
1,5 s, et une file qui sérialise les reprogrammations (pas d'entrelacement
annulation/programmation, donc pas de doublons).

Limites assumées :
- Le texte reflète les données **de l'appareil à la dernière reprogrammation** : une tâche
  cochée sur un autre appareil n'est prise en compte qu'après une sync sur ce téléphone.
- Si l'app n'est **pas ouverte pendant 7 jours**, les rappels s'arrêtent après le 7ᵉ
  matin, jusqu'à la prochaine ouverture (fenêtre courte = chiffres projetés moins
  périmés ; c'est la contrepartie d'un texte calculé).

### Alerte échéance clé à J-7

Même seuil que l'échéancier et la Vue du jour (`TODAY_ALERT_DAYS` de
`lib/keyDateAlerts.ts`, libellé `countdownLabel` → « J-7 »). Pour chaque date clé non
supprimée dont le J-7 est encore à venir : une notification `DATE` le jour J-7, **à l'heure
du rappel du matin**. Texte : titre · catégorie · date · contact. Reprogrammée avec le
reste (une date modifiée ou supprimée est donc prise en compte). Les 40 plus proches
seulement (limite iOS).

Une date clé créée alors qu'elle est déjà à moins de 7 jours n'a pas de J-7 à venir : pas
de notification (elle figure déjà dans l'encart « Échéances proches » de la Vue du jour).

### Réglages

- Section « Notifications » de l'écran Réglages : toggle « Notifications quotidiennes »
  (rappel du matin + alertes J-7, un seul interrupteur) et « Heure du rappel » (feuille,
  5:00–22:00 par demi-heure, 8:00 par défaut). Désactivé par défaut.
- Stockés sur l'appareil (`expo-sqlite/kv-store`, clé `notifications:settings`), sans sync :
  autoriser les notifications est un choix propre à chaque téléphone.
- Activer demande la permission système. Refus → le toggle reste éteint, message « Notifications
  refusées… » et bouton « Ouvrir les réglages du téléphone » (`Linking.openSettings`), aucun
  plantage. Sur iOS (et Android au 2ᵉ refus) le système ne redemande plus : seul ce lien
  permet de revenir en arrière. Si la permission est retirée plus tard, le toggle reste
  allumé avec un avertissement ; rien n'est programmé tant qu'elle manque, et tout est
  reprogrammé au retour dans l'app une fois réaccordée.
- Déconnexion : toutes les notifications sont annulées (elles parlent des données du compte).
- Toucher une notification ouvre simplement l'app (pas de lien profond vers l'écran
  concerné, non demandé).

### Test

Module natif : **nouvelle build EAS nécessaire** (`bunx`/`npx eas-cli@latest build`), la
build actuelle ne contient pas `expo-notifications` (l'import planterait au lancement
avec « Cannot find native module 'ExpoNotifications' »). Après installation : Réglages →
activer → accepter le prompt → choisir une heure 2–3 min plus tard → fermer l'app.

## 19. Lot 5 — verrouillage biométrique

- **Module** : `expo-local-authentication` (~57.0.3, ajouté par `npx expo install`), plugin
  de config dans `app.json` avec `faceIDPermission` (sans `NSFaceIDUsageDescription`, iOS
  retombe sur le code du téléphone). Le lockfile ne gagne qu'une entrée ; `npm ci --dry-run`
  passe (lockfile synchronisé avec `package.json`, `.npmrc` inchangé).
- **Réglage** propre à l'appareil, sans sync : `expo-sqlite/kv-store`, clé
  `app-lock:settings`, même petit store observable que les notifications
  (`src/security/appLock.ts`). Désactivé par défaut. Section « Sécurité » des Réglages,
  toggle « Verrouiller l'app ».
- **Disponibilité** = capteur présent (`hasHardwareAsync`) **et** biométrie enregistrée
  (`isEnrolledAsync`), comme demandé. Sinon : message clair sous le toggle, toggle éteint
  et désactivé, aucune gêne pour l'usage. Si la biométrie disparaît après activation
  (empreintes supprimées), le verrou se coupe tout seul à l'ouverture suivante et Réglages
  l'indique (« Verrouillage désactivé automatiquement… ») — retirer ses empreintes exige
  déjà le code du téléphone, on ne bloque donc pas l'utilisateur hors de ses données.
- **Authentification** : `authenticateAsync` avec repli sur le code du téléphone
  (`disableDeviceFallback: false`) — Face ID / empreinte / code. Activer **et** désactiver
  le toggle passent par une authentification (vérifie que le capteur répond, déclenche la
  demande d'accès Face ID d'iOS au bon moment, empêche de couper le verrou sans être le
  propriétaire).
- **Quand verrouiller** (`src/security/AppLockGate.tsx`, autour de l'espace connecté dans
  `(app)/_layout.tsx`) :
  - à chaque lancement à froid ;
  - au retour au premier plan après **plus de 60 s en arrière-plan**
    (`LOCK_AFTER_BACKGROUND_MS`). On ne compte que l'état `background` : `inactive` (iOS)
    survient aussi pendant le prompt Face ID lui-même, le centre de notifications, etc.
    Le délai évite de redemander pour un aller-retour rapide (copier un IBAN, sélecteur de
    document du coffre, partage) ; les changements d'écran internes ne verrouillent jamais.
  - Les transitions d'AppState pendant une authentification sont ignorées (sur Android, la
    saisie du code ouvre une activité système qui peut faire passer l'app en arrière-plan).
- **Écran verrouillé** : première demande automatique, puis « Réessayer » en cas d'échec ou
  d'annulation, avec le motif (annulé, trop de tentatives…). Au lancement, les écrans
  (SyncProvider, lectures SQLite, notifications) ne sont **pas montés** avant le premier
  déverrouillage ; ensuite l'écran de verrouillage recouvre la navigation (état conservé)
  et la masque aux lecteurs d'écran.
- **Cache de confidentialité** : quand le verrou est actif et que l'app quitte le premier
  plan, un écran neutre recouvre le contenu (aperçu du sélecteur d'apps iOS). Limite :
  sur Android, la capture du sélecteur d'apps peut être prise avant l'événement JS ; il
  faudrait `FLAG_SECURE` (module natif / plugin) — non fait, ça bloquerait aussi les
  captures d'écran.
- Juste après une connexion par mot de passe, le verrou (s'il était resté actif sur le
  téléphone) est demandé une fois : accepté, cas rare.
- **Module natif → nouvelle build EAS nécessaire.** Face ID n'est pas testable dans Expo Go.

## 20. Lot 5 — rappels ponctuels

- **Données** : table `reminders` (migration Supabase **011**, migration locale v11) —
  `title`, `remind_at` (timestamptz : un rappel a une heure, contrairement à une échéance
  qui est un jour), `task_id` / `contact_id` facultatifs (sans FK, cf. §5), `done`, colonnes
  communes + `server_updated_at`. Même trigger LWW et mêmes policies RLS que les autres
  tables. Intégrée au moteur généralisé par un simple `EntitySpec` (`src/db/remindersDb.ts`)
  ajouté en fin de `TABLES` (après tâches et contacts auxquels elle peut se rattacher).
  `remind_at` est toujours écrit en `toISOString()` (et normalisé au pull) : les bornes de
  jour se comparent donc en texte en SQLite.
- **Suppression d'un contact** : ses rappels sont conservés et détachés, comme les dates
  clés. **Tâche supprimée** : le lien est simplement ignoré à l'affichage (jointure sur les
  tâches non supprimées) — le code des tâches n'est pas touché.
- **Formulaire** (`/reminder-form`, route de la Stack `(app)` au-dessus des onglets, donc
  accessible de partout) : titre + date (DatePickerSheet existant) + heure (nouveau
  `TimePickerSheet`, heures + quarts d'heure, JS pur) + tâche / contact liés. Paramètres
  `taskId`, `contactId`, `date` pour préremplir, `id` pour modifier. Défaut : heure pleine
  suivante aujourd'hui, 9:00 un autre jour. Boutons « Marquer comme fait / à faire » et
  « Supprimer » en modification. Heure passée : avertissement (pas de notification).
- **Points d'entrée** : « + Rappel » de la section Rappels de la Vue du jour ; section
  « Rappels » de la fiche contact (rappels à faire du contact + « + Rappel » lié) ;
  « Créer un rappel » dans le menu d'une tâche (appui sur la tâche, onglets Tâches et Vue
  du jour). Pas de fiche tâche dédiée dans l'app : le menu en tient lieu.
- **Vue du jour** : rappels non faits d'aujourd'hui **et des jours précédents** (un rappel
  manqué hier ne doit pas disparaître en silence ; affiché en rouge avec son jour), cochables.
  Un rappel coché disparaît de la liste.
- **Notifications** : une notification locale `DATE` à l'heure du rappel
  (`planReminders`, identifiant `reminder:<id>`), programmée par le même
  `rescheduleNotifications` (annulation globale + reprogrammation à chaque changement de
  données, au premier plan, etc. — cf. §18). Texte figé à la planification, acceptable ici :
  titre du rappel + élément lié, fixes par nature (et reprogrammés si on modifie le rappel).
  - **Écart avec §18** : les rappels sont programmés **même si « Notifications
    quotidiennes » est éteint** — ce toggle couvre le rappel du matin et les J-7 ; un rappel
    ponctuel est une demande explicite. Il faut seulement l'autorisation système : elle est
    demandée à l'enregistrement du premier rappel si elle ne l'a jamais été ; si elle est
    refusée, une alerte explique que le rappel restera visible dans la Vue du jour sans
    notification. Mention ajoutée sous le réglage.
  - Limite iOS de 64 notifications programmées : 15 rappels au plus (les plus proches), en
    plus des 7 matins et 40 J-7 (= 62). Les suivants sont programmés aux ouvertures suivantes.
  - Rappel coché fait ou supprimé → sa notification est annulée à la reprogrammation
    suivante (immédiate, déclenchée par l'écriture locale). Un rappel coché sur un autre
    appareil n'est annulé ici qu'après une sync.
- `.expo/types/router.d.ts` (local, ignoré par git) mis à jour à la main pour
  `/reminder-form` et `/agency/calendar` ; `npx expo start` le régénère.

## 21. Lot 5 — calendrier

- **Emplacement : `/agency/calendar`, dans la Stack de l'onglet Agence** — pas de 6ᵉ onglet
  (§5). Deux accès : une ligne « Calendrier » dans le menu Agence, juste sous
  l'Échéancier (même famille d'outil), et une **icône calendrier dans l'en-tête de la Vue
  du jour**, à côté de la loupe (accès en un geste depuis l'écran le plus consulté). Depuis
  la Vue du jour, ouverture avec `withAnchor` comme le lien « Échéancier » existant :
  « Retour » ramène au menu Agence. Être dans la Stack Agence permet d'ouvrir les fiches
  de dates clés (`/agency/key-date-form`) par une simple navigation dans la même pile ;
  une route de la Stack `(app)` aurait dû sauter d'une pile à l'autre.
- **Pas de dépendance** : grille en JS pur, reprise de celle de `DatePickerSheet` (déjà
  éprouvée, lundi en premier). Une lib de calendrier (type `react-native-calendars`)
  apporterait son propre thème et ses dépendances pour un besoin couvert en ~100 lignes, et
  un risque de plus sur le lockfile (cf. historique EAS) : non ajoutée.
- **Vues** : Mois (grille) et Semaine (une ligne, semaine du lundi), bascule par pastilles,
  flèches précédent / suivant (mois ou semaine), pastille « Aujourd'hui » pour revenir.
  Changer de mois garde le même jour du mois (borné au dernier jour) comme sélection.
- **Indicateurs** (points sous le jour + légende) : bleu = tâche **non faite** à échéance ce
  jour ; orange = date clé ; vert = rappel **non fait**. Les éléments faits n'allument pas
  de point mais restent listés (barrés) dans le détail du jour.
- **Détail du jour sélectionné** : groupes Tâches / Échéances clés / Rappels, avec
  « + Rappel » préréglé sur ce jour. Navigation : tâche → cocher, reporter ou menu de la
  tâche (échéance, priorité, rappel, suppression — l'app n'a pas de fiche tâche) ; date
  clé → sa fiche ; rappel → son formulaire, cochable sur place.
- **Données** : tâches via `useOfflineTasks` (déjà en mémoire, filtrées sur la période) ;
  dates clés et rappels via `useLocalQuery` sur la seule période visible
  (`listKeyDatesBetween`, `listRemindersBetween`), relus à chaque changement de données.

## 22. Lot 6 — agenda (rendez-vous) et rappel de debrief

- **Données** : table `appointments` (migration Supabase **012**, migration locale v12) —
  `title`, `start_at` (timestamptz, obligatoire), `end_at` (facultatif), `location` (texte
  libre), `contact_id` / `project_id` facultatifs (sans FK, cf. §5), `notes`,
  `debrief_reminder_enabled` (vrai par défaut), colonnes communes + `server_updated_at`.
  Même trigger LWW et mêmes policies RLS que `reminders` (§20). `EntitySpec` `APPOINTMENTS`
  (`src/db/appointmentsDb.ts`) ajouté en fin de `TABLES` du moteur de sync. Instants
  toujours écrits en `toISOString()` : bornes de jour comparées en texte, comme les rappels.
- **Distinct de l'existant** : un RDV a un horaire (début, fin) et un lieu, et ne se coche
  pas — il est passé (affiché grisé). Ni tâche (un jour, à cocher), ni date clé
  (contractuelle), ni rappel (un instant, à cocher) : table et écrans à part plutôt qu'un
  « type » ajouté aux rappels.
- **Suppression d'un contact ou d'un projet** : ses RDV sont conservés et détachés, comme les
  rappels et documents.
- **Formulaire** (`/appointment-form`, Stack `(app)` comme `/reminder-form`, donc accessible de
  partout) : titre, date (`DatePickerSheet`), début et fin (`TimePickerSheet`), lieu, contact
  et projet liés (feuilles `Sheet`/`SheetOption`, même modèle que le formulaire de rappel —
  il n'existe pas de composant « picker de contact » séparé), notes, interrupteur « Rappel de
  debrief automatique ». Paramètres `date`, `contactId` pour préremplir, `id` pour modifier.
  En modification : « Faire le compte-rendu » et « Supprimer ».
  - **Écart** : la fin est le **même jour** que le début (on choisit une heure, pas une
    date) et doit être postérieure au début, sinon l'enregistrement est bloqué. Un RDV qui
    passe minuit est rare pour l'usage visé ; à revoir si besoin.
  - Décaler le début décale la fin d'autant (durée conservée) tant qu'elle reste dans la journée.
  - Le projet lié n'était pas demandé dans le formulaire ; ajouté puisque la colonne existe
    (une ligne, même feuille que le contact).
- **Calendrier** : jeton de couleur dédié `appointment` (violet, clair / sombre) ajouté à la
  palette — les quatre couleurs existantes étant déjà prises (bleu tâches, orange dates clés,
  vert rappels, rouge erreurs). Point violet sous le jour, légende « Rendez-vous », groupe
  « Rendez-vous » **en tête** du détail du jour (ce qui a une heure fixe d'abord), « + RDV »
  à côté de « + Rappel ». Appui sur un RDV : sa fiche.
- **Vue du jour — choix** : **section dédiée « Agenda du jour »**, placée juste sous les
  Priorités du jour et avant les Tâches. Pas de fusion avec les Rappels : leurs lignes ont
  une case à cocher et la section liste aussi les rappels manqués des jours précédents ;
  un RDV n'a ni l'un ni l'autre. En haut parce que c'est ce qui contraint la journée (heure
  fixe, déplacement). Même présentation que la section Rappels (compteur, « + RDV », texte
  vide). Les RDV passés restent listés, grisés, avec une icône « compte-rendu » qui ouvre
  l'écran Compte-rendu de RDV (contact prérempli) — même raccourci dans le calendrier.
- **Rappel de debrief** (`planDebriefs`, identifiant `debrief:<id>`) : notification `DATE`
  **1 h après `end_at`**, ou **2 h après `start_at`** sans heure de fin, si l'interrupteur est
  actif et que l'instant est à venir. Titre « Debrief : <titre du RDV> », texte « RDV avec
  <contact> terminé. Touche pour faire le compte-rendu. ». Le formulaire affiche l'heure
  prévue de la notification (ou indique qu'elle est déjà passée).
  - **Reprogrammation** : rien de spécifique — même `rescheduleNotifications` que §18/§20
    (annulation globale puis reprogrammation, sérialisée, à chaque changement des données
    locales). Un RDV modifié (heure, interrupteur) ou supprimé voit donc sa notification
    recalculée ou annulée immédiatement, sans doublon.
  - **Quota** : rappels et debriefs **partagent** les 15 notifications ponctuelles (les plus
    proches gardées, `mergeOneOff`), pour rester à 7 + 40 + 15 = 62 sous la limite iOS de 64.
    La suite est programmée aux ouvertures suivantes.
  - Comme les rappels, programmé **même si « Notifications quotidiennes » est éteint**
    (demande explicite, mention ajoutée sous le réglage). L'autorisation système est demandée
    à l'enregistrement d'un RDV dont le debrief est à venir, si elle ne l'a jamais été ; si
    elle est refusée, une alerte l'explique.
- **Toucher la notification → Compte-rendu de RDV** (vérifié sur la doc SDK 57 et le paquet
  installé 57.0.21) : `getLastNotificationResponse()` (app lancée par le toucher) +
  `addNotificationResponseReceivedListener` (app déjà ouverte), versions **synchrones** —
  les variantes `…Async` sont dépréciées en SDK 57 ; implémentées nativement sur Android et
  iOS. `NotificationResponseHandler` (monté dans `(app)/_layout.tsx` après la Stack, donc
  derrière le verrou biométrique et seulement une fois connecté) lit `content.data`
  (`{ kind: 'debrief', appointmentId, contactId }`, pas d'URL libre) et ouvre
  `/agency/meeting-report?contactId=…` avec `withAnchor` (« Retour » ramène au menu Agence).
  Seul le toucher principal (`DEFAULT_ACTION_IDENTIFIER`) est traité ; la réponse est
  effacée (`clearLastNotificationResponse`) pour ne pas rouvrir l'écran à un remontage.
  - Limites : seul le contact est prérempli (l'écran de compte-rendu n'a pas d'autre champ à
    préremplir ; le titre de la note y reste « date + contact »). Toucher une notification
    reçue avant la connexion l'applique une fois connecté. Les autres notifications (matin,
    J-7, rappels) ouvrent toujours simplement l'app (§18).
- **Aucune dépendance ajoutée**, `app.json` inchangé ; `npm ci --dry-run` passe.
- `.expo/types/router.d.ts` (local, ignoré par git) mis à jour à la main pour
  `/appointment-form` ; `npx expo start` le régénère.

## 23. Bouton « Itinéraire » sur la fiche d'un RDV

- Lien « Itinéraire » (icône `navigate-outline`) sous le champ Lieu du formulaire de RDV,
  affiché dès que le lieu n'est pas vide (`src/lib/directions.ts`). Pas de clé API : l'adresse
  est passée en texte.
- **Citymapper d'abord** : `citymapper://directions?endname=<adresse>&endaddress=<adresse>`.
  **Limite** : la doc publique de Citymapper (blog « Launching Citymapper Directions from
  Apps and the Web ») ne garantit l'itinéraire qu'avec `endcoord` (lat,lon) ; on n'a que du
  texte (géocoder exigerait une API). Avec la seule adresse, Citymapper peut s'ouvrir sans
  destination calculée — à vérifier sur appareil ; si c'est le cas, passer directement par
  Google Maps.
- **Repli Google Maps** : `https://www.google.com/maps/search/?api=1&query=<adresse>` (app si
  installée, navigateur sinon). Si même ce lien échoue, alerte « Itinéraire indisponible ».
- **Écart — pas de `canOpenURL`** : la doc expo-linking SDK 57 indique que sur iOS il faut
  déclarer le scheme dans `LSApplicationQueriesSchemes` (et Android 11+ exige `<queries>`),
  donc un nouveau build. À la place on tente `openURL` sur Citymapper, qui **rejette** si aucune
  app ne gère le scheme, et on retombe sur Google Maps. Même résultat, sans config native.
  Sur le web, directement Google Maps.
- Aucune dépendance ajoutée (`expo-linking` déjà présent), `app.json` inchangé : pas de
  nouveau build, une mise à jour OTA suffit.

## 24. Suggestions d'adresses pour le Lieu d'un RDV (Nominatim)

- API : **Nominatim d'OpenStreetMap** (`/search?q=…&format=json&limit=5&accept-language=fr`),
  gratuite, sans clé (`src/lib/addressSearch.ts`). Un tap sur une suggestion remplit le Lieu
  avec son `display_name` ; le champ reste un texte libre (aide, pas une contrainte).
- **Écart avec la demande initiale (suggestions à la frappe avec debounce)** : la politique
  d'usage (operations.osmfoundation.org/policies/nominatim, vérifiée le 2026-10-03) dit
  « Auto-complete search is not yet supported by Nominatim and you must not implement such a
  service on the client side using the API ». Un debounce ne change rien : c'est toujours de
  l'autocomplétion. La recherche est donc **déclenchée explicitement** : lien « Chercher
  l'adresse » sous le champ (dès 3 caractères) ou touche Entrée/Rechercher du clavier.
- Respect du reste de la politique :
  - ≥ 1,1 s entre deux requêtes (attente côté client), une seule en vol (la précédente est
    annulée par `AbortController`, ainsi qu'à chaque frappe et à la fermeture de l'écran) ;
  - User-Agent `Road/1.0 (app personnelle…)` sur iOS/Android (sur le web le navigateur
    impose le sien et envoie le Referer) ;
  - cache mémoire par requête normalisée (même texte → pas de nouvel appel) ;
  - attribution « © contributeurs OpenStreetMap » sous les résultats.
- Erreurs : échec réseau/HTTP silencieux (la liste ne s'ouvre pas, le texte tapé est conservé) ;
  aucun résultat → message « Aucune adresse trouvée ».
- Si une vraie autocomplétion à la frappe devient nécessaire : passer par un service qui
  l'autorise (ex. Photon de Komoot, aussi basé sur OSM, à vérifier) plutôt que Nominatim.
- `fetch` standard, aucune dépendance ni config native : pas de nouveau build, OTA suffit.

## 25. Mises à jour OTA (EAS Update)

- `expo-updates` ~57.0.24 ajouté (`npx expo install`), config vérifiée sur la doc SDK 57
  (docs.expo.dev/versions/v57.0.0/sdk/updates, eas-update/getting-started, le 2026-10-03).
- `app.json` :
  - `updates.url` = `https://u.expo.dev/<projectId>` (même id que `extra.eas.projectId`) ;
  - `runtimeVersion: { "policy": "fingerprint" }`. La doc ne désigne pas de politique par
    défaut ; `appVersion` impose de penser à monter `version` (restée à 1.0.0, versionCode géré
    par `autoIncrement`) à chaque changement natif, sinon une update JS peut atterrir sur un
    build incompatible et planter. `fingerprint` recalcule la version dès que le natif change
    (dépendance native, plugin, `app.json` natif…) : une update n'atteint que les builds
    compatibles, sans rien à retenir.
  - `checkAutomatically: "ON_LOAD"` et `fallbackToCacheTimeout: 0` (= valeurs par défaut,
    explicitées) : au lancement l'app démarre **tout de suite** sur le bundle déjà présent,
    la vérification/téléchargement se fait en arrière-plan et l'update est appliquée **au
    lancement suivant**. Le démarrage n'attend jamais le réseau.
- **Verrou biométrique (§19)** : aucun conflit. La vérification est native et non bloquante,
  le JS (donc l'écran de verrouillage) démarre comme avant ; aucun appel à
  `Updates.reloadAsync()`, l'app ne recharge jamais en cours de session, donc pas de
  contournement du verrou. Aucun code JS modifié.
- `eas.json` : profil `preview` avec `"channel": "preview"`. Le profil `production` n'a pas
  de channel pour l'instant (ses builds ne reçoivent pas d'OTA) ; ajouter
  `"channel": "production"` le jour où on en a besoin, puis rebuild.

### Pousser une mise à jour OTA

1. Une seule fois : un **build EAS classique** du profil preview, car `expo-updates` est un
   module natif — les APK existants ne savent pas recevoir d'update :
   `npx eas-cli@latest build --platform android --profile preview`, puis installer cet APK.
2. Ensuite, pour chaque changement JS :

   ```bash
   npx eas-cli@latest update --branch preview --message "Description du changement"
   ```

   Le build porte le channel `preview`, relié par défaut à la branche du même nom
   (`--channel preview` est équivalent). L'update est récupérée au lancement suivant de l'app
   et appliquée au lancement d'après (fermer complètement l'app deux fois pour la voir).
   - Les `EXPO_PUBLIC_*` sont inlinés au moment de l'export local : `eas update` lit
     `.env.local` sur la machine qui publie. Si ces variables vivent dans les variables
     d'environnement EAS, ajouter `--environment preview`.
   - Si une update « n'arrive pas » : comparer le runtime version (fingerprint) de l'update et
     du build sur expo.dev ; une différence = changement natif → nouveau build.

### Limite importante : OTA = JS uniquement

Une update OTA ne contient que le bundle JS et les assets. **Tout changement natif exige un
vrai build EAS** (`eas build`), puis réinstallation : nouvelle dépendance avec du code natif
(`npx expo install` d'un module natif), plugin ou permission dans `app.json` (icône, scheme,
`android.package`…), montée de SDK Expo / React Native. Avec la politique `fingerprint`, une
update publiée après un tel changement a un autre runtime version : elle n'est pas proposée
aux anciens builds (pas de crash), mais n'atteint personne tant que le nouveau build n'est pas
installé.

## 26. Refonte design — étape 1 : jetons (v2 « cartes pastel »)

Retour de Landry : design « pas assez Road, pas assez moderne, ergonomie à revoir ». Refonte
en deux temps : d'abord les jetons (`src/theme/tokens.ts`, lus par `ThemeProvider`), puis
trois écrans témoins (Vue du jour, Réglages, Calendrier) avant de généraliser.

### Historique : premier essai « Road » (non retenu)

Un premier essai (commits `ec99391` et `d068a2d`) partait du logo noir et blanc : **encre et
papier** pour presque tout (`primary` = texte `#1B1917`, fond papier `#F5F3EF`, neutres
chauds), un seul accent soleil `#C4541D` réservé à quelques éléments, cartes blanches à
filet, rayon 16. Landry a comparé deux maquettes de direction et **a écarté ce style
minimaliste noir/blanc, jugé trop sobre**, au profit d'un style chaleureux à la
FamilyWall / Cozi : cartes colorées pastel par catégorie, icônes, coins très arrondis.
Cette v2 **remplace la palette du premier essai** (aucune valeur conservée, sauf l'accent
soleil et la mécanique du mode sombre ci-dessous).

### Direction v2

- **Fond doux bleuté très pâle** (`#F3F6FB`), jamais blanc pur ; le blanc est réservé aux
  listes et champs, qui ressortent ainsi sur le fond comme sur les cartes.
- **Une couleur pastel par catégorie fonctionnelle** : chaque bloc est une carte teintée
  avec une pastille d'icône en en-tête. Six teintes de même clarté et de même saturation
  modérée (aucune ne domine, elles ne jurent pas côte à côte).
- **Le soleil couchant reste le fil rouge** : `primary` passe de l'encre au terracotta
  `#C4541D` (onglet actif, sélection, liens d'action), et le **bouton d'action principal
  est un dégradé** orange → terracotta (`#E8763D` → `#B9421D`, 135°), texte blanc, ombre
  orangée.
- Coins de carte **20 px**, **ombres douces** au lieu des filets.

### Palette de base

| Jeton          | Clair     | Sombre    | Usage |
|----------------|-----------|-----------|-------|
| `background`   | `#F3F6FB` | `#11151D` | fond des écrans (bleuté pâle / nuit bleutée) |
| `surface`      | `#FFFFFF` | `#1A1F2A` | listes dans les cartes, champs, barre d'onglets |
| `surfaceMuted` | `#E9EEF6` | `#242A37` | pressé, contrôles segmentés, pastilles |
| `border`       | `#DDE4EE` | `#2E3544` | filets entre lignes |
| `text`         | `#1F2433` | `#EEF1F6` | texte principal (ardoise, pas noir pur) |
| `textMuted`    | `#5A6275` | `#A7AFBF` | sous-titres |
| `textFaint`    | `#868EA0` | `#737C8E` | placeholders, jours passés |
| `primary`      | `#C4541D` | `#F08A4F` | soleil : actions, onglet actif, sélection |
| `onPrimary`    | `#FFFFFF` | `#24110A` | texte sur `primary` |
| `accent`       | `#C4541D` | `#F08A4F` | soleil : aujourd'hui, surtitres, interrupteurs |
| `onAccent`     | `#FFFFFF` | `#24110A` | texte sur accent |
| `accentSoft`   | `#FDE8DA` | `#3A2418` | fond teinté derrière l'accent |
| `gradientStart`| `#E8763D` | `#E07440` | début du dégradé (bouton principal) |
| `gradientEnd`  | `#B9421D` | `#B4461F` | fin du dégradé |
| `onGradient`   | `#FFFFFF` | `#FFFFFF` | texte sur le dégradé |
| `danger`       | `#C7372F` | `#F2766C` | erreurs, suppression |
| `warning`      | `#8A5E07` | `#E9C973` | = encre de la teinte `butter` (échéances) |
| `success`      | `#2B7A4D` | `#8FD6AE` | = encre de la teinte `mint` (rappels) |
| `appointment`  | `#2F5E9E` | `#9CC0F0` | = encre de la teinte `sky` (rendez-vous) |

### Teintes pastel et catégories

Chaque teinte (`colors.tints.<nom>`) a quatre valeurs : `bg` (fond de carte), `border`
(filet de carte), `iconBg` (pastille d'icône), `fg` (icône, titre, points du calendrier ;
AA ≥ 4,5:1 sur `bg` et sur blanc). `theme.categories.<catégorie>` donne directement la teinte
d'une catégorie (`CATEGORY_TINT`).

| Catégorie (`categories.*`) | Teinte | Clair `bg` / `border` / `iconBg` / `fg` | Sombre `bg` / `border` / `iconBg` / `fg` |
|---|---|---|---|
| Tâches (`tasks`)               | `peach` pêche     | `#FFEBDD` / `#FADBC6` / `#FFD6BC` / `#A84A1A` | `#33261F` / `#4A3529` / `#4D3528` / `#F4B48E` |
| Agenda, RDV (`agenda`)         | `sky` bleu ciel   | `#E3EEFD` / `#D0E0F7` / `#C9DDFA` / `#2F5E9E` | `#1D2838` / `#2B3A50` / `#2A3A52` / `#9CC0F0` |
| Rappels (`reminders`)          | `mint` menthe     | `#DEF4E7` / `#C9EBD7` / `#BFE8D0` / `#2B7A4D` | `#1B2E25` / `#2A4436` / `#284536` / `#8FD6AE` |
| Échéances clés (`keyDates`)    | `butter` beurre / ocre | `#FDF1D2` / `#F5E3B3` / `#F9E1A2` / `#8A5E07` | `#312B1B` / `#463D24` / `#4A4025` / `#E9C973` |
| Finances (`finance`)           | `lavender` lavande | `#EEE8FC` / `#E0D6F7` / `#DCD0F8` / `#6447B0` | `#27223A` / `#3A3254` / `#3A3157` / `#C2B0F2` |
| Priorités du jour (`priorities`) | `rose` rose     | `#FDE6EE` / `#F5D3DF` / `#F9CCDC` / `#A63B63` | `#33202B` / `#4A2C3D` / `#4D2D40` / `#F0A6C2` |

Les écrans sans catégorie métier (Réglages) piochent dans les mêmes teintes par leur nom.

**Mode sombre** : pas une inversion. Les fonds de carte sont des versions **profondes et
désaturées** de chaque teinte (luminance proche du fond `#11151D`, juste assez teintées pour
qu'on reconnaisse la catégorie), et l'encre `fg` devient la **version pastel claire** de la
teinte : la couleur passe du fond au texte. Le dégradé est à peine assombri et garde un
texte blanc (≈ 5,8:1 sur la fin du dégradé ; le terracotta foncé `onPrimary` y serait à 3:1).

Contrastes (WCAG, calculés à la main) : `primary` clair `#C4541D` ≈ 4,5:1 sur blanc ;
texte blanc au milieu du dégradé clair ≈ 4:1, en gras 16-17 px (lisible, à la limite du AA
« grand texte ») ; chaque `fg` ≥ 4,5:1 sur son `bg` ; `textMuted` ≈ 5:1 sur les fonds
pastel ; `textFaint` ≥ 3:1 sur blanc (placeholders, jamais d'information seule).

### Ombres et dégradé

Natifs de React Native 0.86 (nouvelle architecture), sans dépendance : `boxShadow` et
`experimental_backgroundImage` (`linear-gradient(...)`). `theme.shadows.card`
(`0 4 16 rgba(31,45,80,0.07)`, à peine visible, bleutée) sous les cartes ;
`theme.shadows.raised` (`0 6 16 rgba(196,84,29,0.28)`, orangée) sous le bouton dégradé. En
sombre, ombres noires (`0.25` / `0.35`) : les filets `border` de chaque teinte font le
détachement. `theme.sunsetGradient` est la chaîne prête à l'emploi ; `backgroundColor` =
`primary` reste posé dessous en repli.

### Typographie

Police système (pas de police embarquée : rien à charger, aucun module). Jeton
`typography`, des styles complets (taille / interlignage / graisse / approche) :

| Style        | Taille / interligne | Graisse | Approche | Usage |
|--------------|---------------------|---------|----------|-------|
| `display`    | 32 / 38 | 800 | −0,6 | gros titre d'écran (date du jour) |
| `title`      | 28 / 34 | 700 | −0,4 | titre d'écran |
| `heading`    | 20 / 26 | 700 | −0,2 | mois du calendrier |
| `cardTitle`  | 17 / 22 | 700 | −0,1 | titre de carte de catégorie (nouveau) |
| `subheading` | 17 / 22 | 600 | — | sous-titre |
| `body`       | 16 / 22 | 400 | — | texte courant |
| `bodyStrong` | 16 / 22 | 600 | — | libellés forts |
| `small`      | 14 / 20 | 400 | — | sous-titres de lignes |
| `caption`    | 12 / 16 | 500 | — | légendes |
| `overline`   | 11 / 14 | 700 | +1,4, capitales | surtitres (« AUJOURD'HUI ») |

`display` passe de 34/700 à 32/800 : plus dense, plus « appli grand public », et laisse de la
place aux cartes. `fontSize` garde ses clés (tous les écrans l'utilisent).

### Espacements et rayons

Grille de 4 pt inchangée (`xs` 4 → `xxl` 32, `xxxl` 48). Rayons : `sm` 6, `md` 10, `lg` 16
(listes blanches à l'intérieur des cartes), **`card` 20** (cartes de catégorie, nouveau),
`xl` 24, `pill`. Les valeurs existantes ne bougent pas : les écrans pas encore refaits
gardent leur mise en page.

### Mode sombre : rendu réellement fonctionnel

Avant cette étape, la palette sombre existait mais **n'était jamais utilisée** :
`ThemeProvider` appelait `makeTheme('light')` en dur, et `app.json` fixe
`userInterfaceStyle: "light"`, qui fige l'apparence native (iOS `UIUserInterfaceStyle`,
Android via `expo-system-ui`). Suivre le réglage système demanderait de passer
`userInterfaceStyle` à `"automatic"` : c'est un **changement natif** (nouveau fingerprint,
donc nouveau build EAS, cf. §25).

Solution 100 % JS : un **choix Clair / Sombre dans l'app**, propre à l'appareil, stocké dans
le kv-store SQLite comme les réglages de notifications (`src/theme/appearance.ts`, petit store
observable). `ThemeProvider` lit ce choix et part de `DarkTheme` d'Expo Router en sombre
(en-têtes, barre d'onglets). La barre d'état suit déjà `scheme` (`src/app/_layout.tsx`). Le
sélecteur est ajouté dans Réglages à l'étape 2. Option « Système » à ajouter le jour d'un
build natif (passer alors `userInterfaceStyle` à `"automatic"`).

### Ce qui reste hors OTA (non modifié)

La couleur des notifications Android (`#3b5bdb`, plugin `expo-notifications` dans
`app.json`) et le fond de l'icône adaptative sont de la config native : ils ne changent
qu'avec un build. Laissés tels quels pour que la refonte parte en OTA ; à aligner sur l'accent
soleil (`#C4541D`) et le fond `#F3F6FB` au prochain build.

### Portée

Les écrans lisent tous les jetons : **les nouvelles couleurs de base s'appliquent partout** dès
cette étape, sans toucher aux écrans (fond bleuté, `primary` terracotta pour les boutons, liens et
onglet actif). Les cartes pastel, le dégradé et les ombres demandent des composants : étape 2,
sur les trois écrans témoins seulement.

## 27. Refonte design — étape 2 : trois écrans témoins (v2 « cartes pastel »)

Vue du jour, Calendrier et Réglages, pour valider la direction avant de généraliser.

**Historique** : le premier essai (commit `d068a2d`, direction « Road » encre/papier, non
retenue, cf. §26) avait posé sur ces écrans des blocs titrés (`Block`) et des cartes blanches
à filet (`Panel` 16 px). Acquis conservés : grand titre de date et tirets de la ligne
centrale du logo, contrôle segmenté, pastilles d'action, Apparence Clair / Sombre dans les
Réglages, pastille d'état de sync. `Block` est supprimé (remplacé par `CategoryCard`).

### Composants (`src/components/ui.tsx`), à adopter écran par écran

Les composants historiques (`Section`, `Card`, `Chip`…) **ne changent pas** : les autres
écrans gardent leur mise en page.

- `CategoryCard` : la carte d'une catégorie. Fond pastel de sa teinte, filet de la teinte,
  coins de 20 px, ombre douce ; en-tête avec **pastille d'icône** (34 px, `iconBg` + icône
  Ionicons couleur `fg`), titre `cardTitle`, compteur dans une pastille de la teinte, action
  à droite. 16 px entre cartes.
- `CardList` : liste **blanche** (`surface`, coins 16 px) à l'intérieur d'une carte. Les
  lignes partagées (`TaskRow`, `ReminderRow`, `AppointmentRow`, `KeyDateRow`, `ListRow`) y
  restent telles quelles, lisibles, sans être retouchées pour chaque teinte.
- `CardNote` : texte d'état sur le fond pastel (`textMuted`, pas `textFaint` qui y passerait
  sous 3:1).
- `GradientButton` : **action principale** en pastille dégradé soleil couchant, texte blanc
  gras, ombre orangée, léger enfoncement à l'appui.
- `TextAction` : pastille d'action secondaire, désormais **de la teinte de la carte** qui la
  porte (`tint`) ; soleil par défaut (« Aujourd'hui » du calendrier).
- `Panel` : carte blanche (coins 20 px, ombre douce, filet en sombre seulement).
- `SegmentedControl` : rail en pilule, segment choisi blanc avec ombre ; prend la teinte de sa
  carte (`tint`).
- `ScreenHeader` : accepte une `action` alignée à droite des tirets.
- `Button` (partagé) : la variante `primary` passe au **dégradé** partout dans l'app (c'est
  l'action principale de chaque formulaire) ; `secondary` / `danger` ont un fond `surface`
  pour se détacher des cartes pastel et du fond bleuté.
- `QuickAddTask` (partagé) : bouton d'envoi en rond dégradé (flèche blanche), coins 16 px,
  `inputRef` pour qu'un bouton d'écran lui donne le focus.

### Écrans

- **Vue du jour** : « Nouvelle tâche » en **bouton dégradé** à droite des tirets du titre ; il
  fait défiler jusqu'à la carte Tâches et ouvre la saisie (ScrollView
  `automaticallyAdjustKeyboardInsets` pour que le clavier ne la masque pas sur iOS). Puis, dans
  le même ordre qu'avant : **Priorités** (rose, étoile ; n° 1 en pastille soleil, 2 et 3 dans
  la teinte), **Agenda du jour** (bleu, « + RDV » bleu), **Tâches du jour** (pêche), **Échéances
  proches** (beurre, sablier), **Rappels** (menthe, réveil, « + Rappel » vert). Revue de la
  semaine : carte blanche, icône dans une pastille soleil.
- **Calendrier** : grille dans une carte blanche ; **jour sélectionné en dégradé soleil**,
  aujourd'hui sur fond `accentSoft`. Les points des jours et la légende prennent l'encre `fg`
  de chaque catégorie (bleu RDV, pêche tâches, ocre échéances, vert rappels) ; le détail du
  jour devient une `CategoryCard` par catégorie, de la même couleur que son point, avec
  compteur des éléments non faits. « + RDV » bleu et « + Rappel » vert à côté de la date.
- **Réglages** : pas de catégorie métier, chaque carte prend une teinte pour le repérage :
  Apparence lavande, Synchronisation ciel, Notifications beurre, Sécurité menthe,
  Organisation pêche, Compte rose. Interrupteurs couleur soleil.

Généralisation aux autres écrans : remplacer `Section` + `Card` par `CategoryCard` + `CardList`
avec la teinte de la catégorie (Finances = lavande pour l'écran Argent / Qonto).

Tout est en JS / styles : aucune dépendance ajoutée, `app.json` inchangé, donc livrable par
`eas update` (§25).

## 28. Refonte design — étape 3 : généralisation, lot A (v2 « cartes pastel »)

Même direction que les écrans témoins (§26-27), appliquée à neuf écrans en réutilisant
`CategoryCard`, `CardList`, `CardNote`, `Panel`, `TextAction`, `GradientButton` et la
variante `primary` (dégradé) de `Button`. Uniquement du style et de la mise en page : aucune
logique, requête ni navigation modifiée.

### Catégories secondaires

Les six teintes sont prises par les catégories principales ; quatre catégories secondaires
en reprennent une (`CATEGORY_TINT`), choisie pour rester distincte de ses voisines à l'écran :

| Catégorie (`categories.*`) | Teinte | Voisines (écran) |
|---|---|---|
| Notes (`notes`)       | lavande | recherche ; « Bilan » de la revue |
| Contacts (`contacts`) | rose    | recherche |
| Projets (`projects`)  | ciel    | recherche, revue de la semaine |
| Objectifs (`goals`)   | menthe  | revue de la semaine |

Recherche : tâches pêche, notes lavande, contacts rose, projets ciel. Revue : tâches pêche,
projets ciel, objectifs menthe, échéances beurre, bilan lavande.

### Nouveaux composants

- `CardSectionHeader` / `CardSectionItem` / `CardSectionFooter` (`ui.tsx`) : une section de
  `SectionList` rendue comme une `CategoryCard` (haut, lignes dans la liste blanche, bas). Les
  longues listes (Tâches, Notes) **restent virtualisées**. Pas d'ombre (elle marquerait les
  raccords entre morceaux) : le filet de la teinte détache la carte. L'en-tête est partagé avec
  `CategoryCard` (`CardHeader`, interne).
- `AuthLayout` (`components/AuthLayout.tsx`) : écrans sans session, sans catégorie.

### Écrans

- **Connexion, nouveau mot de passe** : grand titre `ScreenHeader` (surtitre « Road », tirets
  soleil) sur le fond doux, formulaire dans une carte blanche centrale (`Panel`), bouton
  principal en dégradé ; défilement si le clavier couvre la carte.
- **Tâches** : saisie rapide en haut, puis un groupe = une carte pêche avec son icône (En retard
  — titre rouge —, Aujourd'hui, À venir, Sans date, Terminées).
- **Notes** : « + Note » en `GradientButton` à côté de la recherche ; « Épinglées » et
  « Notes » en cartes lavande (le titre « Notes » est désormais toujours affiché).
- **Détail d'une note** : feuille blanche (`Panel`) sur le fond doux, liseré lavande en haut.
- **Recherche** : un groupe de résultats = une carte de sa catégorie ; « + N autres » en
  `CardNote`.
- **Revue de la semaine** : sélecteur de semaine dans une carte blanche, puis Tâches terminées
  et En retard (pêche), Projets actifs (ciel), Objectifs (menthe), Échéances (beurre), Bilan
  (lavande).
- **Formulaire de rappel** (menthe) et **de rendez-vous** (ciel) : champs regroupés en cartes
  (identité et horaire, lieu, liens, notes et debrief) ; les sélecteurs (date, heure, contact…)
  deviennent des champs blancs avec icône à l'encre de la teinte ; « Chercher l'adresse » et
  « Itinéraire » en `TextAction` ciel ; boutons d'action groupés sous les cartes.

Toujours livrable par `eas update` : aucune dépendance, `app.json` inchangé.

## 29. Refonte design — étape 3 : généralisation, lot B (CRM et Agence)

Même direction et mêmes composants que le lot A (§28), sur dix écrans de l'onglet Agence.
Uniquement du style et de la mise en page : aucune logique, requête ni navigation modifiée.
Aucune nouvelle teinte : Contacts rose, Projets ciel, Objectifs menthe, Échéances clés beurre
(`CATEGORY_TINT.keyDates`, déjà prévu au §26).

### Listes longues (`FlatList`)

Même rendu que les `SectionList` du lot A, avec une seule carte : `ListHeaderComponent` =
`CardSectionHeader`, chaque ligne dans un `CardSectionItem`, `ListFooterComponent` =
`CardSectionFooter` (en-tête et pied seulement si la liste n'est pas vide). La liste reste
virtualisée. Liste vide : une `CategoryCard` avec un `CardNote`. Les filtres à deux valeurs
(Tous / À relancer, À venir / Passées) passent en `SegmentedControl` ; ceux des projets
(trois statuts + Tous) restent en pastilles.

### Écrans

- **Menu Agence** : une carte par section, de la teinte de sa catégorie, pastille d'icône,
  sous-titre en `CardNote`, alerte (« 2 à relancer ») et chevron à droite ; toute la carte est
  pressable. Contacts rose, Projets ciel, Objectifs menthe, Échéancier beurre (sablier, comme
  dans la Vue du jour), Calendrier ciel (`agenda`), Finances lavande. Sans catégorie métier :
  Compte-rendu de RDV **pêche** (il produit des tâches), Coffre **menthe** (comme la carte
  Sécurité des Réglages). Les teintes répétées (ciel, menthe) ne sont jamais voisines.
- **Contacts** : « + Contact » en `GradientButton` à côté de la recherche (`ListToolbar`, dont
  c'est le seul utilisateur), liste en carte rose « Contacts » ou « À relancer ».
- **Fiche contact** : Infos et Interactions en cartes roses (icônes à l'encre rose), Rappels
  en carte menthe avec « + Rappel » ; saisie d'interaction en bloc blanc, « Ajouter » en
  dégradé.
- **Formulaire de contact** : cartes roses « Contact », « Coordonnées », « Notes ».
- **Projets** : liste en carte ciel titrée selon le filtre.
- **Détail d'un projet** : carte ciel « Projet » (titre, description, statut en contrôle
  segmenté teinté), carte ciel « Étapes », carte **pêche** « Tâches liées » (ce sont des
  tâches) avec « Lier » dans la teinte.
- **Objectifs** : liste en carte menthe ; le projet lié prend l'encre ciel des Projets.
- **Formulaire d'objectif** : cartes menthe « Objectif », « Avancement » (boutons ±10 % dans
  la teinte), « Échéance et projet » (date cible en champ blanc).
- **Échéancier** : liste en carte beurre (sablier « À venir », archive « Passées »).
- **Formulaire de date clé** : cartes beurre « Date clé » et « Contact et notes », sélecteurs en
  champs blancs à icône ocre (même présentation que le formulaire de rappel).

Restent à migrer (hors lot B) : Finances (`MoneyScreen`, `MoneyFormScreen`, `QontoSection`,
lavande), Compte-rendu de RDV, Coffre et document du coffre. `Section`, `Card` et
`GroupedItem` y sont encore utilisés.

Toujours livrable par `eas update` : aucune dépendance, `app.json` inchangé.

## 30. Refonte design — étape 3 : lot C et bilan de la généralisation

Dernier lot : les six fichiers restants de l'onglet Agence, mêmes composants que les lots A et
B. Uniquement du style et de la mise en page : aucune logique, requête, navigation ni
traitement de fichier modifié. Aucune nouvelle teinte.

### Écrans du lot C

- **Finances** (`categories.finance`, lavande, prévu dès le §26) :
  - **Suivi financier** (`MoneyScreen`) : un statut = une carte lavande virtualisée
    (`CardSectionHeader` / `CardSectionItem` / `CardSectionFooter`, comme Tâches) : En retard
    (titre rouge, icône alerte), En attente (horloge), Payé (double coche) ; le total du groupe
    (par devise) à droite de l'en-tête, à l'encre lavande. `MoneyRow` inchangée. Liste vide : une
    carte « Finances » avec un `CardNote`.
  - **Section Qonto** (`QontoSection`, pied de liste de `MoneyScreen`) : une carte « Depuis
    Qonto » ; « Synchroniser » en `TextAction` lavande dans l'en-tête (remplacée par un
    indicateur pendant la synchro), retour d'import, puis chaque groupe (titre, total, liste
    blanche) dans la carte.
  - **Formulaire financier** (`MoneyFormScreen`) : cartes « Ligne financière » (libellé,
    montant, devise), « Type et statut » (type, statut, échéance) et « Contact et projet » ;
    sélecteurs en champs blancs à icône lavande avec « Retirer » dans le champ (comme les
    formulaires de date clé et de rappel) ; boutons groupés sous les cartes.
- **Compte-rendu de RDV** (`MeetingReportScreen`, pêche, comme sa carte du menu Agence §29) :
  carte « Notes du RDV » (contact en champ blanc, notes, mention IA en `CardNote`, « Effacer »
  en `TextAction` dans l'en-tête), bouton principal sous la carte, puis cartes « Résumé » et
  « Tâches suggérées » (liste blanche). Erreur IA en carte blanche (`Panel`) à filet rouge.
- **Coffre** (menthe, `tints.mint`, comme sa carte du menu Agence et Sécurité des Réglages) :
  - `VaultScreen` : carte « Nouveau document » (nom du fichier et mention de chiffrement en
    `CardNote`, contact et projet en champs blancs), carte « Documents » avec compteur et liste
    blanche. **Seul le rendu change** : `pick` (dont `copyToCacheDirectory` sous Android, cf.
    §16), `send`, `lock`, `useFocusEffect` et le nettoyage des copies déchiffrées sont
    identiques ligne pour ligne.
  - `VaultDocumentScreen` : carte « Document » (contact, projet, date d'ajout, mention de
    déchiffrement local) ; téléchargement, déchiffrement, ouverture et suppression inchangés.
  - `VaultPassphrasePanel` (composant partagé par les deux écrans du coffre) : `Card` →
    `Panel`, comme le formulaire des écrans de connexion. Aucune logique touchée.

Les erreurs (IA, coffre) passent de `Card` à filet rouge à `Panel` à filet rouge.

### Bilan : tous les écrans de `src/screens`

Les 28 fichiers de `src/screens` (27 écrans + `QontoSection`, section de l'écran Finances)
sont dans la direction « cartes pastel ». Toutes les routes de `src/app` délèguent à l'un
d'eux ; les seuls autres fichiers sont des `_layout.tsx` (navigateurs, en-têtes et barre
d'onglets, qui suivent les jetons depuis le §26).

| Fichier | Lot | Teinte(s) |
|---|---|---|
| `TodayScreen` | témoin (§27) | rose, ciel, pêche, beurre, menthe ; revue en blanc |
| `CalendarScreen` | témoin (§27) | grille blanche ; ciel, pêche, beurre, menthe |
| `SettingsScreen` | témoin (§27) | lavande, ciel, beurre, menthe, pêche, rose |
| `AuthScreen` | A (§28) | carte blanche (`AuthLayout`) |
| `ResetPasswordScreen` | A (§28) | carte blanche (`AuthLayout`) |
| `TasksScreen` | A (§28) | pêche |
| `NotesScreen` | A (§28) | lavande |
| `NoteDetailScreen` | A (§28) | feuille blanche, liseré lavande |
| `SearchScreen` | A (§28) | pêche, lavande, rose, ciel |
| `WeeklyReviewScreen` | A (§28) | pêche, ciel, menthe, beurre, lavande |
| `ReminderFormScreen` | A (§28) | menthe |
| `AppointmentFormScreen` | A (§28) | ciel |
| `agency/AgencyScreen` | B (§29) | une teinte par section |
| `agency/ContactsScreen` | B (§29) | rose |
| `agency/ContactDetailScreen` | B (§29) | rose ; rappels menthe |
| `agency/ContactFormScreen` | B (§29) | rose |
| `agency/ProjectsScreen` | B (§29) | ciel |
| `agency/ProjectDetailScreen` | B (§29) | ciel ; tâches liées pêche |
| `agency/GoalsScreen` | B (§29) | menthe |
| `agency/GoalFormScreen` | B (§29) | menthe |
| `agency/KeyDatesScreen` | B (§29) | beurre |
| `agency/KeyDateFormScreen` | B (§29) | beurre |
| `agency/MoneyScreen` | C (§30) | lavande |
| `agency/QontoSection` | C (§30) | lavande |
| `agency/MoneyFormScreen` | C (§30) | lavande |
| `agency/MeetingReportScreen` | C (§30) | pêche |
| `agency/VaultScreen` | C (§30) | menthe |
| `agency/VaultDocumentScreen` | C (§30) | menthe |

Vérification : `npx tsc --noEmit` et `npx expo lint` passent sur tout le projet ; chaque
fichier de `src/screens` importe au moins un composant de la refonte (`CategoryCard`,
`CardSectionHeader`, `Panel` ou `AuthLayout`) ; plus aucun `Section`, `Card` ni `GroupedItem`
n'est rendu dans `src/`. Vérification faite sur le code (types, lint, recherche), pas encore
sur appareil : à contrôler à l'œil en clair et en sombre.

### Ce qui reste

- `Section`, `Card` et `GroupedItem` (`ui.tsx`) ne sont plus utilisés : à supprimer dans un
  commit de nettoyage.
- Hors OTA, inchangé depuis le §26 : couleur des notifications Android et fond de l'icône
  adaptative (config native, au prochain build).

Toujours livrable par `eas update` : aucune dépendance, `app.json` inchangé.

## 31. CRM — Lot 1 : segments, pipeline de prospection, prospect → client

Modèle métier repris du tableau de bord web regista-dashboard (validé par Landry), **adapté**
et non copié : le web a deux tables (`prospects` et `clients`) et a dû les fusionner après coup.

### Architecture : on étend `contacts`, pas de table `prospects`

- **Un contact EST un prospect tant que `pipeline_stage` est renseigné.** `NULL` = contact
  hors pipeline (client actif, partenaire, contact pro quelconque). Pas de deuxième table, donc
  pas de copie ni de fusion à la conversion, et tout ce qui est déjà rattaché au contact
  (interactions, rappels, RDV, dates clés, finances, coffre) le suit sans rien faire.
- **Conversion prospect → client** = `pipeline_stage` repasse à `NULL` (« Marquer comme client
  actif »). Proposé dès qu'on passe un contact à « Signé » (fiche ou pipeline) ; refusable
  (« Plus tard ») : il reste alors dans la colonne Signé, avec un bouton « Client actif » sur
  sa carte Prospection. Le montant et la prochaine relance sont conservés (historique).
- **Colonnes ajoutées, toutes nullables** (Supabase `013_crm_pipeline.sql`, locale v13) :
  - `segment` (CHECK) : `club_amateur`, `club_pro`, `marque`, `agence`, `joueur`,
    `createur_contenu`, `ligue`, `district`, `artiste`, `organisme_etat`, `subvention`,
    `mecene`, `sponsor`, `autre` ; libellés français dans `SEGMENT_LABELS` (`crmDb.ts`).
  - `pipeline_stage` (CHECK) : `a_demarcher`, `deck_envoye`, `a_relancer`, `signe`, `perdu`.
  - `pipeline_amount numeric` (≥ 0, en euros, pas de colonne devise : un deal se chiffre en €),
    `next_followup_date date`, `stage_changed_at timestamptz`.
- **`stage_changed_at`** : trigger serveur `contacts_stage_changed`, qui passe après le LWW
  (`contacts_before_write`, ordre alphabétique des triggers). Si l'étape change : l'heure
  envoyée par l'app (changement fait hors ligne, poussé plus tard) bornée à `now()`, sinon
  `now()` ; si elle ne change pas, la valeur serveur est conservée (le client ne peut pas la
  réécrire). L'app la renseigne aussi en local (`stageFields()`) pour l'afficher hors ligne ;
  le pull ramène ensuite la valeur serveur.
- **Sync** : `CONTACTS` décrit les nouvelles colonnes, le moteur générique (§5) fait le reste.
  La migration locale v13 remet à zéro le curseur de pull des contacts (comme la v2 pour les
  tâches) : un appareil mis à jour plus tard récupère ainsi les segments et étapes déjà saisis
  ailleurs. Un appareil encore sur l'ancienne version n'envoie pas ces colonnes : l'upsert
  PostgREST ne touche qu'aux colonnes reçues, rien n'est effacé.

### Vocabulaire

La règle du §10 tient (l'agence ne gère pas de joueurs : ni « joueur » ni « mercato » dans le
code et les écrans). **Exception validée par Landry** : le segment « Joueurs » (valeur
`joueur`), type de relation commerciale (contact professionnel), pas une gestion de carrière.
Le mot n'apparaît que dans la liste des segments (`crmDb.ts`) et la contrainte SQL.

### Écrans (cartes roses, catégorie Contacts)

- **Pipeline** = troisième valeur du contrôle segmenté de l'écran Contacts (« Tous · À
  relancer · Prospects »), plutôt qu'une nouvelle entrée du menu Agence : même catégorie, même
  recherche (qui porte aussi sur le segment), et le menu n'aurait pu le placer qu'à côté de
  Contacts dans la même teinte (deux cartes roses voisines, cf. §29). La carte Contacts du menu
  affiche le nombre de prospects en cours (hors Signé et Perdu).
  `PipelineBoard` : kanban simplifié, les cinq colonnes empilées en `CategoryCard` (icône
  d'étape, compteur, total potentiel à droite de l'en-tête), lignes en `CardList`, triées par
  prochaine relance. Pas de glisser-déposer : « Étape » sur chaque ligne ouvre
  `PipelineStageSheet` ; l'appui sur la ligne ouvre la fiche. Perdu en texte barré.
  « À relancer » du contrôle segmenté reste la relance automatique à 45 jours (§6), distincte
  de l'étape « À relancer » du pipeline.
- **Formulaire** : segment en pastilles (« Aucun » + 14) dans la carte Contact ; carte
  « Prospection » avec l'interrupteur « Ce contact est un prospect en cours de démarchage » qui
  révèle étape, montant potentiel et prochaine relance (champ blanc + `DatePickerSheet`).
- **Fiche** : segment à côté du rôle ; carte « Prospection » si une étape est renseignée :
  étape (sélecteur), montant (renvoie au formulaire), prochaine relance (sélecteur de date,
  badge « En retard »).

Aucune dépendance, `app.json` inchangé : livrable par `eas update`, **après** avoir appliqué
`013_crm_pipeline.sql` (sinon la sync des contacts échoue jusqu'à la migration ; l'outbox locale
est conservée).

## 32. CRM — Lot 2 : relances automatiques et purge RGPD des prospects

Modèle métier de regista-dashboard (`lib/crm/followups.ts`, `followups-sync.ts`,
`retention.ts`, `retention-purge.ts`, validé par Landry), **adapté** à une app offline-first :
pas de cron serveur, tout est calculé sur le téléphone, à partir de SQLite.

### Séquence de relances

- Prospect entré en « À démarcher » (création, ou passage à cette étape) : tâche « Envoyer le
  deck » à J+2 de l'entrée. Cochée automatiquement au premier contact enregistré ou dès que
  l'étape avance.
- **Début de la séquence** : premier mail, appel ou deck enregistré (interaction). À défaut, la
  tâche deck cochée à la main, ou le passage à « Deck envoyé ». Relance 1 à J+5, relance 2 à
  J+10, relance 3 à J+20, puis « Sans réponse après 3 relances : passer X en perdu ? » à J+30.
- **Relance faite** = nouveau mail/appel/deck enregistré, ou tâche de relance cochée : la suivante
  se programme, au moins 3 jours après le dernier contact en cas de retard.
- **RDV** (agenda `appointments` lié au contact, ou interaction « RDV ») daté après le début :
  le prospect a répondu, les relances ouvertes sont retirées et la séquence s'arrête.
- **Signé, Perdu ou sorti du pipeline** : tâches automatiques ouvertes retirées.
- **Tâche automatique supprimée à la main** = étape sautée, jamais recréée (voir ci-dessous).
- **« Prochaine relance »** : la fiche et la tâche en cours se suivent. Si elles divergent, la
  dernière modifiée gagne (`updated_at`) : date changée sur la fiche → la tâche est reprogrammée ;
  échéance changée dans Tâches → la fiche suit. Une date saisie avant le début de la séquence
  devient l'échéance de la relance 1. Quand une tâche est retirée, la date de relance n'est
  effacée que si c'était la sienne (une date saisie à la main est conservée, cf. §31).
- Écarts assumés avec le web : pas d'étape « en veille », ni de « premier contact déclaré » ni
  de compteur de relances antérieures (colonnes absentes de Road). Un appel démarre aussi la
  séquence (demande de Landry). Nouveau type d'interaction « Deck » (texte libre, pas de
  contrainte SQL à changer).

### Architecture

- **`tasks.contact_id` + `tasks.auto_kind`** (Supabase `014_tasks_crm_followups.sql`, locale
  v14). `auto_kind` (`deck`, `relance_1..3`, `perdu`) distingue une tâche automatique d'une tâche
  manuelle (`NULL`) ; la replanification ne touche jamais aux tâches manuelles.
- **Fonction pure** `src/lib/crmFollowups.ts` (`planFollowups`) : jours locaux en entrée, liste
  d'actions en sortie (`insert`, `complete`, `retitle`, `reschedule`, `remove`, `setFollowup`).
- **Application** `src/db/crmFollowupsDb.ts` : lit prospects, interactions, RDV et tâches
  automatiques (tombstones compris), applique les actions dans une transaction, avec l'outbox.
  Idempotent : un second passage ne produit rien.
- **Déclenchement** `src/sync/useFollowupAutomation.ts`, monté sur Contacts, la fiche contact et
  Tâches : recalcul à l'ouverture, à chaque `dataVersion` (interaction ajoutée, étape changée,
  tâche cochée, pull de la sync) et au changement de jour. Recalculs sérialisés (plusieurs écrans
  montés) ; garde-fou qui suspend l'automatisation après 5 passages consécutifs qui écrivent
  (planification qui ne se stabiliserait pas) plutôt que de boucler.
- **Étape sautée = tombstone** : la suppression à la main est logique (§5) et garde `auto_kind` ;
  le planificateur lit les lignes supprimées et considère l'étape passée. Le retrait par
  l'automatisation (Signé, Perdu, RDV) efface `auto_kind` en même temps que `deleted_at` : la ligne
  n'est plus vue comme une étape sautée, et la relance peut revenir si le prospect est réactivé.
- **Id déterministe** : l'id d'une tâche automatique est un hachage SHA-256 de (utilisateur,
  contact, étape) mis au format UUID (`expo-crypto`, déjà présent). Deux appareils hors ligne
  créent la même ligne, que l'upsert fusionne en last-write-wins. Une contrainte d'unicité
  serveur aurait fait échouer tout le lot de l'outbox des tâches. Une réinsertion « ressuscite »
  la ligne retirée (`ON CONFLICT … deleted_at = NULL`).
- Priorité « haute » pour les tâches automatiques, comme sur le web. Le titre suit le nom du contact.
- Suppression d'un contact : ses tâches rattachées sont supprimées avec lui.

### Purge RGPD

- `src/lib/crmRetention.ts` : prospect (étape renseignée, hors Signé) dont le dernier signe de vie
  (création, changement d'étape, interaction, **et RDV**, ajouté par prudence) date de plus de
  3 ans.
- **Jamais automatique** (règle d'or) : écran `prospect-purge` (Réglages > Données personnelles)
  qui liste les candidats, avec « Supprimer » par contact et « Tout supprimer » ; chaque
  suppression passe par une alerte de confirmation. La liste se met à jour d'elle-même (`dataVersion`).
- `purgeContacts()` (`crmDb.ts`) : les tables n'ont ni clé étrangère ni cascade serveur, et la
  suppression est logique (tombstone synchronisé). Une suppression simple laisserait donc nom,
  téléphone, e-mail et résumés sur Supabase. La purge **efface d'abord les données
  personnelles** (nom, rôle, club, téléphone, e-mail, notes, montant ; résumés des interactions ;
  titres des tâches, tombstones compris), puis supprime comme `softDeleteContact` (interactions et
  tâches supprimées ; RDV, rappels, dates clés, finances et documents détachés). Restent l'id, les
  dates, le segment et l'étape. Une vraie suppression physique des tombstones reste à faire côté
  serveur (policy DELETE déjà prévue dans `schema.sql`).

Aucune dépendance, `app.json` inchangé : livrable par `eas update`, **après** avoir appliqué
`014_tasks_crm_followups.sql` (sinon push et pull des tâches échouent jusqu'à la migration ;
l'outbox locale est conservée).

## 33. Lot 3 — veille BOAMP (appels d'offres publics)

Logique métier de regista-dashboard (`lib/veille/boamp.ts`, `sync.ts`, filtre testé par Landry),
**adaptée** : pas de cron serveur Next.js, la recherche se déclenche depuis l'app. Les rappels
J-7 / J-2 des dossiers de candidature du web (`reminders.ts`) ne font pas partie de ce lot.

### Architecture

```
App Expo ──functions.invoke('boamp-sync') + JWT──▶ Edge Function ──GET sans clé──▶ API BOAMP
   ▲                                                   │ (service role)       (Opendatasoft)
   │                                                   ├─ lit veille_settings (mots-clés)
   └── sync offline-first (pull) ◀── tender_offers ◀───┘ insert des nouveaux avis
```

- **Edge Function `boamp-sync`** (`supabase/functions/boamp-sync/`), même squelette que
  `qonto-sync` (§14) : `verify_jwt` + `auth.getUser(jwt)`, client service role, `fetch` standard.
  **Aucun secret** : l'API BOAMP est ouverte. Pas de liste d'utilisateurs autorisés,
  contrairement à Qonto : les données sont publiques et chacun n'écrit que ses lignes. Garde-fou
  de 30 s entre deux synchros réussies (429), pour les appuis répétés.
- **Filtre** (requête `where` ODSQL, vérifiée en direct le 2026-10-03 sur l'API Explore v2.1) :
  `nature_libelle = "Avis de marché"` (ni résultats ni rectificatifs), `type_marche = "SERVICES"`
  (devenu un tableau côté BOAMP, l'égalité fonctionne toujours), objet contenant un mot « sport »
  **et** (un mot « activité » **ou** `descripteur_libelle = "Publicité, Communication"`).
  `search()` est une recherche plein texte (« sport » trouve « sportives »). Les guillemets et
  antislash sont retirés des mots-clés avant d'être injectés dans la requête. Au moins un mot
  « sport » est exigé (sinon toute la communication publique remonterait) ; la liste « activité »
  peut être vide (seule la catégorie compte alors).
- **Fenêtre de parution** : depuis la dernière synchro réussie moins 3 jours (avis publiés tard,
  doublons ignorés) ; **30 jours** à la première synchro, **ou si les mots-clés ont changé depuis**
  (ajout par rapport au web, qui manquait les avis déjà parus pour un nouveau mot). Pagination par
  100 (plafond de `limit` de l'API), 500 avis au plus. Avis dont la date limite est passée ignorés.
- **Insertion seule** (`ON CONFLICT (user_id, source, external_id) DO NOTHING`) : un avis déjà
  connu n'est jamais réécrit par la fonction. Sinon, sa mise à jour (horodatage serveur) battrait
  en last-write-wins un changement de statut fait hors ligne et poussé plus tard. Les
  rectificatifs BOAMP sont des avis distincts, exclus du filtre : rien n'est perdu en pratique.

### Données (Supabase `015_veille_boamp.sql`, locale v15)

- **`tender_offers`** : colonnes demandées + `server_updated_at` et trigger `lww_before_write()`,
  mêmes policies RLS que les autres tables synchronisées (insert compris : le push est un upsert).
  `id` généré par la base (`gen_random_uuid()`), unicité `(user_id, source, external_id)`,
  `status` CHECK `nouveau / interessant / ignore / candidate`.
- **Synchronisée offline-first** (contrairement à `qonto_items`) : décrite par un `EntitySpec`
  (`tenderOffersDb.ts`) et ajoutée à `TABLES`. La liste se consulte et les statuts se changent
  hors ligne ; seule la recherche de nouveaux avis demande le réseau. L'app ne crée ni ne supprime
  d'avis : « Ignoré » tient lieu de suppression.
- **Nouveau type de colonne générique `list`** (`entityTable.ts`) pour `categories` : `text[]`
  Postgres, JSON en SQLite, `string[]` côté app (texte illisible → liste vide).
- **`veille_settings`** : une ligne par utilisateur (clé primaire `user_id`), valeurs par défaut
  **dans la migration** (sport : sport, football, club ; activité : communication, marketing,
  événementiel, réseaux sociaux), créée au premier besoin par l'app ou la fonction
  (`INSERT … ON CONFLICT DO NOTHING`). **En ligne, hors moteur de sync** (comme Qonto) : la
  fonction doit lire les mots-clés côté serveur, et la recherche demande de toute façon le réseau.
  Droits par colonne : l'app n'insère/modifie que les mots-clés ; `last_run_at`, `last_run_status`,
  `last_run_message` sont écrits par la fonction. `updated_at` = dernier changement de mots-clés
  (trigger), ce qui déclenche la relecture sur 30 jours. 30 mots-clés au plus par liste (CHECK).

### Écrans (lavande, catégorie secondaire `veille`)

- Toutes les teintes sont prises : la veille reprend **lavande** (Finances : une opportunité de
  chiffre d'affaires), distincte de ses voisines du menu (Contacts rose, Projets ciel).
- **Menu Agence** : carte « Veille appels d'offres » sous Contacts (prospection commerciale),
  nombre d'avis nouveaux, alerte « N urgents ».
- **`agency/veille`** : carte « Recherche BOAMP » (bouton Synchroniser, dernière recherche ou
  dernière erreur), filtres en pastilles avec compteurs (Nouveaux · Intéressants · Ignorés ·
  Candidatures : quatre libellés trop longs pour un contrôle segmenté), liste triée par date
  limite (clôturés en fin de liste). Chaque carte : objet, acheteur, département, procédure,
  date limite (badge **« Urgent »** à 7 jours ou moins, sauf ignorés et candidatures envoyées),
  catégories officielles, sélecteur de statut (feuille) et « Voir l'avis » (`Linking.openURL`,
  navigateur). Après une recherche, la sync est relancée pour ramener les nouveaux avis.
- **`agency/veille-settings`** (icône réglages en en-tête) : deux cartes, Sport et Activité ;
  mots en pastilles (appui = retirer), champ + « Ajouter ». Mot normalisé (minuscules, espaces
  réduits, guillemets retirés) ; expressions de plusieurs mots acceptées (« réseaux sociaux »).
  Enregistrement immédiat en ligne ; impossible de retirer le dernier mot « sport ».

### Mise en service

1. Appliquer `supabase/migrations/015_veille_boamp.sql` (SQL Editor).
2. Déployer la fonction : `supabase functions deploy boamp-sync` (aucun secret à définir).
3. Publier l'app : aucune dépendance, `app.json` inchangé → `eas update` suffit, **après** l'étape
   1 (sinon seule la sync de `tender_offers` échoue, les autres tables continuent).

## 34. Lot 4 — objectifs de chiffre d'affaires calculés depuis Qonto

Logique métier de regista-dashboard (`lib/qonto/objectives.ts`, `treasury.ts`) **adaptée** :
le web calcule côté serveur après chaque synchro et **écrit** le montant dans l'objectif ;
Road calcule **en local, à l'affichage**, sans rien écrire.

### Données (Supabase `016_goals_ca.sql`, locale v16)

- `goals.kind` `text not null default 'manuel'`, CHECK `manuel / ca`. Les objectifs existants
  deviennent `manuel` : comportement inchangé (`progress` saisi à la main).
- `ca_target_amount` `numeric(14,2)` (euros, CHECK `> 0` si renseigné) et `ca_period`
  (CHECK `trimestre / semestre / annee`), nullables, utilisés seulement si `kind = 'ca'`.
  Pas de contrainte croisée côté serveur (« ca ⇒ cible et période ») : une ligne refusée
  bloquerait l'outbox des objectifs ; c'est le formulaire qui l'exige (avec la date cible).
- Pour un objectif de CA, `progress` n'est **pas** utilisé : il garde la dernière valeur
  manuelle (retrouvée si l'objectif repasse en manuel).
- Pas de remise à zéro du curseur de pull (aucun objectif distant n'a encore ces colonnes).
  Une ancienne version de l'app qui modifie un objectif de CA ne pousse que ses colonnes
  connues : `kind` et la cible sont préservés.

### Calcul local plutôt que serveur — pourquoi

- **Correction d'une hypothèse de départ** : `qonto_items` n'était *pas* synchronisée en
  SQLite (§14 : `select` en ligne, 300 lignes au plus, rien hors ligne). Calculer « en SQLite
  local » demandait donc une copie locale.
- **`qonto_receipts`** (table locale seule, v16) : copie en lecture seule des encaissements
  — `qonto_items` de `kind = 'transaction'`, `status = 'completed'`, `currency = 'EUR'`,
  `amount > 0`, `qonto_date` renseignée. Montants en **centimes entiers** (sommes exactes).
  Ni outbox ni curseur : la table est remplacée en entier à chaque rafraîchissement
  (paginé par 1000, sans plafond ; quelques centaines de lignes par an). Date du dernier
  rafraîchissement réussi dans `sync_meta` (`qonto_receipts_at:<user>`).
- **Pas d'Edge Function ni de colonne calculée côté serveur** : les données sont déjà sur
  Supabase, lisibles par RLS ; un aller-retour de plus n'apporterait rien. Le calcul local
  marche hors ligne (dernière copie), reste instantané quand on change la date ou la période
  dans le formulaire, et **n'écrit rien dans `goals`** : pas de mise à jour qui partirait
  dans l'outbox à chaque ouverture, ni de conflit last-write-wins entre deux appareils dont
  les copies Qonto différeraient.
- Le calcul vit dans **`listGoals`** : la carte Agence (« N objectifs en cours »), la revue
  hebdomadaire et le tri (atteints en dernier) utilisent l'avancement calculé sans autre
  modification. Une requête `SUM` indexée par objectif de CA (volumes très faibles).

### Règles de calcul (`lib/caGoals.ts`)

- **Période** (choix de Landry, différent du web) : les N mois **se terminant à la date
  cible**, bornes incluses — trimestre au 31/12 → 01/10–31/12 ; au 15/06 → 16/03–15/06. Le
  web prenait la période civile contenant l'échéance. Fin de mois bornée (trimestre au 30/05 →
  28/02–30/05). Date cible obligatoire pour un objectif de CA.
- **Encaissé** = transactions **effectuées** uniquement (le web aussi : `status = completed`),
  les `pending` ne sont pas encore encaissées. `qonto_date` = date de règlement (UTC).
- **Avancement** = encaissé / cible, entier **arrondi vers le bas** (100 % seulement une fois
  la cible atteinte), plafonné à 100.
- **Limites connues** : tout crédit en euros compte (remboursement fournisseur, virement
  entre ses propres comptes Qonto…) — le web avait un drapeau `counts_as_revenue` corrigeable
  à la main, absent ici. `qonto-sync` n'importe que les transactions **modifiées depuis 90
  jours** (§14) : un objectif annuel ne voit l'année entière que si les synchros ont été
  faites au fil de l'eau.

### Écrans (menthe, catégorie Objectifs)

- **Formulaire** : contrôle segmenté **Manuel / Chiffre d'affaires** sous le titre. En CA, la
  carte « Avancement » est remplacée par « Chiffre d'affaires » : montant cible (€), période
  (Trimestre / Semestre / Année), période exacte comptée, aperçu « Encaissé : X / Y · N % »
  recalculé dès que la date ou la période change, mention « calculé depuis Qonto ».
- **Liste** : pour un objectif de CA, « 12 400 € / 20 000 € » sous le titre, barre calculée,
  ligne « Calculé depuis Qonto · du … au … · à jour <date> » (ou « aucune donnée (connexion
  requise) »). Pas de saisie possible de l'avancement.
- **Recalcul** : à chaque ouverture de l'écran Objectifs (et au tirer-pour-rafraîchir), la
  copie des encaissements est relue s'il existe au moins un objectif de CA, puis
  `runLocal` relance les lectures locales. Même chose après « Synchroniser » dans
  Finances › Depuis Qonto. Hors ligne : dernière copie, sans erreur affichée.

### Mise en service

1. Appliquer `supabase/migrations/016_goals_ca.sql` (SQL Editor), **avant** de publier l'app
   (sinon seule la sync des objectifs échoue ; l'outbox est conservée).
2. Aucune Edge Function à déployer, aucun secret. Aucune dépendance, `app.json` inchangé →
   `eas update` suffit, pas de nouveau build.

## 35. Desktop Mac — scaffold Tauri (abandon de Mac Catalyst)

Mac Catalyst abandonné après audit : bug confirmé de Xcode 27 sur la validation
`MACOSX_DEPLOYMENT_TARGET` des cibles Pods (reproductible même en forçant la valeur en ligne
de commande avec `xcodebuild`, donc indépendant de notre configuration). Xcode 26.6
(recommandé par Expo pour SDK 57) n'est pas installable sur la version de macOS de la machine.

**Choix : Tauri** (coquille native Rust + webview système macOS + frontend web React/Vite).
Évite entièrement Xcode/CocoaPods pour la version Mac. Nouveau dossier séparé
`road-desktop-tauri`, copie initiale de l'app mobile, sans toucher au projet mobile d'origine.

- Frontend web : Vite + React + TypeScript (pas Next.js — Tauri embarque un frontend statique,
  pas besoin de serveur).
- Ancien code React Native rangé dans `mobile-legacy/` (référence, pas supprimé) ; code métier
  pur (hors composants RN) réimporté dans `src/` sans réécriture de la logique.
- Identifiant bundle desktop : `com.regista.road.desktop` (distinct du mobile
  `com.regista.road`, pour ne jamais confondre les deux apps même installées côte à côte).
- **Pas de cache SQLite local pour cette version desktop** : connexion directe à Supabase
  (`src/data/*.ts`). Raison : le Mac est une machine fixe, généralement en ligne ; la logique
  offline-first du mobile (utile en déplacement, mauvais réseau) n'apporte pas grand-chose ici
  et complexifierait le scaffold initial. Du offline pourra être ajouté plus tard si un besoin
  réel apparaît (ex. coupures réseau fréquentes constatées à l'usage).
- Variables d'environnement : préfixe `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` dans
  `.env.local` (Vite exige ce préfixe pour exposer une variable au code client ; remplace
  `EXPO_PUBLIC_SUPABASE_*` utilisé côté mobile). Fichier toujours ignoré par git.
- Étape 1 (ce scaffold) : auth Supabase (email/mot de passe) + écran provisoire "Connecté :
  {email}". Les 28 écrans réels arrivent aux étapes suivantes, lot par lot comme pour le mobile.
- Build web vérifié (`npm run build`, `tsc --noEmit` propres). La coquille Tauri elle-même
  (Rust/`cargo tauri dev`) n'a pas pu être testée depuis le bac à sable Linux de l'assistant
  (pas de toolchain Rust) — premier test réel à faire sur le Mac de Landry.

## 36. Desktop — lot correctif (bug des listes vides, nettoyage de l'import, audit)

### Bug « zéro contact, zéro projet, zéro tâche » (cause confirmée dans le code)

- Quand le jeton d'accès a expiré (fenêtre masquée ou Mac en veille : supabase-js arrête son
  minuteur de renouvellement quand la page est cachée) et que le renouvellement échoue de
  façon **passagère** (réseau pas encore revenu au réveil, coupure, 5xx), `auth.getSession()`
  renvoie `session: null` **sans** émettre `SIGNED_OUT` (auth-js `__loadSession` /
  `_callRefreshToken`) : l'app ne repasse donc pas par l'écran de connexion.
- supabase-js envoie alors les requêtes PostgREST avec la **clé anon** comme jeton
  (`_getAccessToken` → repli sur `supabaseKey`). La RLS (`auth.uid() = user_id`) ne renvoie
  pas d'erreur mais **zéro ligne**, et `useRemoteQuery` remplaçait les vraies données par ces
  listes vides. Le retour sur la fenêtre (`focus`) déclenchait justement ces lectures au pire
  moment ; l'échec étant mis en cache 60 s par auth-js, toutes les lectures de cette fenêtre
  revenaient vides, et rien ne relisait les écrans une fois le jeton renouvelé.
- Correctif : `lib/supabase.ts` refuse avant envoi toute requête REST / Storage / Functions
  sans jeton utilisateur (erreur affichée, données conservées) ; `SessionProvider` relance les
  lectures à `TOKEN_REFRESHED` / `SIGNED_IN` et au retour du réseau (`online`).
- Pas propre au mode développement : le scénario touche aussi l'app compilée. Le HMR de Vite
  pouvait en plus créer un second client en `tauri dev` si `lib/supabase.ts` était réévalué ;
  le client est désormais unique par fenêtre (`globalThis`).

## 37. Desktop — fin du lot correctif (finitions de l'audit, outillage)

### I14 — changement de mot de passe sans l'actuel : action manuelle

- Le réglage ne se pilote **pas depuis l'app** : c'est une option de Supabase Auth, côté
  projet, que la clé anon ne peut pas modifier. Le dépôt n'a pas de `supabase/config.toml`
  (projet non géré par `supabase config push`), donc rien à changer dans le code non plus.
- **À faire par Landry** : dashboard Supabase › Authentication › Sign In / Providers › Email ›
  activer **« Secure password change »**. Équivalents si besoin : `secure_password_change = true`
  sous `[auth.email]` dans `config.toml`, ou le champ
  `security_update_password_require_reauthentication` de l'API Management (`/config/auth`).
  Noms relevés de mémoire, la documentation Supabase n'ayant pas pu être consultée pendant ce
  lot : se fier à l'intitulé du dashboard.
- Effet attendu : une session **ouverte depuis plus de 24 h** ne peut plus changer le mot de
  passe sans confirmation ; `updateUser` répond `reauthentication_needed`, que
  `ResetPasswordScreen` traite déjà (message : se déconnecter puis « Mot de passe oublié »).
  Une session récente (moins de 24 h) le peut toujours sans redonner l'actuel : c'est le
  comportement de Supabase, on n'ajoute pas de contrôle maison côté client (une vérification
  du mot de passe actuel dans la webview se contourne en appelant l'API directement).
- Amélioration possible plus tard : le parcours officiel `auth.reauthenticate()` (code reçu
  par e-mail) puis `updateUser({ password, nonce })`, au lieu de renvoyer vers « Mot de passe
  oublié ».

### Autres actions manuelles encore ouvertes (rappel du lot B2)

- Dashboard Supabase › Authentication › Sign In / Providers : **désactiver les inscriptions**.
- `SUMMARIZE_ALLOWED_USER_IDS` défini, puis **redéployer `summarize-meeting`** (elle refuse
  désormais tout appel si la liste est vide).

### Points mineurs traités dans ce lot

- Sortie des formulaires commune (`lib/useFormExit.ts`) : RDV, rappel, date clé, finances,
  objectif reviennent à l'écran d'origine (`navigate(-1)`, repli sur la liste sans
  historique). Retour ne rouvre plus le formulaire Finances / Objectifs après enregistrement.
- `useRemoteQuery` repassait déjà en `loading` quand `load` change (§36) ; la Revue de la
  semaine, seul écran à paramètres qui l'ignorait, atténue désormais les chiffres de
  l'ancienne semaine pendant la lecture (`.is-pending`, `aria-busy`).
- Import de contacts : fichier refusé au-delà de 10 Mo, avant lecture.
- Compte-rendu ouvert depuis un RDV (« Faire le compte-rendu ») : daté du début du RDV
  enregistré (titre de la note, `happened_at` de l'interaction). Ouvert ailleurs, il reste
  daté de la saisie (pas de RDV connu).
- Code mort : `lib/crmFollowups.ts` réduit aux étapes et titres (seul `autoTaskTitle` sert,
  pour les tâches posées par l'import) ; `planFollowups` reste propre au mobile.
  `useUserId` et `alertColor` avaient déjà disparu. `@tauri-apps/api` est **gardée** :
  `@tauri-apps/plugin-opener` l'importe, et la CLI Tauri compare sa version à celle du crate.

### ESLint + Prettier

- `eslint.config.js` : recommandé JS + `typescript-eslint`, `react-hooks/rules-of-hooks`
  (erreur) et `exhaustive-deps` (avertissement), `eslint-config-prettier`. Ignorés :
  `mobile-legacy/`, `supabase/` (Deno), `src-tauri/`.
- `.prettierrc.json` : guillemets simples, 120 colonnes, virgules finales « es5 », soit le
  style existant (le premier passage n'a touché que ~500 lignes, commit `style:` isolé).
- Scripts : `npm run lint`, `npm run format`, `npm run format:check`. À lancer avant chaque
  commit d'un lot ; pas de hook git imposé.

### Nettoyage des tâches deck de l'import (B1) : soft-delete vérifié dans le code

- `scripts/cleanup-import-tasks.ts` n'utilise que `update({ deleted_at })` sur les tâches
  deck ouvertes, un `upsert` de tâches **déjà supprimées** (`deleted_at` posé,
  `ignoreDuplicates`) et un `update` de `stage_changed_at` sur les contacts. Aucun `.delete()`
  ni `DELETE` dans `scripts/` ni `src/`, dans tout l'historique git.
- Le rapport `claude_cleanup_import_tasks.json`, écrit à chaque lancement, n'existe pas dans ce
  dossier : l'exécution elle-même n'est pas vérifiable d'ici. Contrôle côté base (éditeur SQL) :
  `select count(*) from tasks where auto_kind = 'deck' and deleted_at >= '2026-10-04';`
  doit compter au moins les 279 tâches retirées (plus les tâches posées déjà supprimées).

### État de l'audit

- Traités : B1, B2, B3 ; I1 à I13, I15 à I18 ; I14 côté code (reste le réglage Supabase) ;
  factorisations `ContactSelect`, erreurs et montants ; mineurs ci-dessus.
- **Volontairement non traités**, à reprendre dans un lot « dette » si le besoin se confirme :
  - PBKDF2 à 20 000 itérations (I12, partie migration) : format partagé avec le mobile, à
    migrer ensemble ;
  - finitions design restantes de l'audit (points de rupture calculés sur la fenêtre,
    contrastes du bouton danger en sombre et des contours de champ, tailles et rayons hors
    jetons, doublons `.gradient-button` / `.button--primary`) : à juger à l'écran sur le Mac,
    l'app n'ayant pas été lancée ici. Déjà réglés au lot précédent : défilement de la barre
    latérale, focus visible, focus initial sur « Annuler » dans les confirmations ;
  - factorisations restantes (`useRecordOnce`, case à cocher, navigation de période,
    accès `localStorage`), nommage `insert*` / `fetch*` / `load*` ;
  - ~25 exports utilisés seulement dans leur fichier : sans effet, et plusieurs fichiers
    `lib/` sont des copies du mobile qu'on évite de faire diverger ;
  - types `Database` générés, `noUncheckedIndexedAccess` ;
  - `QuickAddTask` qui vide le champ avant la fin de l'écriture, courses `addStep` /
    `moveStep`, purge de prospects sans progression, cas limites du parseur CSV, brouillon de
    compte-rendu en clair dans `localStorage` ;
  - Supabase : `qonto_id` unique global au lieu de `(user_id, qonto_id)`, `search_path` des
    fonctions de trigger, UPDATE de toutes les colonnes de `tender_offers` (migrations
    partagées avec le mobile).

## 38. Desktop — session morte : retour à l'écran de connexion

- Symptôme (constaté par Landry) : après la garde du §36, une session **vraiment** perdue
  (jeton de rafraîchissement expiré ou révoqué) laissait l'app « connectée » et toutes les
  lectures échouaient en boucle sur « Session momentanément indisponible ». Seul remède :
  se déconnecter puis se reconnecter à la main.
- Signal retenu, fourni par auth-js (2.117, `_callRefreshToken`) : un échec de
  renouvellement **retryable** (`AuthRetryableFetchError` : réseau, 5xx) laisse la session
  en place ; un refus du serveur (4xx, `AuthApiError`) la retire et émet `SIGNED_OUT` dès que
  le jeton d'accès a réellement expiré. `getSession()` renvoie alors une erreur non
  retryable, ou plus de session du tout. Pas de compteur d'échecs : ce signal suffit.
- Ce qui manquait : personne ne reposait la question après un refus. auth-js resert le même
  échec pendant 60 s sans retenter, et son minuteur s'arrête quand la fenêtre est cachée.
  Désormais chaque lecture refusée par la garde émet `road:session-refused` ;
  `SessionProvider` appelle alors `getSession()` (un seul appel à la fois) :
  - session présente : rien à faire ;
  - erreur retryable (ou renouvellement concurrent écarté) : passager, l'écran garde ses
    données, nouvelle vérification 65 s plus tard si le navigateur est en ligne, sinon à
    l'évènement `online` ;
  - autre erreur, ou session absente : `signOut({ scope: 'local' })` (sans appel réseau),
    session mise à `null` → AuthScreen affiche « Ta session a expiré : reconnecte-toi pour
    retrouver tes données. »
- Le même message s'affiche quand auth-js émet seul `SIGNED_OUT` ; il est omis après une
  déconnexion demandée depuis l'app (`useSignOut` → `setUserSigningOut`).
- Limites : non testé contre le vrai serveur (pas d'app lancée ici) ; un serveur qui répond
  en 5xx indéfiniment est traité comme passager (se reconnecter n'y changerait rien) ; la
  détection n'intervient qu'à la prochaine lecture refusée (focus, écriture, retour réseau),
  jusqu'à environ 65 s plus tard si auth-js resert encore un échec réseau en cache.

## 39. Échéances clés récurrentes (fiscal / URSSAF)

- Besoin : des rappels pour les obligations récurrentes (déclaration URSSAF, TVA, CFE…).
  Les échéances exactes dépendent du statut juridique de Landry (micro-entreprise ou
  société, à confirmer) : fonctionnalité **générique**, aucune échéance officielle codée.
  Les Échéances clés sont étendues plutôt qu'un système séparé.
- Schéma (app-repo `019_key_dates_recurrence.sql`, additive) : `recurrence` (`monthly` |
  `quarterly` | `yearly` | null = ponctuelle) et `recurrence_day` (1-31, séries mensuelles et
  trimestrielles seulement). `date` reste la **première échéance** de la série.
- Mécanisme : calcul côté client (`lib/keyDateRecurrence.ts`), sans écriture ni job planifié.
  Les occurrences se déduisent de `date` mois après mois au jour `recurrence_day`, ramené au
  dernier jour des mois plus courts (31 → 28/29/30, recalculé à chaque mois : pas de
  dérive). Annuel : jour et mois de `date`. Jamais d'occurrence avant `date`. Écarté : le job
  qui avance `date` en base (Edge Function + cron, écritures concurrentes avec le mobile
  offline-first, historique perdu) et l'avance de `date` à l'ouverture de l'app (écriture
  déclenchée par une lecture, plusieurs appareils).
- Affichage : une série montre toujours sa **prochaine** occurrence (aujourd'hui inclus),
  jamais « Passée » ; elle n'apparaît donc pas dans l'onglet Passées. La ligne porte un
  badge « Récurrent » et « Tous les mois · le 15 » dans le sous-titre ; le compte à rebours
  J-7/J-30/J-90 vaut pour l'occurrence affichée. `listKeyDatesBetween` (Vue du jour, Revue,
  calendrier) déplie chaque série sur la période, une ligne par occurrence.
- Formulaire : sélecteur Aucune / Mensuelle / Trimestrielle / Annuelle, « Première
  échéance », jour du mois (vide = celui de la première échéance), aperçu « Prochaine : … ».
  Catégorie `admin` « Fiscal / URSSAF » ajoutée aux pastilles (facultative, `category` reste
  un texte libre), exemple dans le placeholder de l'intitulé.
- Limites : rien ne marque une occurrence comme faite (elle disparaît le lendemain) ; pas de
  fin de série (supprimer la date clé arrête la série) ; supprimer supprime toute la série ;
  le mobile ne connaît pas la récurrence (non vérifié dans son code : il devrait afficher la
  première échéance, passée, et la catégorie `admin` brute) ; migration à appliquer **avant** cette version (sinon lectures
  et créations d'échéances en erreur).
