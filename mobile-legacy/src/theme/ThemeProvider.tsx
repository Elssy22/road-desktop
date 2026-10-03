import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useColorSchemePreference } from './appearance';
import { makeTheme, type Theme } from './tokens';

const ThemeContext = createContext<Theme>(makeTheme('light'));

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorSchemePreference();
  const theme = useMemo(() => makeTheme(scheme), [scheme]);

  // Les en-têtes et la barre d'onglets d'Expo Router lisent ce thème-là.
  const navigationTheme = useMemo(() => {
    const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: theme.scheme === 'dark',
      colors: {
        ...base.colors,
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.text,
        border: theme.colors.border,
        notification: theme.colors.danger,
      },
    };
  }, [theme]);

  return (
    <ThemeContext.Provider value={theme}>
      <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
