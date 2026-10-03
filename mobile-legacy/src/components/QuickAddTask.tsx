import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatDueLabel, type DateKey } from '../lib/dates';
import { useTheme } from '../theme/ThemeProvider';
import { DatePickerSheet } from './DatePickerSheet';

/**
 * Création rapide : titre + échéance optionnelle. Avec `fixedDue`, la date est
 * imposée (ex. vue du jour) et le sélecteur n'est pas proposé.
 */
export function QuickAddTask({
  onAdd,
  placeholder = 'Nouvelle tâche',
  fixedDue,
  inputRef,
}: {
  onAdd: (title: string, due: DateKey | null) => void;
  placeholder?: string;
  fixedDue?: DateKey;
  /** Pour donner le focus au champ depuis un bouton de l'écran (« Nouvelle tâche »). */
  inputRef?: Ref<TextInput>;
}) {
  const { colors, spacing, radius, fontSize, sunsetGradient } = useTheme();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<DateKey | null>(null);
  const [picking, setPicking] = useState(false);

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onAdd(t, fixedDue ?? due);
    setTitle('');
    setDue(null);
  };

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.lg,
          paddingLeft: spacing.md,
          paddingRight: spacing.xs,
          gap: spacing.xs,
        },
      ]}
    >
      <Ionicons name="add" size={20} color={colors.textFaint} />
      <TextInput
        ref={inputRef}
        style={[styles.input, { color: colors.text, fontSize: fontSize.body }]}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={submit}
        submitBehavior="submit"
        returnKeyType="done"
      />
      {!fixedDue && (
        <Pressable
          onPress={() => setPicking(true)}
          hitSlop={6}
          accessibilityLabel="Choisir une échéance"
          style={[
            styles.dateButton,
            {
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
              borderRadius: radius.pill,
              backgroundColor: due ? colors.surfaceMuted : 'transparent',
            },
          ]}
        >
          <Ionicons name="calendar-outline" size={18} color={due ? colors.primary : colors.textMuted} />
          {due && (
            <Text style={{ color: colors.primary, fontSize: fontSize.caption }}>
              {formatDueLabel(due)}
            </Text>
          )}
        </Pressable>
      )}
      {title.trim().length > 0 && (
        // Action principale : pastille en dégradé soleil couchant (DECISIONS.md §26).
        <Pressable
          onPress={submit}
          hitSlop={6}
          accessibilityLabel="Ajouter"
          style={({ pressed }) => [
            styles.submit,
            {
              margin: spacing.xs,
              backgroundColor: colors.primary,
              experimental_backgroundImage: sunsetGradient,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Ionicons name="arrow-up" size={18} color={colors.onGradient} />
        </Pressable>
      )}
      <DatePickerSheet
        visible={picking}
        value={due}
        onClose={() => setPicking(false)}
        onSelect={(d) => {
          setDue(d);
          setPicking(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  input: { flex: 1, paddingVertical: 12 },
  dateButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  submit: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
