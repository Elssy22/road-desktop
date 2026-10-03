import { AlarmClock, CheckCircle2, Circle } from 'lucide-react';

import { formatTimeOfDay, type ReminderWithLinks } from '../data/reminders';
import { formatDueLabel, toDateKey, type DateKey } from '../lib/dates';

/**
 * Ligne d'un rappel : case « fait », heure (et jour s'il n'est pas `day`),
 * élément lié. Portage web de mobile-legacy/src/components/ReminderRow.tsx ;
 * la modification du rappel arrivera avec son formulaire.
 */
export function ReminderRow({
  reminder,
  today,
  day = today,
  onToggle,
}: {
  reminder: ReminderWithLinks;
  today: DateKey;
  /** Jour affiché par la liste : le jour du rappel n'est indiqué que s'il diffère. */
  day?: DateKey;
  onToggle: (reminder: ReminderWithLinks) => void;
}) {
  const at = new Date(reminder.remind_at);
  const reminderDay = toDateKey(at);
  const late = !reminder.done && at < new Date();
  const time = formatTimeOfDay(reminder.remind_at);
  const when = reminderDay === day ? time : `${formatDueLabel(reminderDay, today)} · ${time}`;
  const link = reminder.task_title
    ? `Tâche : ${reminder.task_title}`
    : reminder.contact_name
      ? `Contact : ${reminder.contact_name}`
      : null;

  return (
    <li className="row">
      <button
        type="button"
        className={reminder.done ? 'check check--done' : 'check'}
        role="checkbox"
        aria-checked={reminder.done}
        aria-label={reminder.title}
        onClick={() => onToggle(reminder)}
      >
        {reminder.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
      </button>
      <div className="row__main">
        <span className={reminder.done ? 'row__title row__title--done' : 'row__title'}>{reminder.title || 'Rappel'}</span>
        <span className="row__meta">
          <span className={late ? 'row__meta-item row__meta-item--danger' : 'row__meta-item'}>
            <AlarmClock size={12} />
            {link ? `${when} · ${link}` : when}
          </span>
        </span>
      </div>
    </li>
  );
}
