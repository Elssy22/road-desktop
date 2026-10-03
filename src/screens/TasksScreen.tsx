import { CalendarDays, CircleAlert, Inbox, ListChecks, SquareCheck, Sun, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';

import { QuickAddTask } from '../components/QuickAddTask';
import { useTaskActions } from '../components/TaskActions';
import { TaskRow } from '../components/TaskRow';
import { CardList, CardNote, CategoryCard, ErrorBanner, ScreenHeader } from '../components/ui';
import { useTasks } from '../data/useTasks';
import { groupTasks, type TaskGroupKey } from '../lib/taskGroups';
import { useToday } from '../lib/useToday';

/** Chaque groupe est une carte pêche (catégorie Tâches), reconnaissable à son icône. */
const GROUP_ICONS: Record<TaskGroupKey, LucideIcon> = {
  overdue: CircleAlert,
  today: Sun,
  upcoming: CalendarDays,
  nodate: Inbox,
  done: ListChecks,
};

/** Liste des tâches par groupe : portage web de mobile-legacy/src/screens/TasksScreen.tsx. */
export function TasksScreen() {
  const tasksApi = useTasks();
  const { tasks, loading, error, add, toggle, postponeToTomorrow } = tasksApi;
  const actions = useTaskActions(tasksApi);
  const today = useToday();

  const sections = useMemo(() => groupTasks(tasks, today), [tasks, today]);

  return (
    <div className="screen">
      <ScreenHeader title="Tâches" />
      <ErrorBanner message={error} />
      <div className="stack">
        <QuickAddTask onAdd={(title, due) => void add(title, due)} />

        {sections.length === 0 && !loading && (
          <CategoryCard category="tasks" icon={SquareCheck} title="Tâches">
            <CardNote>Aucune tâche. Ajoute la première ci-dessus.</CardNote>
          </CategoryCard>
        )}

        {sections.map((section) => (
          <CategoryCard
            key={section.key}
            category="tasks"
            icon={GROUP_ICONS[section.key]}
            title={section.title}
            danger={section.key === 'overdue'}
            count={section.data.length}
          >
            <CardList>
              {section.data.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  today={today}
                  onToggle={toggle}
                  onPostpone={postponeToTomorrow}
                  onOpen={actions.open}
                  hideTodayLabel={section.key === 'today'}
                />
              ))}
            </CardList>
          </CategoryCard>
        ))}
      </div>
      {actions.dialog}
    </div>
  );
}
