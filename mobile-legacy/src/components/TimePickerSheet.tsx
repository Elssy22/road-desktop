import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Sheet } from './Sheet';
import { Button, Chip, ChipRow } from './ui';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = [0, 15, 30, 45];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Choix d'une heure : grille des heures + quarts d'heure, en pur JS comme
 * DatePickerSheet (pas de module natif de sélection d'heure).
 */
export function TimePickerSheet({
  visible,
  hour,
  minute,
  onChange,
  onClose,
  title = 'Heure',
}: {
  visible: boolean;
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
  onClose: () => void;
  title?: string;
}) {
  const { colors, spacing, radius, fontSize } = useTheme();
  // Une minute « hors quart » (rappel créé ailleurs) reste proposée.
  const minutes = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort((a, b) => a - b);

  return (
    <Sheet visible={visible} onClose={onClose} title={`${title} · ${pad(hour)}:${pad(minute)}`}>
      <View style={[styles.grid, { marginBottom: spacing.lg }]}>
        {HOURS.map((h) => {
          const selected = h === hour;
          return (
            <Pressable
              key={h}
              onPress={() => onChange(h, minute)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${h} heures`}
              style={styles.cell}
            >
              <View
                style={[
                  styles.hour,
                  { borderRadius: radius.md },
                  selected && { backgroundColor: colors.primary },
                ]}
              >
                <Text style={{ color: selected ? colors.onPrimary : colors.text, fontSize: fontSize.body }}>
                  {pad(h)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <ChipRow>
        {minutes.map((m) => (
          <Chip key={m} label={`:${pad(m)}`} selected={m === minute} onPress={() => onChange(hour, m)} />
        ))}
      </ChipRow>
      <View style={{ marginTop: spacing.lg }}>
        <Button label="OK" onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 6}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  hour: { width: 48, height: 36, alignItems: 'center', justifyContent: 'center' },
});
