import { makeTheme, type ColorScheme } from './tokens';

// Les jetons de tokens.ts (source unique partagée avec le mobile) deviennent des
// variables CSS sur <html> : --color-primary, --space-lg, --radius-card…
// Par défaut le mode suit l'apparence de macOS ; Réglages › Apparence peut le
// figer en clair ou en sombre (choix propre à cet ordinateur, non synchronisé).

/** Choix d'apparence de l'utilisateur. */
export type AppearancePreference = 'system' | ColorScheme;

const PREFERENCE_KEY = 'appearance:scheme';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function applyTheme(scheme: ColorScheme) {
  const theme = makeTheme(scheme);
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(theme.colors)) {
    if (typeof value === 'string') root.setProperty(`--color-${kebab(name)}`, value);
  }
  // Teintes pastel : --tint-peach-bg, --tint-peach-icon-bg… (cf. tintVars, components/ui.tsx).
  for (const [tint, values] of Object.entries(theme.colors.tints)) {
    for (const [name, value] of Object.entries(values)) root.setProperty(`--tint-${tint}-${kebab(name)}`, value);
  }
  for (const [name, value] of Object.entries(theme.spacing)) root.setProperty(`--space-${name}`, `${value}px`);
  for (const [name, value] of Object.entries(theme.radius)) root.setProperty(`--radius-${name}`, `${value}px`);
  root.setProperty('--shadow-card', theme.shadows.card);
  root.setProperty('--shadow-raised', theme.shadows.raised);
  root.setProperty('--sunset-gradient', theme.sunsetGradient);
  root.colorScheme = scheme;
}

export function getAppearancePreference(): AppearancePreference {
  try {
    const value = window.localStorage.getItem(PREFERENCE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

const systemQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function sync() {
  const preference = getAppearancePreference();
  applyTheme(preference === 'system' ? (systemQuery().matches ? 'dark' : 'light') : preference);
}

export function setAppearancePreference(preference: AppearancePreference) {
  try {
    if (preference === 'system') window.localStorage.removeItem(PREFERENCE_KEY);
    else window.localStorage.setItem(PREFERENCE_KEY, preference);
  } catch {
    // Stockage indisponible : le choix n'est pas retenu, l'apparence système reste appliquée.
  }
  sync();
}

/** Applique le thème courant et le met à jour quand l'apparence système change. */
export function installThemeVars() {
  sync();
  systemQuery().addEventListener('change', sync);
}
