# Spike : synchro offline-first Supabase (table `tasks`)

Objectif : vérifier qu'une liste de tâches fonctionne **hors ligne d'abord** (écriture
immédiate en SQLite local) et se synchronise entre deux appareils via Supabase
(last-write-wins sur `updated_at`, suppression logique via `deleted_at`).

> **État actuel : code écrit, pas encore exécuté.** L'environnement où il a été rédigé
> n'avait ni réseau ni droit d'installer des paquets : les dépendances ne sont pas encore
> installées, et `tsc` / `expo lint` n'ont pas été lancés. Les API Expo SDK 57 utilisées
> (expo-sqlite, expo-network, expo-crypto) n'ont pas été vérifiées dans la doc versionnée.
> Commence par l'étape 1 ci-dessous.

## Architecture

```
UI (TasksScreen)
  │  add / toggle / remove
  ▼
SQLite local (expo-sqlite)          ← source de vérité de l'UI, marche hors ligne
  ├─ tasks        (copie locale, soft delete)
  ├─ sync_queue   (outbox : 1 ligne = 1 action non synchronisée → compteur "X action(s)")
  └─ sync_meta    (curseur de pull par utilisateur)
  │
  ▼  syncOnce() = push puis pull
Supabase (Postgres + RLS)
  └─ tasks + trigger LWW (ignore une version plus ancienne) + server_updated_at
```

| Fichier | Rôle |
|---|---|
| `supabase/schema.sql` | Table, index, trigger LWW, policies RLS `user_id = auth.uid()` |
| `src/lib/supabase.ts` | Client Supabase, session persistée dans `expo-sqlite/kv-store` |
| `src/db/localDb.ts` | Schéma SQLite, écritures locales + outbox, application LWW des données distantes |
| `src/sync/syncEngine.ts` | Push (upsert de l'état courant des tâches de l'outbox) + pull paginé |
| `src/sync/useOfflineTasks.ts` | Hook : état réseau, déclencheurs de sync, compteur d'actions en attente |
| `src/screens/*` | Écran de connexion + écran liste |

Déclencheurs de sync : démarrage, chaque action locale (si en ligne), retour du réseau
(`expo-network`), retour au premier plan, polling toutes les 15 s, pull-to-refresh.

**Écart avec le cahier des charges :** une colonne `server_updated_at` (horodatage serveur
posé par le trigger) a été ajoutée à la table. Elle sert de curseur de pull. Sans elle, un
appareil dont l'horloge retarde pourrait écrire une ligne « dans le passé » que l'autre
appareil ne récupérerait jamais. `updated_at` reste la référence du last-write-wins.

## Lancer le projet

1. **Installer les dépendances** (versions compatibles SDK 57 résolues par Expo) :
   ```bash
   npm install
   npx expo install expo-sqlite expo-network expo-crypto @supabase/supabase-js
   npx tsc --noEmit && npx expo lint
   ```
2. **Préparer Supabase** :
   - SQL Editor → coller et exécuter `supabase/schema.sql`.
   - Authentication → Providers → Email : activé. Pour aller vite pendant le spike, tu
     peux désactiver « Confirm email » ; sinon, confirme le lien reçu par email avant de
     te connecter.
