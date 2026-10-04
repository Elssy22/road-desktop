import { AlarmClock, Flag, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PRIORITY_LABELS, type Task, type TaskPriority } from '../data/tasks';
import type { TasksApi } from '../data/useTasks';
import { Dialog, useConfirm } from './Dialog';

type Actions = Pick<TasksApi, 'setDueDate' | 'setPriority' | 'remove'>;

/**
 * Menu d'une tâche : échéance, priorité, rappel, suppression (confirmée, comme
 * toutes les suppressions de l'app). Portage web de
 * mobile-legacy/src/components/TaskActionsSheet.tsx (la feuille du bas devient
 * une boîte de dialogue).
 */
export function useTaskActions(actions: Actions) {
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [task, setTask] = useState<Task | null>(null);
  const close = () => setTask(null);

  const dialog = (
    <>
      {task && (
        <TaskActionsDialog
          task={task}
          onClose={close}
          onSetDate={(d) => {
            void actions.setDueDate(task, d);
            close();
          }}
          onSetPriority={(p) => {
            void actions.setPriority(task, p);
            close();
          }}
          onRemind={() => {
            close();
            navigate(`/reminders/new?task=${task.id}`);
          }}
          onRemove={() => {
            close();
            confirm({
              title: 'Supprimer la tâche ?',
              message: task.title,
              confirmLabel: 'Supprimer',
              danger: true,
              onConfirm: () => void actions.remove(task),
            });
          }}
        />
      )}
      {confirmDialog}
    </>
  );

  return { open: setTask, dialog };
}

function TaskActionsDialog({
  task,
  onClose,
  onSetDate,
  onSetPriority,
  onRemind,
  onRemove,
}: {
  task: Task;
  onClose: () => void;
  onSetDate: (date: string | null) => void;
  onSetPriority: (p: TaskPriority) => void;
  onRemind: () => void;
  onRemove: () => void;
}) {
  const [due, setDue] = useState(task.due_date ?? '');

  return (
    <Dialog title={task.title} onClose={onClose}>
      <div className="dialog__field">
        <span className="dialog__label">Échéance</span>
        <span className="dialog__inline">
          {/* Validation explicite : WebKit émet un changement à chaque segment saisi au clavier. */}
          <input type="date" className="field" aria-label="Échéance" value={due} onChange={(e) => setDue(e.target.value)} />
          <button
            type="button"
            className="text-action"
            disabled={!due || due === task.due_date}
            onClick={() => onSetDate(due)}
          >
            Enregistrer
          </button>
          {task.due_date && (
            <button type="button" className="text-action" onClick={() => onSetDate(null)}>
              Retirer
            </button>
          )}
        </span>
      </div>

      <div className="dialog__options">
        {([2, 1, 0] as const).map((p) => (
          <button
            key={p}
            type="button"
            className={task.priority === p ? 'dialog__option dialog__option--selected' : 'dialog__option'}
            onClick={() => onSetPriority(p)}
          >
            <Flag
              size={18}
              color={p === 2 ? 'var(--color-danger)' : p === 1 ? 'var(--color-warning)' : 'var(--color-text-muted)'}
              fill={p === 0 ? 'none' : 'currentColor'}
            />
            Priorité {PRIORITY_LABELS[p].toLowerCase()}
          </button>
        ))}
        <button type="button" className="dialog__option" onClick={onRemind}>
          <AlarmClock size={18} />
          Créer un rappel
        </button>
        <button type="button" className="dialog__option dialog__option--danger" onClick={onRemove}>
          <Trash2 size={18} />
          Supprimer
        </button>
      </div>
    </Dialog>
  );
}
