import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DatePickerSheet } from '../components/DatePickerSheet';
import { Sheet, SheetOption } from '../components/Sheet';
import { TimePickerSheet } from '../components/TimePickerSheet';
import { Button, CategoryCard, EmptyText, Field } from '../components/ui';
import { listContacts, type ContactWithLast } from '../db/crmDb';
import { softDeleteRow, updateRow } from '../db/entityTable';
import { listTasks, type Task } from '../db/localDb';
import { addReminder, getReminder, REMINDERS, type Reminder } from '../db/remindersDb';
import { formatDueLabel, fromDateKey, toDateKey, type DateKey } from '../lib/dates';
import { useToday } from '../lib/useToday';
import { requestNotificationPermission, rescheduleNotifications } from '../notifications/scheduler';
import { getNotificationSettings } from '../notifications/settings';
import { useLocalQuery } from '../sync/useLocalQuery';
import { useSync } from '../sync/SyncProvider';
import { useTheme } from '../theme/ThemeProvider';

type Form = {
  title: string;
  date: DateKey;
  hour: number;
  minute: number;
  task_id: string | null;
  contact_id: string | null;
};

const NO_CONTACTS: ContactWithLast[] = [];
const NO_TASKS: Task[] = [];
const pad = (n: number) => String(n).padStart(2, '0');

/** Nouveau rappel : aujourd'hui → l'heure pleine suivante ; autre jour → 9:00. */
function defaultTime(date: DateKey, today: DateKey): { hour: number; minute: number } {
  if (date !== today) return { hour: 9, minute: 0 };
  return { hour: Math.min(new Date().getHours() + 1, 23), minute: 0 };
}

const toInstant = (f: Pick<Form, 'date' | 'hour' | 'minute'>) => {
  const d = fromDateKey(f.date);
  d.setHours(f.hour, f.minute, 0, 0);
  return d;
};

/**
 * Création (sans `id`) ou modification d'un rappel. `taskId` / `contactId` /
 * `date` préremplissent un nouveau rappel (ouvert depuis une tâche, une fiche
 * contact ou un jour du calendrier).
 */
