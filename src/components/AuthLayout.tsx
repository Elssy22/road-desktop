import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Panel, ScreenHeader } from './ui';

/**
 * Écrans d'authentification (connexion, nouveau mot de passe) : pas de catégorie
 * métier, donc l'identité globale (DECISIONS.md §28) : grand titre et tirets
 * soleil sur le fond doux, formulaire dans une carte blanche centrale.
 */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <ScrollView
      contentContainerStyle={[styles.container, { padding: spacing.xl }]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <ScreenHeader eyebrow="Road" title={title} />
      <Panel style={{ padding: spacing.xl, gap: spacing.md }}>{children}</Panel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center' },
});