3. **Vérifier `.env.local`** : il contient `EXPO_PUBLIC_SUPABASE_URL` et
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` (ce fichier est ignoré par git, ne le commite pas).
4. **Démarrer** :
   ```bash
   npm start          # = expo start ; ajoute -c si tu viens de modifier .env.local
   ```
   Scanne le QR code avec **Expo Go** sur Android (même réseau Wi-Fi que le PC, ou
   `npx expo start --tunnel`). Les modules utilisés font partie d'Expo Go, donc pas besoin
   de build de développement pour ce spike.
5. Crée un compte (email + mot de passe), puis connecte-toi avec **le même compte** sur
   le 2e appareil (2e téléphone, émulateur Android ou simulateur iOS en attendant macOS).

## Tester la synchro offline

Appareil A = téléphone Android, appareil B = 2e appareil ou émulateur.

1. **Base** : connecté sur A et B, ajoute une tâche sur A → elle apparaît sur B en ≤ 15 s
   (ou tout de suite avec un pull-to-refresh sur B).
2. **Hors ligne** : sur A, coupe le Wi-Fi **et** les données mobiles (mode avion). Le
   bandeau passe en jaune « Hors ligne ».
3. Ajoute 3 tâches, coche-en une, supprimes-en une autre → l'UI réagit immédiatement, le
   bandeau affiche « 5 actions en attente de sync ». Ferme et relance l'app : les tâches et
   le compteur sont toujours là (persistance SQLite et session).
4. **Reconnexion** : réactive le Wi-Fi → bandeau vert, le compteur retombe à 0, et B reçoit
   les changements (≤ 15 s).
5. **Conflit LWW** : mets A et B hors ligne, coche la même tâche sur A, puis décoche-la sur B
   *quelques secondes plus tard*. Reconnecte A, puis B → les deux convergent vers l'état de
   B (écriture la plus récente). Reconnecte dans l'ordre inverse : même résultat.
6. **Suppression** : supprime une tâche sur A hors ligne, modifie-la sur B en ligne *avant* →
   à la reconnexion de A, la suppression gagne (plus récente). Dans Supabase (Table Editor),
   la ligne existe toujours avec `deleted_at` rempli.
7. **Contrôle RLS** : connecte-toi avec un autre compte → la liste est vide.

À noter pendant le test : délais observés, éventuelles erreurs affichées dans le bandeau,
comportement après plusieurs heures hors ligne (expiration du token).

## Limites connues

- **LWW au niveau de la ligne entière** : si A modifie le titre et B coche `done` hors ligne,
  la modification la plus récente écrase l'autre champ. Il faudrait un LWW par champ (ou
  des CRDT) pour fusionner.
- **Dépendance aux horloges des appareils** : `updated_at` est l'horloge client. Un
  téléphone en avance de 10 min gagne tous les conflits pendant 10 min. Le pull, lui, ne
  dépend pas des horloges (curseur `server_updated_at`).
- **Curseur de pull et transactions concurrentes** : `clock_timestamp()` est posé avant le
  commit ; une transaction lente pourrait committer une ligne avec un horodatage déjà
  dépassé par le curseur d'un autre appareil. Risque très faible avec un seul utilisateur
  et 2 appareils ; à corriger plus tard (marge de recouvrement ou séquence logique).
- **Pas de temps réel** : polling toutes les 15 s, donc latence et appels réseau inutiles.
- **Tombstones jamais purgées** : les tâches supprimées restent en base et en local.
- **Détection réseau** : « connecté au Wi-Fi » ne garantit pas que Supabase est joignable.
  Une sync qui échoue laisse l'outbox intacte et sera retentée, mais le bandeau peut
  afficher « En ligne » avec une erreur.
- **Auth** : la première connexion exige le réseau. Après un long moment hors ligne, le
  token expire ; supabase-js le rafraîchit à la reconnexion (à vérifier pendant le test).
  Si le refresh token est révoqué, il faut se reconnecter ; les actions en attente sont
  conservées et repartent après la connexion.
- **Une seule table, pas de migrations du schéma local** : `CREATE TABLE IF NOT EXISTS`
  seulement. Toute évolution demandera un `PRAGMA user_version` et des migrations.
- **Payload** : le push envoie la ligne complète de chaque tâche modifiée, sans regroupement
  par lots ni limite de taille.
- **Pas de tests automatisés** : la validation est manuelle (protocole ci-dessus).
- **Pas d'Expo Router** : un seul écran, donc `App.tsx` aiguille directement entre connexion
  et liste. À migrer vers `src/app/` dans le MVP.

## Prochaines étapes si le spike est concluant

1. **Choisir : garder la sync maison ou passer à une solution dédiée.** PowerSync, ElectricSQL,
   WatermelonDB + sync Supabase, Legend-State ou TinyBase. Ces outils gèrent déjà les
   migrations, les conflits et le temps réel. Comparer leur coût et le verrouillage
   fournisseur avec le coût de maintenance de ce code.
2. **Supabase Realtime** sur `tasks` pour remplacer le polling (garder le pull comme filet
   de sécurité).
3. **Moteur générique** : sync pilotée par une description des tables (projets, contacts,
   joueurs, etc. pour l'agence) plutôt que du code par table.
4. **Conflits plus fins** : LWW par champ ou horloge hybride (HLC) pour ne plus dépendre
   des horloges des appareils.
5. **Migrations SQLite versionnées** + nettoyage des tombstones (côté serveur avec `pg_cron`).
6. **Expo Router** (`src/app/`), écrans du MVP, tests (unitaires du moteur de sync avec une
   base SQLite en mémoire + test e2e Maestro du scénario hors ligne).
7. **Cible macOS** : voir `SETUP_MAC.md`.
8. **EAS** : `development` build puis `preview` pour tester sans Expo Go, et EAS Update
   pour les mises à jour OTA.
