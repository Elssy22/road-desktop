import type Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, type ComponentProps } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';

import { QuickAddTask } from '../components/QuickAddTask';
import { useTaskActions } from '../components/TaskActionsSheet';
import { TaskRow } from '../components/TaskRow';
import { CardNote, CardSectionFooter, CardSectionHeader, CardSectionItem, CategoryCard } from '../components/ui';
import { groupTasks, type TaskGroupKey } from '../lib/taskGroups';
import { useToday } from '../lib/useToday';
import { useFollowupAutomation } from '../sync/useFollowupAutomation';
import { useOfflineTasks } from '../sync/useOfflineTasks';
import { useTheme } from '../theme/ThemeProvider';

/** Chaque groupe est une carte pêche (catégorie Tâches), reconnaissable à son icône. */
const GROUP_ICONS: Record<TaskGroupKey, ComponentProps<typeof Ionicons>['name']> = {
  overdue: 'alert-circle-outline',
  today: 'today-outline',
  upcoming: 'calendar-outline',
  nodate: 'file-tray-outline',
  done: 'checkmark-done-outline',
};

export function TasksScreen({ userId }: { userId: string }) {
  const tasksApi = useOfflineTasks(userId);
  // Relance cochée ou déplacée ici : la suivante se programme tout de suite.
  useFollowupAutomation();
  const { tasks, syncing, syncNow, add, toggle, postponeToTomorrow } = tasksApi;
  const actions = useTaskActions(tasksApi);
  const today = useToday();
  const { colors, spacing, categories } = useTheme();
  const tint = categories.tasks;

  const sections = useMemo(() => groupTasks(tasks, today), [tasks, today]);

  return (
    <View style={styles.container}>
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <QuickAddTask onAdd={(title, due) => void add(title, due)} />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        refreshing={syncing}
        onRefresh={syncNow}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={{ marginTop: spacing.lg }}>
            <CategoryCard tint={tint} icon="checkbox-outline" title="Tâches">
              <CardNote>Aucune tâche. Ajoute la première ci-dessus.</CardNote>
            </CategoryCard>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <CardSectionHeader
            tint={tint}
            icon={GROUP_ICONS[section.key]}
            title={section.title}
            titleColor={section.key === 'overdue' ? colors.danger : undefined}
            count={section.data.length}
          />
        )}
        renderSectionFooter={() => <CardSectionFooter tint={tint} />}
        renderItem={({ item, index, section }) => {
          const last = index === section.data.length - 1;
          return (
            <CardSectionItem tint={tint} first={index === 0} last={last}>
              <TaskRow
                task={item}
                today={today}
                onToggle={toggle}
                onPostpone={postponeToTomorrow}
                onOpen={actions.open}
                hideTodayLabel={section.key === 'today'}
                isLast={last}
              />
            </CardSectionItem>
          );
        }}
      />
      {actions.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
