import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';

import type { Task, TaskPriority } from '../db/localDb';
import { formatDueLabel } from '../lib/dates';
import type { OfflineTasks } from '../sync/useOfflineTasks';
import { useTheme } from '../theme/ThemeProvider';
import { DatePickerBody } from './DatePickerSheet';
import { Sheet, SheetOption } from './Sheet';
import { PRIORITY_LABELS } from './TaskRow';

type Actions = Pick<OfflineTasks, 'setDueDate' | 'setPriority' | 'remove'>;

/** Menu d'une tâche : échéance, priorité, rappel, suppression. */
export function useTaskActions(actions: Actions) {
  const [task, setTask] = useState<Task | null>(null);
  const [mode, setMode] = useState<'menu' | 'date'>('menu');

  const open = (t: Task) => {
    setMode('menu');
    setTask(t);
  };
  const close = () => setTask(null);

  const sheet = (
    <TaskActionsSheet
      task={task}
      mode={mode}
      onClose={close}
      onPickDate={() => setMode('date')}
      onSetDate={(d) => {
        if (task) void actions.setDueDate(task, d);
        close();
      }}
      onSetPriority={(p) => {
        if (task) void actions.setPriority(task, p);
        close();
      }}
      onRemove={() => {
        if (task) void actions.remove(task);
        close();
      }}
    />
  );

  return { open, sheet };
}

function TaskActionsSheet({
  task,
  mode,
  onClose,
  onPickDate,
  onSetDate,
  onSetPriority,
  onRemove,
}: {
  task: Task | null;
  mode: 'menu' | 'date';
  onClose: () => void;
  onPickDate: () => void;
  onSetDate: (date: string | null) => void;
  onSetPriority: (p: TaskPriority) => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  const icon = (name: ComponentProps<typeof Ionicons>['name'], color = colors.textMuted) => (
    <Ionicons name={name} size={20} color={color} />
  );

  return (
    <Sheet visible={task != null} onClose={onClose} title={task?.title}>
      {task && mode === 'menu' && (
        <>
          <SheetOption
            label={task.due_date ? `Échéance : ${formatDueLabel(task.due_date)}` : 'Ajouter une échéance'}
            icon={icon('calendar-outline')}
            onPress={onPickDate}
          />
          {([2, 1, 0] as const).map((p) => (
            <SheetOption
              key={p}
              label={`Priorité ${PRIORITY_LABELS[p].toLowerCase()}`}
              icon={icon(
                p === 0 ? 'flag-outline' : 'flag',
                p === 2 ? colors.danger : p === 1 ? colors.warning : colors.textMuted
              )}
              selected={task.priority === p}
              onPress={() => onSetPriority(p)}
            />
          ))}
          <SheetOption
            label="Créer un rappel"
            icon={icon('alarm-outline')}
            onPress={() => {
              onClose();
              router.push({ pathname: '/reminder-form', params: { taskId: task.id } });
            }}
          />
          <SheetOption
            label="Supprimer"
            icon={icon('trash-outline', colors.danger)}
            destructive
            onPress={onRemove}
          />
        </>
      )}
      {task && mode === 'date' && <DatePickerBody value={task.due_date} onSelect={onSetDate} />}
    </Sheet>
  );
}
