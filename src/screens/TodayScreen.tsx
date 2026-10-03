import { AlarmClock, CalendarDays, Hourglass, Plus, SquareCheck, Star } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppointmentRow } from '../components/AppointmentRow';
import { KeyDateRow } from '../components/KeyDateRow';
import { QuickAddTask } from '../components/QuickAddTask';
import { ReminderRow } from '../components/ReminderRow';
import { useTaskActions } from '../components/TaskActions';
import { TaskRow } from '../components/TaskRow';
import { CardList, CardNote, CategoryCard, ErrorBanner, GradientButton, ScreenHeader, TextAction } from '../components/ui';
import { listAppointmentsBetween, type AppointmentWithContact } from '../data/appointments';
import { listKeyDatesBetween, type KeyDateWithContact } from '../data/keyDates';
import { listOpenRemindersUntil, setReminderDone, type ReminderWithLinks } from '../data/reminders';
import { useRemoteQuery } from '../data/useRemoteQuery';
import { useTasks } from '../data/useTasks';
import { loadDailyPriorities, saveDailyPriorities } from '../lib/dailyPriorities';
import { addDays, formatLongDateTitle, type DateKey } from '../lib/dates';
import { TODAY_ALERT_DAYS } from '../lib/keyDateAlerts';
import { tasksForToday } from '../lib/taskGroups';
import { useToday } from '../lib/useToday';

const NO_APPOINTMENTS: AppointmentWithContact[] = [];
const NO_KEY_DATES: KeyDateWithContact[] = [];
const NO_REMINDERS: ReminderWithLinks[] = [];

/**
 * Vue du jour : portage web de mobile-legacy/src/screens/TodayScreen.tsx.
 * Sur grand écran, l'agenda et les tâches occupent la colonne principale ;
 * priorités, échéances et rappels la colonne de droite.
 */
export function TodayScreen({ userId }: { userId: string }) {
  const today = useToday();
  const taskInput = useRef<HTMLInputElement>(null);

  // Action principale de l'écran : amène la carte des tâches en vue et ouvre la saisie.
  const newTask = () => {
    taskInput.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    taskInput.current?.focus({ preventScroll: true });
  };

  return (
    <div className="screen screen--wide">
      <ScreenHeader
        eyebrow="Aujourd'hui"
        title={formatLongDateTitle(today)}
        action={<GradientButton label="Nouvelle tâche" icon={Plus} onClick={newTask} />}
      />
      <div className="columns">
        <div className="columns__main">
          <TodayAppointments today={today} />
          <TodayTasks today={today} inputRef={taskInput} />
        </div>
        <div className="columns__side">
          {/* Remonté à chaque changement de jour : on repart d'une liste vierge. */}
          <DailyPriorities key={today} userId={userId} day={today} />
          <UpcomingKeyDates today={today} />
          <TodayReminders today={today} />
        </div>
      </div>
    </div>
  );
}

/**
 * Rendez-vous du jour, par heure : section à part parce qu'un RDV a un horaire
 * et ne se coche pas. Les RDV passés restent visibles, grisés.
 */
function TodayAppointments({ today }: { today: DateKey }) {
  const navigate = useNavigate();
  const load = useCallback(() => listAppointmentsBetween(today, today), [today]);
  const { data: appointments, error } = useRemoteQuery(load, NO_APPOINTMENTS);

  return (
    <CategoryCard
      category="agenda"
      icon={CalendarDays}
      title="Agenda du jour"
      count={appointments.length}
      action={
        <TextAction
          label="RDV"
          icon={Plus}
          category="agenda"
          title="Nouveau rendez-vous"
          onClick={() => navigate(`/appointments/new?date=${today}`)}
        />
      }
    >
      {error ? (
        <CardNote tone="danger">{error}</CardNote>
      ) : appointments.length > 0 ? (
        <CardList>
          {appointments.map((a) => (
            <AppointmentRow key={a.id} appointment={a} showDebrief />
          ))}
        </CardList>
      ) : (
        <CardNote>Aucun rendez-vous aujourd&apos;hui.</CardNote>
      )}
    </CategoryCard>
  );
}

