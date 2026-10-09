import { AlarmClock, CalendarDays, ChevronLeft, ChevronRight, Hourglass, Plus, SquareCheck } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppointmentRow } from '../components/AppointmentRow';
import { KeyDateRow } from '../components/KeyDateRow';
import { ReminderRow } from '../components/ReminderRow';
import { useTaskActions } from '../components/TaskActions';
import { TaskRow } from '../components/TaskRow';
import {
  CardList,
  CardNote,
  CategoryCard,
  ErrorBanner,
  Panel,
  ScreenHeader,
  SegmentedControl,
  TextAction,
} from '../components/ui';
import { listAppointmentsBetween, type AppointmentWithContact } from '../data/appointments';
import { listKeyDatesBetween, type KeyDateWithContact } from '../data/keyDates';
import { listRemindersBetween, setReminderDone, type ReminderWithLinks } from '../data/reminders';
import { useRemoteQuery } from '../data/useRemoteQuery';
import { useTasks } from '../data/useTasks';
import {
  addDays,
  formatLongDate,
  formatLongDateTitle,
  fromDateKey,
  MONTH_NAMES,
  startOfWeek,
  toDateKey,
  WEEKDAY_INITIALS,
  type DateKey,
} from '../lib/dates';
import { errorMessage } from '../lib/errors';
import { useToday } from '../lib/useToday';

type Mode = 'month' | 'week';
type Events = {
  appointments: AppointmentWithContact[];
  keyDates: KeyDateWithContact[];
  reminders: ReminderWithLinks[];
};
const NO_EVENTS: Events = { appointments: [], keyDates: [], reminders: [] };

const MODES = [
  { value: 'month', label: 'Mois' },
  { value: 'week', label: 'Semaine' },
] as const;

