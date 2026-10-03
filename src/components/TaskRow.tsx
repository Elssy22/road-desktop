import { CheckCircle2, Circle, Flag, Redo2 } from 'lucide-react';

import { PRIORITY_LABELS, type Task } from '../data/tasks';
import { formatDueLabel, type DateKey } from '../lib/dates';

type Props = {
  task: Task;
  today: DateKey;
  onToggle: (task: Task) => void;
  /** Report en un geste : visible pour les tâches en retard ou du jour. */
  onPostpone: (task: Task) => void;
  /** Clic sur la ligne : menu (date, priorité, suppression). */
  onOpen: (task: Task) => void;
  /** Masque l'échéance quand elle est implicite (ex. section « Aujourd'hui »). */
  hideTodayLabel?: boolean;
};

/** Portage web de mobile-legacy/src/components/TaskRow.tsx. */
export function TaskRow({ task, today, onToggle, onPostpone, onOpen, hideTodayLabel }: Props) {
  const overdue = !task.done && task.due_date != null && task.due_date < today;
  const canPostpone = !task.done && task.due_date != null && task.due_date <= today;
  const showDue = task.due_date != null && !(hideTodayLabel && task.due_date === today);
  const priorityColor = task.priority === 2 ? 'var(--color-danger)' : 'var(--color-warning)';

  return (
    <li className="row">
      <button
        type="button"
        className={task.done ? 'check check--done' : 'check'}
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.title}
        onClick={() => onToggle(task)}
      >
        {task.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
      </button>

      <button type="button" className="row__main row__button" onClick={() => onOpen(task)} title="Options de la tâche">
        <span className={task.done ? 'row__title row__title--done' : 'row__title'}>{task.title}</span>
        {(showDue || task.priority > 0) && !task.done && (
          <span className="row__meta">
            {task.priority > 0 && (
              <span className="row__meta-item" style={{ color: priorityColor }}>
                <Flag size={12} fill="currentColor" />
                {PRIORITY_LABELS[task.priority]}
              </span>
            )}
            {showDue && (
              <span className={overdue ? 'row__meta-item row__meta-item--danger' : 'row__meta-item'}>
                {formatDueLabel(task.due_date!, today)}
              </span>
            )}
          </span>
        )}
      </button>

      {canPostpone && (
        <button type="button" className="row__side-action" onClick={() => onPostpone(task)} title="Reporter à demain">
          <Redo2 size={16} />
          Demain
        </button>
      )}
    </li>
  );
}
