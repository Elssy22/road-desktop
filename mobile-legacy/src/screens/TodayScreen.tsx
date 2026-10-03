import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppointmentRow } from '../components/AppointmentRow';
import { QuickAddTask } from '../components/QuickAddTask';
import { ReminderRow } from '../components/ReminderRow';
import { useTaskActions } from '../components/TaskActionsSheet';
import { TaskRow } from '../components/TaskRow';
import { CardList, CardNote, CategoryCard, GradientButton, ListRow, Panel, ScreenHeader, TextAction } from '../components/ui';
import { listAppointmentsBetween, type AppointmentWithContact } from '../db/appointmentsDb';
import { updateRow } from '../db/entityTable';
import { listKeyDatesBetween, type KeyDateWithContact } from '../db/keyDatesDb';
import { listOpenRemindersUntil, REMINDERS, type Reminder, type ReminderWithLinks } from '../db/remindersDb';
import { addDays, formatLongDateTitle, type DateKey } from '../lib/dates';
import { loadDailyPriorities, saveDailyPriorities } from '../lib/dailyPriorities';
import { TODAY_ALERT_DAYS } from '../lib/keyDateAlerts';
import { tasksForToday } from '../lib/taskGroups';
import { useToday } from '../lib/useToday';
import { useLocalQuery } from '../sync/useLocalQuery';
import { useOfflineTasks } from '../sync/useOfflineTasks';
import { useSync } from '../sync/SyncProvider';
import { useTheme } from '../theme/ThemeProvider';
import { KeyDateRow } from './agency/KeyDatesScreen';

const NO_APPOINTMENTS: AppointmentWithContact[] = [];
const NO_KEY_DATES: KeyDateWithContact[] = [];
const NO_REMINDERS: ReminderWithLinks[] = [];

export function TodayScreen({ userId }: { userId: string }) {
  const today = useToday();
  const { colors, spacing, radius } = useTheme();
  const scroll = useRef<ScrollView>(null);
  const taskInput = useRef<TextInput>(null);
  const tasksY = useRef(0);

  // Action principale de l'écran : amène la carte des tâches en vue et ouvre la saisie.
  const newTask = () => {
    scroll.current?.scrollTo({ y: Math.max(0, tasksY.current - spacing.lg), animated: true });
    taskInput.current?.focus();
  };

  return (
    <ScrollView
      ref={scroll}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxxl }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <ScreenHeader
        eyebrow="Aujourd'hui"
        title={formatLongDateTitle(today)}
        action={<GradientButton label="Nouvelle tâche" icon="add" onPress={newTask} />}
      />

      {/* Remonté à chaque changement de jour : on repart d'une liste vierge. */}
      <DailyPriorities key={today} userId={userId} day={today} />

      <TodayAppointments userId={userId} today={today} />

      <View onLayout={(e) => (tasksY.current = e.nativeEvent.layout.y)}>
        <TodayTasks userId={userId} today={today} inputRef={taskInput} />
      </View>

      <UpcomingKeyDates userId={userId} today={today} />

      <TodayReminders userId={userId} today={today} />

      <Panel style={{ overflow: 'hidden' }}>
        <ListRow
          title="Revue de la semaine"
          subtitle="Bilan, retards, projets et échéances à venir"
          left={
            <View style={[styles.reviewIcon, { backgroundColor: colors.accentSoft, borderRadius: radius.md }]}>
              <Ionicons name="calendar-number-outline" size={18} color={colors.accent} />
            </View>
          }
          onPress={() => router.push('/weekly-review')}
          isLast
        />
      </Panel>
    </ScrollView>
  );
}

/**
 * Rendez-vous du jour, par heure : section à part (et non mêlée aux tâches ou
 * aux rappels) parce qu'un RDV a un horaire et ne se coche pas. Les RDV passés
 * restent visibles, grisés, avec un raccourci vers le compte-rendu.
 */
function TodayAppointments({ userId, today }: { userId: string; today: DateKey }) {
  const { categories } = useTheme();
  const load = useCallback((d: SQLiteDatabase) => listAppointmentsBetween(d, userId, today, today), [userId, today]);
  const { data: appointments } = useLocalQuery(load, NO_APPOINTMENTS);

  return (
    <CategoryCard
      tint={categories.agenda}
      icon="calendar-outline"
      title="Agenda du jour"
      count={appointments.length}
      action={
        <TextAction
          label="RDV"
          icon="add"
          tint={categories.agenda}
          accessibilityLabel="Nouveau rendez-vous"
          onPress={() => router.push({ pathname: '/appointment-form', params: { date: today } })}
        />
      }
    >
      {appointments.length > 0 ? (
        <CardList>
          {appointments.map((a, i) => (
            <AppointmentRow key={a.id} appointment={a} showDebrief isLast={i === appointments.length - 1} />
          ))}
        </CardList>
      ) : (
        <CardNote>Aucun rendez-vous aujourd&apos;hui.</CardNote>
      )}
    </CategoryCard>
  );
}