/** Jours affichés : grille du mois (cases vides avant le 1er / après le dernier) ou semaine du lundi. */
function visibleDays(mode: Mode, anchor: DateKey): (DateKey | null)[] {
  if (mode === 'week') {
    const monday = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }
  const a = fromDateKey(anchor);
  const first = new Date(a.getFullYear(), a.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate();
  const cells: (DateKey | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDateKey(new Date(a.getFullYear(), a.getMonth(), i + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftAnchor(mode: Mode, anchor: DateKey, delta: number): DateKey {
  if (mode === 'week') return addDays(anchor, 7 * delta);
  const a = fromDateKey(anchor);
  // Même jour du mois si possible (31 → dernier jour du mois visé).
  const target = new Date(a.getFullYear(), a.getMonth() + delta, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(a.getDate(), last));
  return toDateKey(target);
}

function periodTitle(mode: Mode, anchor: DateKey): string {
  if (mode === 'month') {
    const a = fromDateKey(anchor);
    const month = MONTH_NAMES[a.getMonth()];
    return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${a.getFullYear()}`;
  }
  const monday = fromDateKey(startOfWeek(anchor));
  const sunday = fromDateKey(addDays(startOfWeek(anchor), 6));
  return monday.getMonth() === sunday.getMonth()
    ? `${monday.getDate()} – ${sunday.getDate()} ${MONTH_NAMES[sunday.getMonth()]} ${sunday.getFullYear()}`
    : `${monday.getDate()} ${MONTH_NAMES[monday.getMonth()]} – ${sunday.getDate()} ${MONTH_NAMES[sunday.getMonth()]}`;
}

/** Chaque catégorie garde sa couleur partout : point de la grille, légende, carte du détail. */
const LEGEND = [
  ['agenda', 'Rendez-vous'],
  ['tasks', 'Tâches'],
  ['keyDates', 'Échéances clés'],
  ['reminders', 'Rappels'],
] as const;

const dot = (category: (typeof LEGEND)[number][0]) => <span className={`dot dot--${category}`} />;

/**
 * Calendrier mois / semaine : portage web de mobile-legacy/src/screens/CalendarScreen.tsx.
 * Points sur les jours ayant des rendez-vous, des tâches à échéance, des dates
 * clés ou des rappels ; le jour sélectionné détaille le tout. Sur grand écran,
 * la grille et le détail du jour sont côte à côte.
 */
export function CalendarScreen() {
  const navigate = useNavigate();
  const today = useToday();
  const [mode, setMode] = useState<Mode>('month');
  const [selected, setSelected] = useState<DateKey>(today);

  const days = useMemo(() => visibleDays(mode, selected), [mode, selected]);
  const realDays = days.filter((d): d is DateKey => d !== null);
  const from = realDays[0];
  const to = realDays[realDays.length - 1];

  const tasksApi = useTasks();
  const { tasks, toggle, postponeToTomorrow } = tasksApi;
  const actions = useTaskActions(tasksApi);

  const load = useCallback(async (): Promise<Events> => {
    const [appointments, keyDates, reminders] = await Promise.all([
      listAppointmentsBetween(from, to),
      listKeyDatesBetween(from, to),
      listRemindersBetween(from, to),
    ]);
    return { appointments, keyDates, reminders };
  }, [from, to]);
  const { data: events, error: eventsError } = useRemoteQuery(load, NO_EVENTS);
  const [writeError, setWriteError] = useState<string | null>(null);

  // Indicateurs par jour : rendez-vous, tâches non faites, dates clés, rappels non faits.
  const marks = useMemo(() => {
    const m = new Map<DateKey, { agenda: boolean; tasks: boolean; keyDates: boolean; reminders: boolean }>();
    const get = (k: DateKey) => {
      let v = m.get(k);
      if (!v) m.set(k, (v = { agenda: false, tasks: false, keyDates: false, reminders: false }));
      return v;
    };
    for (const a of events.appointments) get(toDateKey(new Date(a.start_at))).agenda = true;
    for (const t of tasks)
      if (t.due_date && !t.done && t.due_date >= from && t.due_date <= to) get(t.due_date).tasks = true;
    for (const k of events.keyDates) get(k.date).keyDates = true;
    for (const r of events.reminders) if (!r.done) get(toDateKey(new Date(r.remind_at))).reminders = true;
    return m;
  }, [tasks, events, from, to]);

  const dayAppointments = events.appointments.filter((a) => toDateKey(new Date(a.start_at)) === selected);
  const dayTasks = tasks.filter((t) => t.due_date === selected);
  const dayKeyDates = events.keyDates.filter((k) => k.date === selected);
  const dayReminders = events.reminders.filter((r) => toDateKey(new Date(r.remind_at)) === selected);
  const toggleReminder = (r: ReminderWithLinks) =>
    void setReminderDone(r, !r.done)
      .then(() => setWriteError(null))
      .catch((e: unknown) => setWriteError(errorMessage(e)));
  const empty = dayAppointments.length + dayTasks.length + dayKeyDates.length + dayReminders.length === 0;

  const arrow = (delta: -1 | 1) => {
    const label =
      mode === 'month'
        ? delta < 0
          ? 'Mois précédent'
          : 'Mois suivant'
        : delta < 0
          ? 'Semaine précédente'
          : 'Semaine suivante';
    return (
      <button
        type="button"
        className="icon-button icon-button--round"
        onClick={() => setSelected((s) => shiftAnchor(mode, s, delta))}
        aria-label={label}
        title={label}
      >
        {delta < 0 ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
      </button>
    );
  };

  return (
    <div className="screen screen--wide">
      <ScreenHeader title="Calendrier" />
      <ErrorBanner message={writeError ?? eventsError ?? tasksApi.error} />
      <div className="columns">
        <div className="columns__main">
          <div className="toolbar">
            <SegmentedControl options={MODES} value={mode} onChange={setMode} />
            {/* Toujours présent (estompé sur aujourd'hui) : le contrôle ne change pas de largeur. */}
            <TextAction label="Aujourd'hui" disabled={selected === today} onClick={() => setSelected(today)} />
          </div>

          <Panel className="panel-card--padded">
            <div className="period">
              {arrow(-1)}
              <h2 className="period__title">{periodTitle(mode, selected)}</h2>
              {arrow(1)}
            </div>

            <div className="calendar-grid">
              {WEEKDAY_INITIALS.map((d, i) => (
                <span key={`h${i}`} className="calendar-grid__weekday">
                  {d}
                </span>
              ))}
              {days.map((key, i) => {
                if (!key) return <span key={`e${i}`} />;
                const mark = marks.get(key);
                const kinds = [
                  mark?.agenda && 'rendez-vous',
                  mark?.tasks && 'tâches',
                  mark?.keyDates && 'échéances',
                  mark?.reminders && 'rappels',
                ].filter(Boolean);
                // Sélection en dégradé soleil, aujourd'hui sur fond teinté, jours passés estompés.
                const state = key === selected ? 'selected' : key === today ? 'today' : key < today ? 'past' : 'future';
                return (
                  <button
                    key={key}
                    type="button"
                    className="calendar-day"
                    onClick={() => setSelected(key)}
                    aria-pressed={key === selected}
                    aria-label={`${formatLongDate(key)}${kinds.length ? ` : ${kinds.join(', ')}` : ''}`}
                  >
                    <span className={`calendar-day__number calendar-day__number--${state}`}>
                      {fromDateKey(key).getDate()}
                    </span>
                    <span className="calendar-day__dots">
                      {mark?.agenda && dot('agenda')}
                      {mark?.tasks && dot('tasks')}
                      {mark?.keyDates && dot('keyDates')}
                      {mark?.reminders && dot('reminders')}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Légende dans la carte, sous un filet : elle se lit avec la grille. */}
            <div className="legend">
              {LEGEND.map(([c, l]) => (
                <span key={l} className="legend__item">
                  {dot(c)}
                  {l}
                </span>
              ))}
            </div>
          </Panel>
        </div>

        {/* Détail du jour : une carte par catégorie, de la couleur de son point dans la grille. */}
        <div className="columns__side">
          <div className="day-header">
            <h2 className="day-title">{formatLongDateTitle(selected)}</h2>
            <TextAction
              label="RDV"
              icon={Plus}
              category="agenda"
              title="Nouveau rendez-vous ce jour"
              onClick={() => navigate(`/appointments/new?date=${selected}`)}
            />
            <TextAction
              label="Rappel"
              icon={Plus}
              category="reminders"
              title="Nouveau rappel ce jour"
              onClick={() => navigate(`/reminders/new?date=${selected}`)}
            />
          </div>
          {empty && (
            <Panel className="panel-card--padded">
              <CardNote>Rien de prévu ce jour-là.</CardNote>
            </Panel>
          )}
          {dayAppointments.length > 0 && (
            <CategoryCard category="agenda" icon={CalendarDays} title="Rendez-vous" count={dayAppointments.length}>
              <CardList>
                {dayAppointments.map((a) => (
                  <AppointmentRow key={a.id} appointment={a} />
                ))}
              </CardList>
            </CategoryCard>
          )}
          {dayTasks.length > 0 && (
            <CategoryCard
              category="tasks"
              icon={SquareCheck}
              title="Tâches"
              count={dayTasks.filter((t) => !t.done).length}
            >
              <CardList>
                {dayTasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    today={today}
                    onToggle={toggle}
                    onPostpone={postponeToTomorrow}
                    onOpen={actions.open}
                  />
                ))}
              </CardList>
            </CategoryCard>
          )}
          {dayKeyDates.length > 0 && (
            <CategoryCard category="keyDates" icon={Hourglass} title="Échéances clés" count={dayKeyDates.length}>
              <CardList>
                {dayKeyDates.map((k) => (
                  <KeyDateRow key={k.id} keyDate={k} today={today} />
                ))}
              </CardList>
            </CategoryCard>
          )}
          {dayReminders.length > 0 && (
            <CategoryCard
              category="reminders"
              icon={AlarmClock}
              title="Rappels"
              count={dayReminders.filter((r) => !r.done).length}
            >
              <CardList>
                {dayReminders.map((r) => (
                  <ReminderRow key={r.id} reminder={r} today={today} day={selected} onToggle={toggleReminder} />
                ))}
              </CardList>
            </CategoryCard>
          )}
        </div>
      </div>
      {actions.dialog}
    </div>
  );
}
