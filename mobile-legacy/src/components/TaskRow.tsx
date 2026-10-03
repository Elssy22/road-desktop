import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Task } from '../db/localDb';
import { formatDueLabel, type DateKey } from '../lib/dates';
import { useTheme } from '../theme/ThemeProvider';

export const PRIORITY_LABELS = ['Normale', 'Haute', 'Urgente'] as const;

type Props = {
  task: Task;
  today: DateKey;
  onToggle: (task: Task) => void;
  /** Report en un geste : visible pour les tâches en retard ou du jour. */
  onPostpone: (task: Task) => void;
  /** Appui sur la ligne : menu (date, priorité, suppression). */
  onOpen: (task: Task) => void;
  /** Masque l'échéance quand elle est implicite (ex. section « Aujourd'hui »). */
  hideTodayLabel?: boolean;
  isLast?: boolean;
};

export function TaskRow({ task, today, onToggle, onPostpone, onOpen, hideTodayLabel, isLast }: Props) {
  const { colors, spacing, fontSize } = useTheme();

  const overdue = !task.done && task.due_date != null && task.due_date < today;
  const canPostpone = !task.done && task.due_date != null && task.due_date <= today;
  const showDue = task.due_date != null && !(hideTodayLabel && task.due_date === today);
  const priorityColor = task.priority === 2 ? colors.danger : colors.warning;

  return (
    <View
      style={[
        styles.row,
        {
          paddingVertical: spacing.md,
          paddingLeft: spacing.lg,
          paddingRight: spacing.sm,
          gap: spacing.md,
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Pressable
        onPress={() => onToggle(task)}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.done }}
        accessibilityLabel={task.title}
      >
        <Ionicons
          name={task.done ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={task.done ? colors.success : colors.textFaint}
        />
      </Pressable>

      <Pressable style={styles.main} onPress={() => onOpen(task)} accessibilityHint="Options de la tâche">
        <Text
          style={[
            { color: task.done ? colors.textFaint : colors.text, fontSize: fontSize.body },
            task.done && styles.done,
          ]}
        >
          {task.title}
        </Text>
        {(showDue || task.priority > 0) && !task.done && (
          <View style={[styles.meta, { gap: spacing.sm, marginTop: 2 }]}>
            {task.priority > 0 && (
              <View style={[styles.meta, { gap: 2 }]}>
                <Ionicons name="flag" size={12} color={priorityColor} />
                <Text style={{ color: priorityColor, fontSize: fontSize.caption }}>
                  {PRIORITY_LABELS[task.priority]}
                </Text>
              </View>
            )}
            {showDue && (
              <Text
                style={{ color: overdue ? colors.danger : colors.textMuted, fontSize: fontSize.caption }}
              >
                {formatDueLabel(task.due_date!, today)}
              </Text>
            )}
          </View>
        )}
      </Pressable>

      {canPostpone && (
        <Pressable
          onPress={() => onPostpone(task)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Reporter à demain"
          style={({ pressed }) => [styles.postpone, { opacity: pressed ? 0.5 : 1, padding: spacing.sm }]}
        >
          <Ionicons name="arrow-redo-outline" size={16} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: fontSize.caption }}>Demain</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center' },
  done: { textDecorationLine: 'line-through' },
  postpone: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
