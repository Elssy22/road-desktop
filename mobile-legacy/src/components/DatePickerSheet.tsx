import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  addDays,
  fromDateKey,
  MONTH_NAMES,
  toDateKey,
  todayKey,
  WEEKDAY_INITIALS,
  type DateKey,
} from '../lib/dates';
import { useTheme } from '../theme/ThemeProvider';
import { Sheet } from './Sheet';

/**
 * Choix d'une échéance : raccourcis + mini-calendrier mensuel, en pur JS
 * (pas de module natif : fonctionne dans Expo Go et sur macOS plus tard).
 */
export function DatePickerSheet({
  visible,
  value,
  onSelect,
  onClose,
  title = 'Échéance',
  allowNone = true,
}: {
  visible: boolean;
  value: DateKey | null;
  onSelect: (date: DateKey | null) => void;
  onClose: () => void;
  title?: string;
  /** Propose « Sans date » (à désactiver quand la date est obligatoire). */
  allowNone?: boolean;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {/* Remonté à chaque ouverture pour repartir du mois de la valeur courante. */}
      {visible && <DatePickerBody value={value} onSelect={onSelect} allowNone={allowNone} />}
    </Sheet>
  );
}

export function DatePickerBody({
  value,
  onSelect,
  allowNone = true,
}: {
  value: DateKey | null;
  onSelect: (date: DateKey | null) => void;
  allowNone?: boolean;
}) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const today = todayKey();
  const initial = fromDateKey(value ?? today);
  const [month, setMonth] = useState({ y: initial.getFullYear(), m: initial.getMonth() });

  const shortcuts: { label: string; date: DateKey | null }[] = [
    { label: "Aujourd'hui", date: today },
    { label: 'Demain', date: addDays(today, 1) },
    { label: 'Dans 1 semaine', date: addDays(today, 7) },
    ...(allowNone ? [{ label: 'Sans date', date: null }] : []),
  ];

  const shiftMonth = (delta: number) =>
    setMonth(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  // Grille commençant le lundi.
  const first = new Date(month.y, month.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const cells: (DateKey | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDateKey(new Date(month.y, month.m, i + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View>
      <View style={[styles.chips, { gap: spacing.sm, marginBottom: spacing.lg }]}>
        {shortcuts.map((s) => {
          const selected = s.date === value;
          return (
            <Pressable
              key={s.label}
              onPress={() => onSelect(s.date)}
              style={{
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.primary : colors.surfaceMuted,
              }}
            >
              <Text
                style={{ color: selected ? colors.onPrimary : colors.text, fontSize: fontSize.small }}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.monthRow, { marginBottom: spacing.sm }]}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={12} accessibilityLabel="Mois précédent">
          <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
        </Pressable>
        <Text style={{ color: colors.text, fontSize: fontSize.body, fontWeight: '600' }}>
          {MONTH_NAMES[month.m]} {month.y}
        </Text>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={12} accessibilityLabel="Mois suivant">
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.grid}>
        {WEEKDAY_INITIALS.map((d, i) => (
          <Text
            key={`h${i}`}
            style={[styles.cell, styles.cellText, { color: colors.textFaint, fontSize: fontSize.caption }]}
          >
            {d}
          </Text>
        ))}
        {cells.map((key, i) => {
          if (!key) return <View key={`e${i}`} style={styles.cell} />;
          const selected = key === value;
          const isToday = key === today;
          return (
            <Pressable
              key={key}
              onPress={() => onSelect(key)}
              style={styles.cell}
              accessibilityLabel={key}
            >
              <View
                style={[
                  styles.day,
                  selected && { backgroundColor: colors.primary },
                  !selected && isToday && { borderWidth: 1, borderColor: colors.primary },
                ]}
              >
                <Text
                  style={{
                    color: selected ? colors.onPrimary : key < today ? colors.textFaint : colors.text,
                    fontSize: fontSize.small,
                  }}
                >
                  {fromDateKey(key).getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center' },
  cellText: { textAlign: 'center', textAlignVertical: 'center' },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
