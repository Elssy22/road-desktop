import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatTimeOfDay, type ReminderWithLinks } from '../db/remindersDb';
import { formatDueLabel, toDateKey, type DateKey } from '../lib/dates';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Ligne d'un rappel : case « fait », heure (et jour s'il n'est pas `day`),
 * élément lié. Appui sur la ligne : modifier le rappel.
 */
export function ReminderRow({
  reminder,
  today,
  day = today,
  onToggle,
  isLast,
}: {
  reminder: ReminderWithLinks;
  today: DateKey;
  /** Jour affiché par la liste : le jour du rappel n'est indiqué que s'il diffère (null : toujours). */
  day?: DateKey | null;
  onToggle: (reminder: ReminderWithLinks) => void;
  isLast?: boolean;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const at = new Date(reminder.remind_at);
  const reminderDay = toDateKey(at);
  const late = !reminder.done && at < new Date();
  const when = reminderDay === day ? formatTimeOfDay(reminder.remind_at) : `${formatDueLabel(reminderDay, today)} · ${formatTimeOfDay(reminder.remind_at)}`;
  const link = reminder.task_title ? `Tâche : ${reminder.task_title}` : reminder.contact_name ? `Contact : ${reminder.contact_name}` : null;

  return (
    <View
      style={[
        styles.row,
        {
          paddingVertical: spacing.md,
          paddingLeft: spacing.lg,
          paddingRight: spacing.md,
          gap: spacing.md,
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Pressable
        onPress={() => onToggle(reminder)}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: reminder.done }}
        accessibilityLabel={reminder.title}
      >
        <Ionicons
          name={reminder.done ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={reminder.done ? colors.success : colors.textFaint}
        />
      </Pressable>
      <Pressable
        style={styles.main}
        onPress={() => router.push({ pathname: '/reminder-form', params: { id: reminder.id } })}
        accessibilityHint="Modifier le rappel"
      >
        <Text
          numberOfLines={2}
          style={[
            { color: reminder.done ? colors.textFaint : colors.text, fontSize: fontSize.body },
            reminder.done && styles.done,
          ]}
        >
          {reminder.title || 'Rappel'}
        </Text>
        <View style={[styles.row, { gap: spacing.xs, marginTop: 2 }]}>
          <Ionicons name="alarm-outline" size={12} color={late ? colors.danger : colors.textMuted} />
          <Text numberOfLines={1} style={{ flexShrink: 1, color: late ? colors.danger : colors.textMuted, fontSize: fontSize.caption }}>
            {link ? `${when} · ${link}` : when}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1 },
  done: { textDecorationLine: 'line-through' },
});
