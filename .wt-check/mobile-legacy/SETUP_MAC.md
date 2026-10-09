# Ajouter la cible macOS (sur un Mac)

**Décision prise (03/10/2026) : Option C ci-dessous (Mac Catalyst), parce que Landry
veut éviter le compte Apple Developer payant (99$/an).** Les options A et B restent
documentées plus bas pour référence future, mais ne sont plus le plan actif.

## Option C (RETENUE) : Mac Catalyst, gratuit, local via Xcode

Réutilise directement le build iOS (déjà 100% fonctionnel, mêmes composants Expo que
sur Android) sous forme de vraie fenêtre Mac, sans App Store, sans compte payant,
sans date d'expiration gênante (contrairement à une app iPhone signée gratuitement,
qui expire au bout de 7 jours — cette limite ne s'applique pas à un build macOS
local signé avec un compte Apple personnel gratuit).

Pré-requis : Mac Apple Silicon (confirmé : M1), Xcode (en cours d'installation par
Landry, ~15-20 Go, pas besoin des simulateurs iOS supplémentaires).

### Étapes

1. Récupérer le code :
   ```bash
   git clone https://github.com/Elssy22/Assitant-App.git
   cd Assitant-App
   npm ci
   ```
2. Créer `.env.local` à la racine (demander les valeurs à Hermes, ne jamais les
   committer) :
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://trkwqttirqbtebekqjni.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<à demander>
   ```
3. Générer le projet natif iOS :
   ```bash
   npx expo prebuild -p ios
   ```
4. Ouvrir dans Xcode : `open ios/Road.xcworkspace`
5. Dans Xcode, sélectionner la cible « Road » → onglet **General** → **Supported
   Destinations** → **+** → ajouter **Mac (Mac Catalyst)**.
6. Onglet **Signing & Capabilities** → **Team** → choisir son Apple ID personnel
   (gratuit — Xcode → Settings → Accounts → + pour l'ajouter si besoin).
7. En haut de Xcode, choisir la destination **« My Mac (Mac Catalyst) »**, puis
   cliquer sur ▶ **Run**.
8. Si macOS bloque l'app au premier lancement (« développeur non vérifié ») :
   **Réglages Système → Confidentialité et sécurité** → **Ouvrir quand même**.

### Limites connues de cette option

- Rendu proche d'une app iPad plutôt qu'un design macOS 100% natif (pas grave pour
  un usage perso).
- Mise à jour du code : repasser par `npx expo prebuild -p ios` + rebuild Xcode à
  chaque fois pour l'instant (OTA/EAS Update pas encore testé sur ce type de build —
  à vérifier une fois la première version qui tourne).
- Nouvelle dépendance native (comme la biométrie ou les notifications côté Android) :
  toujours `npx expo prebuild -p ios` + rebuild Xcode.

---

## Options alternatives (non retenues pour l'instant, gardées pour référence)

**Vérifie les versions dans la doc officielle avant de reprendre l'une de ces options** :
react-native-macos suit React Native avec du retard, et les commandes
d'initialisation changent d'une version à l'autre.

- react-native-macos : https://microsoft.github.io/react-native-windows/docs/rnm-getting-started
- Releases : https://github.com/microsoft/react-native-macos/releases

## 0. Points de vigilance avant de choisir

| Sujet | Impact |
|---|---|
| Version de React Native | Le projet est en RN 0.86 (Expo SDK 57). react-native-macos n'existe que pour certaines versions de RN, souvent en retard. S'il n'y a pas de `react-native-macos@0.86.x`, il faudra attendre ou utiliser une autre option. |
| Expo Go | N'existe pas sur macOS. Il faut une app native compilée avec Xcode. |
| Modules Expo | Le support macOS des modules Expo (`expo-sqlite`, `expo-network`, `expo-crypto`) n'est pas garanti. Chacun est à tester. |
| CNG / prebuild | `expo prebuild` ne génère pas de dossier `macos/`. Ce dossier sera versionné et maintenu à la main (exception assumée à la règle « pas de dossiers natifs »). |
| Code partagé | Toute la logique (`src/db`, `src/sync`, `src/lib`) est en TypeScript pur. Seuls les modules natifs posent question. |

### Option A (la plus simple, à essayer en premier) : app iPad sur Mac Apple Silicon

Les Mac M1 et plus récents exécutent les apps iOS/iPad sans modification.

1. Dans `app.json`, garder `"ios": { "supportsTablet": true }` (déjà le cas).
2. Faire un build iOS : `npx eas-cli@latest build --platform ios --profile development`
   (ou `npx expo run:ios --device` sur le Mac).
3. Dans App Store Connect, cocher la disponibilité sur Mac (« iPhone and iPad Apps on Apple
   Silicon Macs »), puis l'installer via TestFlight sur le Mac.

Avantage : zéro code natif à maintenir, toutes les librairies Expo fonctionnent.
Inconvénient : l'interface reste celle d'une app iPad (pas de menus macOS natifs).

### Option B : react-native-macos (vraie app macOS native)

Voir les étapes ci-dessous.

## 1. Prérequis sur le Mac

```bash
xcode-select --install                 # outils en ligne de commande
# Installer Xcode (App Store), l'ouvrir une fois pour accepter la licence
sudo xcodebuild -license accept
brew install node watchman
sudo gem install cocoapods             # ou : brew install cocoapods
git clone <url-du-repo> && cd app-repo
npm install
```

## 2. Ajouter react-native-macos

```bash
# Version alignée sur la version mineure de React Native du projet (ex. 0.86.x)
npm view react-native-macos versions --json | tail -20   # vérifier qu'elle existe

