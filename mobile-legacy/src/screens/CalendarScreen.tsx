import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppointmentRow } from '../components/AppointmentRow';
import { ReminderRow } from '../components/ReminderRow';
import { useTaskActions } from '../components/TaskActionsSheet';
import { TaskRow } from '../components/TaskRow';
import { CardList, CardNote, CategoryCard, Panel, SegmentedControl, TextAction } from '../components/ui';
import { listAppointmentsBetween, type AppointmentWithContact } from '../db/appointmentsDb';
import { updateRow } from '../db/entityTable';
import { listKeyDatesBetween, type KeyDateWithContact } from '../db/keyDatesDb';
import { listRemindersBetween, REMINDERS, type Reminder, type ReminderWithLinks } from '../db/remindersDb';
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
import { useToday } from '../lib/useToday';
import { useLocalQuery } from '../sync/useLocalQuery';
import { useOfflineTasks } from '../sync/useOfflineTasks';
import { useSync } from '../sync/SyncProvider';
import { useTheme } from '../theme/ThemeProvider';
import { KeyDateRow } from './agency/KeyDatesScreen';

type Mode = 'month' | 'week';
type Events = {
  appointments: AppointmentWithContact[];
  keyDates: KeyDateWithContact[];
  reminders: ReminderWithLinks[];
};
const NO_EVENTS: Events = { appointments: [], keyDates: [], reminders: [] };

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

/**
 * Calendrier mois / semaine (JS pur, même grille que DatePickerSheet) : points
 * sur les jours ayant des rendez-vous, des tâches à échéance, des dates clés ou des rappels ;
 * le jour sélectionné détaille le tout, chaque élément ouvre sa fiche / son menu.
 */
