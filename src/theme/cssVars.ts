import { makeTheme, type ColorScheme } from './tokens';

// Les jetons de tokens.ts (source unique partagée avec le mobile) deviennent des
// variables CSS sur <html> : --color-primary, --space-lg, --radius-card…
// Le mode suit l'apparence de macOS, comme le réglage « Système » du mobile.

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function applyTheme(scheme: ColorScheme) {
  const theme = makeTheme(scheme);
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(theme.colors)) {
    if (typeof value === 'string') root.setProperty(`--color-${kebab(name)}`, value);
  }
  for (const [name, value] of Object.entries(theme.spacing)) root.setProperty(`--space-${name}`, `${value}px`);
  for (const [name, value] of Object.entries(theme.radius)) root.setProperty(`--radius-${name}`, `${value}px`);
  root.setProperty('--shadow-card', theme.shadows.card);
  root.setProperty('--shadow-raised', theme.shadows.raised);
  root.setProperty('--sunset-gradient', theme.sunsetGradient);
  root.colorScheme = scheme;
}

/** Applique le thème courant et le met à jour quand l'apparence système change. */
export function installThemeVars() {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const sync = () => applyTheme(query.matches ? 'dark' : 'light');
  sync();
  query.addEventListener('change', sync);
}
