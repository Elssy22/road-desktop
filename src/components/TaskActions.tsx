import { Flag, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { PRIORITY_LABELS, type Task, type TaskPriority } from '../data/tasks';
import type { TasksApi } from '../data/useTasks';

type Actions = Pick<TasksApi, 'setDueDate' | 'setPriority' | 'remove'>;

/**
 * Menu d'une tâche : échéance, priorité, suppression. Portage web de
 * mobile-legacy/src/components/TaskActionsSheet.tsx (la feuille du bas devient
 * une boîte de dialogue). « Créer un rappel » arrivera avec le formulaire de rappel.
 */
export function useTaskActions(actions: Actions) {
  const [task, setTask] = useState<Task | null>(null);
  const close = () => setTask(null);

  const dialog = task && (
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
      onRemove={() => {
        void actions.remove(task);
        close();
      }}
    />
  );

  return { open: setTask, dialog };
}

function TaskActionsDialog({
  task,
  onClose,
  onSetDate,
  onSetPriority,
  onRemove,
}: {
  task: Task;
  onClose: () => void;
  onSetDate: (date: string | null) => void;
  onSetPriority: (p: TaskPriority) => void;
  onRemove: () => void;
}) {
  const [due, setDue] = useState(task.due_date ?? '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={task.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog__header">
          <h2 className="dialog__title">{task.title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

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
          <button type="button" className="dialog__option dialog__option--danger" onClick={onRemove}>
            <Trash2 size={18} />
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
