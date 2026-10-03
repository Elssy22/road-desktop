import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Field, GradientButton } from './ui';

/** Recherche + bouton d'ajout en dégradé en tête de liste (même présentation que les notes). */
export function ListToolbar({
  query,
  onQueryChange,
  placeholder,
  onAdd,
  addText,
  addLabel,
  below,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  placeholder: string;
  onAdd: () => void;
  /** Texte court du bouton (« Contact »), précédé d'un « + ». */
  addText: string;
  /** Libellé d'accessibilité (« Nouveau contact »). */
  addLabel: string;
  /** Contenu sous la barre (filtres). */
  below?: ReactNode;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ padding: spacing.lg, paddingBottom: 0, gap: spacing.md }}>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <Field
          value={query}
          onChangeText={onQueryChange}
          placeholder={placeholder}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          style={styles.search}
        />
        <GradientButton label={addText} icon="add" accessibilityLabel={addLabel} onPress={onAdd} />
      </View>
      {below}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  search: { flex: 1 },
});
