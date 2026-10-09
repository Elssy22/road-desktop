import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/** Ajout rapide d'un élément par son seul titre (même présentation que QuickAddTask). */
export function QuickAddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (title: string) => void }) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const [title, setTitle] = useState('');

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onAdd(t);
    setTitle('');
  };

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          gap: spacing.xs,
        },
      ]}
    >
      <Ionicons name="add" size={20} color={colors.textFaint} />
      <TextInput
        style={[styles.input, { color: colors.text, fontSize: fontSize.body }]}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={submit}
        submitBehavior="submit"
        returnKeyType="done"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, paddingVertical: 12 },
});