function TodayTasks({
  userId,
  today,
  inputRef,
}: {
  userId: string;
  today: DateKey;
  inputRef: RefObject<TextInput | null>;
}) {
  const tasksApi = useOfflineTasks(userId);
  const { tasks, add, toggle, postponeToTomorrow } = tasksApi;
  const actions = useTaskActions(tasksApi);
  const { categories } = useTheme();

  const list = useMemo(() => tasksForToday(tasks, today), [tasks, today]);
  const remaining = list.filter((t) => !t.done).length;

  return (
    <CategoryCard tint={categories.tasks} icon="checkbox-outline" title="Tâches du jour" count={remaining}>
      {list.length > 0 && (
        <CardList>
          {list.map((t, i) => (
            <TaskRow
              key={t.id}
              task={t}
              today={today}
              onToggle={toggle}
              onPostpone={postponeToTomorrow}
              onOpen={actions.open}
              hideTodayLabel
              isLast={i === list.length - 1}
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
      {actions.sheet}
    </CategoryCard>
  );
}

/** Échéances de l'échéancier à J-7 ou moins ; rien n'est affiché s'il n'y en a pas. */
function UpcomingKeyDates({ userId, today }: { userId: string; today: DateKey }) {
  const { categories } = useTheme();
  const load = useCallback(
    (db: SQLiteDatabase) => listKeyDatesBetween(db, userId, today, addDays(today, TODAY_ALERT_DAYS)),
    [userId, today]
  );
  const { data: keyDates } = useLocalQuery(load, NO_KEY_DATES);
  if (keyDates.length === 0) return null;

  return (
    <CategoryCard
      tint={categories.keyDates}
      icon="hourglass-outline"
      title="Échéances proches"
      count={keyDates.length}
      action={
        <TextAction
          label="Échéancier"
          tint={categories.keyDates}
          onPress={() => router.push('/agency/key-dates', { withAnchor: true })}
        />
      }
    >
      <CardList>
        {keyDates.map((k, i) => (
          <KeyDateRow key={k.id} keyDate={k} today={today} isLast={i === keyDates.length - 1} fromOtherTab />
        ))}
      </CardList>
    </CategoryCard>
  );
}

/** Rappels non faits du jour, et ceux des jours passés restés non faits. */
function TodayReminders({ userId, today }: { userId: string; today: DateKey }) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const { categories } = useTheme();
  const load = useCallback((d: SQLiteDatabase) => listOpenRemindersUntil(d, userId, today), [userId, today]);
  const { data: reminders } = useLocalQuery(load, NO_REMINDERS);
  const toggle = (r: Reminder) => void runLocal(() => updateRow(db, REMINDERS, r, { done: !r.done }));

  return (
    <CategoryCard
      tint={categories.reminders}
      icon="alarm-outline"
      title="Rappels"
      count={reminders.length}
      action={
        <TextAction
          label="Rappel"
          icon="add"
          tint={categories.reminders}
          accessibilityLabel="Nouveau rappel"
          onPress={() => router.push({ pathname: '/reminder-form', params: { date: today } })}
        />
      }
    >
      {reminders.length > 0 ? (
        <CardList>
          {reminders.map((r, i) => (
            <ReminderRow key={r.id} reminder={r} today={today} onToggle={toggle} isLast={i === reminders.length - 1} />
          ))}
        </CardList>
      ) : (
        <CardNote>Aucun rappel aujourd&apos;hui.</CardNote>
      )}
    </CategoryCard>
  );
}

function DailyPriorities({ userId, day }: { userId: string; day: DateKey }) {
  const { colors, spacing, typography, scheme, categories } = useTheme();
  const tint = categories.priorities;
  const [items, setItems] = useState(() => loadDailyPriorities(userId, day));

  const update = (index: number, text: string) => {
    const next = items.map((v, i) => (i === index ? text : v));
    setItems(next);
    saveDailyPriorities(userId, day, next);
  };

  return (
    <CategoryCard tint={tint} icon="star-outline" title="Priorités du jour">
      <CardList>
        {items.map((value, i) => {
          // La n° 1 porte la couleur du soleil : c'est elle qui compte.
          const first = i === 0;
          return (
            <View
              key={i}
              style={[
                styles.priorityRow,
                {
                  paddingHorizontal: spacing.lg,
                  gap: spacing.md,
                  borderBottomColor: colors.border,
                  borderBottomWidth: i === items.length - 1 ? 0 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View style={[styles.priorityBadge, { backgroundColor: first ? colors.accent : tint.iconBg }]}>
                <Text style={[typography.caption, { color: first ? colors.onAccent : tint.fg, fontWeight: '700' }]}>
                  {i + 1}
                </Text>
              </View>
              <TextInput
                value={value}
                onChangeText={(t) => update(i, t)}
                placeholder={first ? 'La chose la plus importante aujourd’hui' : 'Priorité'}
                placeholderTextColor={colors.textFaint}
                style={[
                  styles.priorityInput,
                  { color: colors.text, fontSize: typography.body.fontSize, fontWeight: first && value ? '600' : '400' },
                ]}
                returnKeyType="done"
                keyboardAppearance={scheme}
              />
            </View>
          );
        })}
      </CardList>
    </CategoryCard>
  );
}

const styles = StyleSheet.create({
  priorityRow: { flexDirection: 'row', alignItems: 'center' },
  priorityBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  priorityInput: { flex: 1, paddingVertical: 14 },
  reviewIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
});