export function CalendarScreen({ userId }: { userId: string }) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const today = useToday();
  const { colors, spacing, fontSize, typography, categories, sunsetGradient } = useTheme();
  const [mode, setMode] = useState<Mode>('month');
  const [selected, setSelected] = useState<DateKey>(today);

  const days = useMemo(() => visibleDays(mode, selected), [mode, selected]);
  const realDays = days.filter((d): d is DateKey => d !== null);
  const from = realDays[0];
  const to = realDays[realDays.length - 1];

  const tasksApi = useOfflineTasks(userId);
  const { tasks, toggle, postponeToTomorrow } = tasksApi;
  const actions = useTaskActions(tasksApi);

  const load = useCallback(
    async (d: SQLiteDatabase): Promise<Events> => ({
      appointments: await listAppointmentsBetween(d, userId, from, to),
      keyDates: await listKeyDatesBetween(d, userId, from, to),
      reminders: await listRemindersBetween(d, userId, from, to),
    }),
    [userId, from, to]
  );
  const { data: events } = useLocalQuery(load, NO_EVENTS);

  // Indicateurs par jour : rendez-vous, tâches non faites, dates clés, rappels non faits.
  const marks = useMemo(() => {
    const m = new Map<DateKey, { appointment: boolean; task: boolean; keyDate: boolean; reminder: boolean }>();
    const get = (k: DateKey) => {
      let v = m.get(k);
      if (!v) m.set(k, (v = { appointment: false, task: false, keyDate: false, reminder: false }));
      return v;
    };
    for (const a of events.appointments) get(toDateKey(new Date(a.start_at))).appointment = true;
    for (const t of tasks) if (t.due_date && !t.done && t.due_date >= from && t.due_date <= to) get(t.due_date).task = true;
    for (const k of events.keyDates) get(k.date).keyDate = true;
    for (const r of events.reminders) if (!r.done) get(toDateKey(new Date(r.remind_at))).reminder = true;
    return m;
  }, [tasks, events, from, to]);

  const dayAppointments = events.appointments.filter((a) => toDateKey(new Date(a.start_at)) === selected);
  const dayTasks = tasks.filter((t) => t.due_date === selected);
  const dayKeyDates = events.keyDates.filter((k) => k.date === selected);
  const dayReminders = events.reminders.filter((r) => toDateKey(new Date(r.remind_at)) === selected);
  const toggleReminder = (r: Reminder) => void runLocal(() => updateRow(db, REMINDERS, r, { done: !r.done }));
  const empty = dayAppointments.length + dayTasks.length + dayKeyDates.length + dayReminders.length === 0;

  // Chaque catégorie garde sa couleur partout : point de la grille, légende, carte du détail.
  const dot = (color: string) => <View style={[styles.dot, { backgroundColor: color }]} />;
  const legend = [
    [categories.agenda.fg, 'Rendez-vous'],
    [categories.tasks.fg, 'Tâches'],
    [categories.keyDates.fg, 'Échéances clés'],
    [categories.reminders.fg, 'Rappels'],
  ] as const;

  const arrow = (delta: -1 | 1) => (
    <Pressable
      onPress={() => setSelected((s) => shiftAnchor(mode, s, delta))}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={
        mode === 'month'
          ? delta < 0 ? 'Mois précédent' : 'Mois suivant'
          : delta < 0 ? 'Semaine précédente' : 'Semaine suivante'
      }
      style={({ pressed }) => [styles.arrow, { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={delta < 0 ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.text} />
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
      <View style={[styles.legendItem, { gap: spacing.md, marginBottom: spacing.lg }]}>
        <View style={styles.grow}>
          <SegmentedControl options={MODES} value={mode} onChange={setMode} />
        </View>
        {/* Toujours présent (estompé sur aujourd'hui) : le contrôle ne change pas de largeur. */}
        <TextAction label="Aujourd'hui" disabled={selected === today} onPress={() => setSelected(today)} />
      </View>

      <Panel style={{ padding: spacing.lg, marginBottom: spacing.xxl }}>
        <View style={[styles.periodRow, { marginBottom: spacing.md }]}>
          {arrow(-1)}
          <Text style={[typography.heading, { color: colors.text }]}>{periodTitle(mode, selected)}</Text>
          {arrow(1)}
        </View>

        <View style={styles.grid}>
          {WEEKDAY_INITIALS.map((d, i) => (
            <Text
              key={`h${i}`}
              style={[styles.cell, styles.headerCell, typography.caption, { color: colors.textFaint, fontWeight: '700' }]}
            >
              {d}
            </Text>
          ))}
          {days.map((key, i) => {
            if (!key) return <View key={`e${i}`} style={styles.cell} />;
            const isSelected = key === selected;
            const isToday = key === today;
            const mark = marks.get(key);
            const count = [mark?.appointment && 'rendez-vous', mark?.task && 'tâches', mark?.keyDate && 'échéances', mark?.reminder && 'rappels'].filter(Boolean);
            return (
              <Pressable
                key={key}
                onPress={() => setSelected(key)}
                style={styles.cell}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${formatLongDate(key)}${count.length ? ` : ${count.join(', ')}` : ''}`}
              >
                {/* Sélection en dégradé soleil, aujourd'hui sur fond teinté, jours passés estompés. */}
                <View
                  style={[
                    styles.day,
                    isSelected && { backgroundColor: colors.primary, experimental_backgroundImage: sunsetGradient },
                    !isSelected && isToday && { backgroundColor: colors.accentSoft },
                  ]}
                >
                  <Text
                    style={{
                      color: isSelected
                        ? colors.onGradient
                        : isToday
                          ? colors.accent
                          : key < today
                            ? colors.textFaint
                            : colors.text,
                      fontSize: fontSize.body,
                      fontWeight: isSelected || isToday ? '700' : '500',
                    }}
                  >
                    {fromDateKey(key).getDate()}
                  </Text>
                </View>
                <View style={styles.dots}>
                  {mark?.appointment && dot(categories.agenda.fg)}
                  {mark?.task && dot(categories.tasks.fg)}
                  {mark?.keyDate && dot(categories.keyDates.fg)}
                  {mark?.reminder && dot(categories.reminders.fg)}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Légende dans la carte, sous un filet : elle se lit avec la grille. */}
        <View
          style={[
            styles.legend,
            {
              gap: spacing.md,
              marginTop: spacing.md,
              paddingTop: spacing.md,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.border,
            },
          ]}
        >
          {legend.map(([c, l]) => (
            <View key={l} style={[styles.legendItem, { gap: spacing.xs }]}>
              {dot(c)}
              <Text style={[typography.caption, { color: colors.textMuted }]}>{l}</Text>
            </View>
          ))}
        </View>
      </Panel>

      {/* Détail du jour : une carte par catégorie, de la couleur de son point dans la grille. */}
      <View style={[styles.periodRow, { gap: spacing.sm, marginBottom: spacing.md }]}>
        <Text accessibilityRole="header" numberOfLines={1} style={[typography.heading, styles.shrink, { color: colors.text }]}>
          {formatLongDateTitle(selected)}
        </Text>
        <View style={[styles.legendItem, { gap: spacing.sm }]}>
          <TextAction
            label="RDV"
            icon="add"
            tint={categories.agenda}
            accessibilityLabel="Nouveau rendez-vous ce jour"
            onPress={() => router.push({ pathname: '/appointment-form', params: { date: selected } })}
          />
          <TextAction
            label="Rappel"
            icon="add"
            tint={categories.reminders}
            accessibilityLabel="Nouveau rappel ce jour"
            onPress={() => router.push({ pathname: '/reminder-form', params: { date: selected } })}
          />
        </View>
      </View>
      {empty && (
        <Panel style={{ padding: spacing.lg }}>
          <CardNote>Rien de prévu ce jour-là.</CardNote>
        </Panel>
      )}
      {dayAppointments.length > 0 && (
        <CategoryCard tint={categories.agenda} icon="calendar-outline" title="Rendez-vous" count={dayAppointments.length}>
          <CardList>
            {dayAppointments.map((a, i) => (
              <AppointmentRow key={a.id} appointment={a} showDebrief isLast={i === dayAppointments.length - 1} />
            ))}
          </CardList>
        </CategoryCard>
      )}
      {dayTasks.length > 0 && (
        <CategoryCard tint={categories.tasks} icon="checkbox-outline" title="Tâches" count={dayTasks.filter((t) => !t.done).length}>
          <CardList>
            {dayTasks.map((t, i) => (
              <TaskRow
                key={t.id}
                task={t}
                today={today}
                onToggle={toggle}
                onPostpone={postponeToTomorrow}
                onOpen={actions.open}
                isLast={i === dayTasks.length - 1}
              />
            ))}
          </CardList>
        </CategoryCard>
      )}
      {dayKeyDates.length > 0 && (
        <CategoryCard tint={categories.keyDates} icon="hourglass-outline" title="Échéances clés" count={dayKeyDates.length}>
          <CardList>
            {dayKeyDates.map((k, i) => (
              <KeyDateRow key={k.id} keyDate={k} today={today} isLast={i === dayKeyDates.length - 1} />
            ))}
          </CardList>
        </CategoryCard>
      )}
      {dayReminders.length > 0 && (
        <CategoryCard
          tint={categories.reminders}
          icon="alarm-outline"
          title="Rappels"
          count={dayReminders.filter((r) => !r.done).length}
        >
          <CardList>
            {dayReminders.map((r, i) => (
              <ReminderRow
                key={r.id}
                reminder={r}
                today={today}
                day={selected}
                onToggle={toggleReminder}
                isLast={i === dayReminders.length - 1}
              />
            ))}
          </CardList>
        </CategoryCard>
      )}
      {actions.sheet}
    </ScrollView>
  );
}

const MODES = [
  { value: 'month', label: 'Mois' },
  { value: 'week', label: 'Semaine' },
] as const;

const styles = StyleSheet.create({
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 52, alignItems: 'center', justifyContent: 'center' },
  headerCell: { height: 24, textAlign: 'center' },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 2, height: 6, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
});