function TodayTasks({ today, inputRef }: { today: DateKey; inputRef: RefObject<HTMLInputElement | null> }) {
  const tasksApi = useTasks();
  const { tasks, error, add, toggle, postponeToTomorrow } = tasksApi;
  const actions = useTaskActions(tasksApi);

  const list = useMemo(() => tasksForToday(tasks, today), [tasks, today]);
  const remaining = list.filter((t) => !t.done).length;

  return (
    <CategoryCard category="tasks" icon={SquareCheck} title="Tâches du jour" count={remaining}>
      <ErrorBanner message={error} />
      {list.length > 0 && (
        <CardList>
          {list.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              today={today}
              onToggle={toggle}
              onPostpone={postponeToTomorrow}
              onOpen={actions.open}
              hideTodayLabel
            />
          ))}
        </CardList>
      )}
      <QuickAddTask
        inputRef={inputRef}
        placeholder="Ajouter pour aujourd’hui"
        fixedDue={today}
        onAdd={(title, due) => void add(title, due)}
      />
      {actions.dialog}
    </CategoryCard>
  );
}

/** Échéances de l'échéancier à J-7 ou moins ; rien n'est affiché s'il n'y en a pas. */
function UpcomingKeyDates({ today }: { today: DateKey }) {
  const load = useCallback(() => listKeyDatesBetween(today, addDays(today, TODAY_ALERT_DAYS)), [today]);
  const { data: keyDates } = useRemoteQuery(load, NO_KEY_DATES);
  if (keyDates.length === 0) return null;

  return (
    <CategoryCard category="keyDates" icon={Hourglass} title="Échéances proches" count={keyDates.length}>
      <CardList>
        {keyDates.map((k) => (
          <KeyDateRow key={k.id} keyDate={k} today={today} />
        ))}
      </CardList>
    </CategoryCard>
  );
}

/** Rappels non faits du jour, et ceux des jours passés restés non faits. */
function TodayReminders({ today }: { today: DateKey }) {
  const navigate = useNavigate();
  const load = useCallback(() => listOpenRemindersUntil(today), [today]);
  const { data: reminders, error } = useRemoteQuery(load, NO_REMINDERS);
  const [writeError, setWriteError] = useState<string | null>(null);
  const toggle = (r: ReminderWithLinks) =>
    void setReminderDone(r, !r.done)
      .then(() => setWriteError(null))
      .catch((e: unknown) => setWriteError(e instanceof Error ? e.message : String(e)));

  return (
    <CategoryCard
      category="reminders"
      icon={AlarmClock}
      title="Rappels"
      count={reminders.length}
      action={
        <TextAction
          label="Rappel"
          icon={Plus}
          category="reminders"
          title="Nouveau rappel"
          onClick={() => navigate(`/reminders/new?date=${today}`)}
        />
      }
    >
      <ErrorBanner message={writeError ?? error} />
      {reminders.length > 0 ? (
        <CardList>
          {reminders.map((r) => (
            <ReminderRow key={r.id} reminder={r} today={today} onToggle={toggle} />
          ))}
        </CardList>
      ) : (
        <CardNote>Aucun rappel aujourd&apos;hui.</CardNote>
      )}
    </CategoryCard>
  );
}

function DailyPriorities({ userId, day }: { userId: string; day: DateKey }) {
  const [items, setItems] = useState(() => loadDailyPriorities(userId, day));

  const update = (index: number, text: string) => {
    const next = items.map((v, i) => (i === index ? text : v));
    setItems(next);
    saveDailyPriorities(userId, day, next);
  };

  return (
    <CategoryCard category="priorities" icon={Star} title="Priorités du jour">
      <CardList>
        {items.map((value, i) => {
          // La n° 1 porte la couleur du soleil : c'est elle qui compte.
          const first = i === 0;
          return (
            <li key={i} className="row priority">
              <span className={first ? 'priority__badge priority__badge--first' : 'priority__badge'}>{i + 1}</span>
              <input
                className={first && value ? 'priority__input priority__input--strong' : 'priority__input'}
                value={value}
                onChange={(e) => update(i, e.target.value)}
                placeholder={first ? 'La chose la plus importante aujourd’hui' : 'Priorité'}
                aria-label={`Priorité ${i + 1}`}
              />
            </li>
          );
        })}
      </CardList>
    </CategoryCard>
  );
}