export function ReminderFormScreen({
  userId,
  id,
  taskId,
  contactId,
  date,
}: {
  userId: string;
  id?: string;
  taskId?: string;
  contactId?: string;
  date?: DateKey;
}) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const today = useToday();
  const { colors, spacing, radius, fontSize, categories } = useTheme();
  const tint = categories.reminders;
  const [form, setForm] = useState<Form>(() => {
    const day = date ?? today;
    return { title: '', date: day, ...defaultTime(day, today), task_id: taskId ?? null, contact_id: contactId ?? null };
  });
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [picking, setPicking] = useState<'date' | 'time' | 'task' | 'contact' | null>(null);

  const loadContacts = useCallback((d: SQLiteDatabase) => listContacts(d, userId), [userId]);
  const { data: contacts } = useLocalQuery(loadContacts, NO_CONTACTS);
  const loadTasks = useCallback((d: SQLiteDatabase) => listTasks(d, userId), [userId]);
  const { data: tasks } = useLocalQuery(loadTasks, NO_TASKS);
  const contactName = contacts.find((c) => c.id === form.contact_id)?.name ?? null;
  const taskTitle = tasks.find((t) => t.id === form.task_id)?.title ?? null;
  const openTasks = tasks.filter((t) => !t.done || t.id === form.task_id);

  // Lu une seule fois à l'ouverture (une sync pendant la saisie ne l'écrase pas).
  useEffect(() => {
    if (!id) return;
    let active = true;
    getReminder(db, id)
      .then((r) => {
        if (!active) return;
        setReminder(r);
        if (r) {
          const at = new Date(r.remind_at);
          setForm({
            title: r.title,
            date: toDateKey(at),
            hour: at.getHours(),
            minute: at.getMinutes(),
            task_id: r.task_id,
            contact_id: r.contact_id,
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      active = false;
    };
  }, [db, id]);

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const canSave = form.title.trim().length > 0 && !loading && (!id || !!reminder);
  const inPast = toInstant(form) <= new Date();

  const save = async () => {
    if (!canSave) return;
    const fields = {
      title: form.title.trim(),
      remind_at: toInstant(form).toISOString(),
      task_id: form.task_id,
      contact_id: form.contact_id,
    };
    await runLocal(async () => {
      // Heure modifiée vers le futur : le rappel redevient « à faire ».
      if (reminder) await updateRow(db, REMINDERS, reminder, inPast ? fields : { ...fields, done: false });
      else await addReminder(db, userId, { ...fields, done: false });
    });
    // Premier rappel : c'est le bon moment pour demander l'autorisation (si le
    // système peut encore la demander). La reprogrammation suit la sync locale.
    const permission = await requestNotificationPermission().catch(() => 'unsupported' as const);
    if (permission === 'granted') {
      // NotificationScheduler reprogramme déjà après l'écriture, mais peut-être
      // avant que l'autorisation tout juste demandée ne soit accordée.
      void rescheduleNotifications(db, userId, getNotificationSettings()).catch(() => undefined);
    } else if (!inPast && (permission === 'denied' || permission === 'blocked')) {
      Alert.alert(
        'Notifications désactivées',
        "Le rappel figure dans la Vue du jour, mais aucune notification ne sera envoyée tant que les notifications de Road sont refusées dans les réglages du téléphone."
      );
    }
    router.back();
  };

  const toggleDone = () => {
    if (!reminder) return;
    void runLocal(() => updateRow(db, REMINDERS, reminder, { done: !reminder.done }));
    router.back();
  };

  const confirmDelete = () => {
    if (!reminder) return;
    Alert.alert('Supprimer ce rappel ?', reminder.title || undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void runLocal(() => softDeleteRow(db, REMINDERS, reminder));
          router.back();
        },
      },
    ]);
  };

  const label = (text: string) => (
    <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginBottom: spacing.xs }}>{text}</Text>
  );

  const pickerRow = (
    icon: ComponentProps<typeof Ionicons>['name'],
    text: string | null,
    placeholder: string,
    onPress: () => void,
    onClear?: () => void
  ) => (
    // Présenté comme un champ blanc sur le fond pastel de la carte.
    <View
      style={[
        styles.row,
        {
          justifyContent: 'space-between',
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={[styles.row, styles.flex, { gap: spacing.sm, paddingVertical: spacing.md }]}
      >
        <Ionicons name={icon} size={18} color={tint.fg} />
        <Text numberOfLines={1} style={{ flexShrink: 1, color: text ? colors.text : colors.textFaint, fontSize: fontSize.body }}>
          {text ?? placeholder}
        </Text>
      </Pressable>
      {text && onClear && (
        <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>Retirer</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Rappel' : 'Nouveau rappel' }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Catégorie Rappels : cartes menthe (DECISIONS.md §26). */}
          <CategoryCard tint={tint} icon="alarm-outline" title={id ? 'Rappel' : 'Nouveau rappel'}>
            <View style={{ gap: spacing.md }}>
              <View>
                {label('Titre *')}
                <Field
                  value={form.title}
                  onChangeText={(title) => patch({ title })}
                  placeholder="Ex. Rappeler le club pour le contrat"
                  autoFocus={!id}
                />
              </View>
              <View style={[styles.row, { gap: spacing.md }]}>
                <View style={styles.flex}>
                  {label('Date')}
                  {pickerRow('calendar-outline', formatDueLabel(form.date, today), '', () => setPicking('date'))}
                </View>
                <View style={styles.flex}>
                  {label('Heure')}
                  {pickerRow('time-outline', `${pad(form.hour)}:${pad(form.minute)}`, '', () => setPicking('time'))}
                </View>
              </View>
              {inPast && (
                <Text style={{ color: colors.warning, fontSize: fontSize.small }}>
                  Cette heure est déjà passée : aucune notification ne sera envoyée.
                </Text>
              )}
            </View>
          </CategoryCard>
          <CategoryCard tint={tint} icon="link-outline" title="Liens">
            <View style={{ gap: spacing.md }}>
              <View>
                {label('Tâche liée')}
                {pickerRow('checkbox-outline', taskTitle, 'Aucune', () => setPicking('task'), () => patch({ task_id: null }))}
              </View>
              <View>
                {label('Contact lié')}
                {pickerRow('person-outline', contactName, 'Aucun', () => setPicking('contact'), () => patch({ contact_id: null }))}
              </View>
            </View>
          </CategoryCard>
          <View style={{ gap: spacing.sm }}>
            <Button label="Enregistrer" onPress={() => void save()} disabled={!canSave} />
            {reminder && (
              <Button
                label={reminder.done ? 'Marquer comme à faire' : 'Marquer comme fait'}
                variant="secondary"
                onPress={toggleDone}
              />
            )}
            {reminder && <Button label="Supprimer le rappel" variant="danger" onPress={confirmDelete} />}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <DatePickerSheet
        visible={picking === 'date'}
        title="Date du rappel"
        allowNone={false}
        value={form.date}
        onSelect={(d) => {
          if (d) patch({ date: d });
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
      <TimePickerSheet
        visible={picking === 'time'}
        title="Heure du rappel"
        hour={form.hour}
        minute={form.minute}
        onChange={(hour, minute) => patch({ hour, minute })}
        onClose={() => setPicking(null)}
      />
      <Sheet visible={picking === 'task'} onClose={() => setPicking(null)} title="Tâche liée">
        {openTasks.length === 0 ? (
          <EmptyText>Aucune tâche en cours.</EmptyText>
        ) : (
          <ScrollView style={{ maxHeight: 360 }}>
            {openTasks.map((t) => (
              <SheetOption
                key={t.id}
                label={t.title}
                selected={form.task_id === t.id}
                onPress={() => {
                  patch({ task_id: t.id });
                  setPicking(null);
                }}
              />
            ))}
          </ScrollView>
        )}
      </Sheet>
      <Sheet visible={picking === 'contact'} onClose={() => setPicking(null)} title="Contact lié">
        {contacts.length === 0 ? (
          <EmptyText>Aucun contact. Ajoute-en depuis la section Contacts.</EmptyText>
        ) : (
          <ScrollView style={{ maxHeight: 360 }}>
            {contacts.map((c) => (
              <SheetOption
                key={c.id}
                label={c.club ? `${c.name} · ${c.club}` : c.name}
                selected={form.contact_id === c.id}
                onPress={() => {
                  patch({ contact_id: c.id });
                  setPicking(null);
                }}
              />
            ))}
          </ScrollView>
        )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