npx react-native-macos-init            # crée le dossier macos/ et ajoute la dépendance
# (selon la version, la doc peut proposer à la place :
#  npm install react-native-macos@<version> puis copier le template macOS)

cd macos && pod install && cd ..
```

Ensuite :

- Ajouter dans `package.json` un script `"macos": "react-native run-macos"`.
- Vérifier la config Metro (`metro.config.js`) : la plateforme `macos` doit être reconnue.
  La doc react-native-macos explique comment étendre la config Expo
  (`expo/metro-config`).
- Retirer `/macos` de toute règle d'exclusion et **versionner** le dossier `macos/`.

## 3. Lancer

```bash
npm start                              # Metro
npm run macos                          # ou : npx react-native run-macos
# ou ouvrir macos/*.xcworkspace dans Xcode et lancer le scheme "*-macOS"
```

## 4. Adapter les modules natifs

Tester chaque dépendance native sur macOS :

| Dépendance | Si elle ne marche pas sur macOS |
|---|---|
| `expo-sqlite` | `@op-engineering/op-sqlite` (supporte macOS). Isoler l'accès BD derrière l'interface de `src/db/localDb.ts` et fournir une implémentation `localDb.macos.ts` (Metro choisit le fichier selon la plateforme). |
| `expo-sqlite/kv-store` (session Supabase) | `@react-native-async-storage/async-storage` (supporte macOS) |
| `expo-network` | `@react-native-community/netinfo` (supporte macOS) |
| `expo-crypto` (`randomUUID`) | `crypto.randomUUID()` si disponible sous Hermes/JSC, sinon `react-native-get-random-values` + `uuid` |

## 5. Valider la synchro Android ↔ macOS

Rejouer le protocole de `SPIKE_RESULTS.md` (section « Tester la synchro offline ») avec
A = Android et B = macOS, connectés au même compte Supabase.

## 6. Distribution (plus tard)

Signature avec un compte Apple Developer, notarisation (`xcrun notarytool`), puis
distribution directe (.dmg) ou via le Mac App Store. EAS Build ne compile pas de cible
react-native-macos : ce sera un build Xcode local ou en CI (GitHub Actions, runner macOS).
