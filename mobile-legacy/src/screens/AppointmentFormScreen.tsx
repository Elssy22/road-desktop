import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { DatePickerSheet } from '../components/DatePickerSheet';
import { Sheet, SheetOption } from '../components/Sheet';
import { TimePickerSheet } from '../components/TimePickerSheet';
import { Button, CardList, CategoryCard, EmptyText, Field, TextAction } from '../components/ui';
import { addAppointment, APPOINTMENTS, debriefAt, getAppointment, type Appointment } from '../db/appointmentsDb';
import { listContacts, type ContactWithLast } from '../db/crmDb';
import { softDeleteRow, updateRow } from '../db/entityTable';
import { listProjects, type ProjectWithProgress } from '../db/projectsDb';
import { formatTimeOfDay } from '../db/remindersDb';
import { canSearchAddress, searchAddress, type AddressSuggestion } from '../lib/addressSearch';
import { formatDueLabel, fromDateKey, toDateKey, type DateKey } from '../lib/dates';
import { openDirections } from '../lib/directions';
import { useToday } from '../lib/useToday';
import { requestNotificationPermission, rescheduleNotifications } from '../notifications/scheduler';
import { getNotificationSettings } from '../notifications/settings';
import { useLocalQuery } from '../sync/useLocalQuery';
import { useSync } from '../sync/SyncProvider';
import { useTheme } from '../theme/ThemeProvider';

type Time = { hour: number; minute: number };

type Form = {
  title: string;
  date: DateKey;
  start: Time;
  /** Heure de fin, le même jour que le début (null : pas d'heure de fin). */
  end: Time | null;
  location: string;
  contact_id: string | null;
  project_id: string | null;
  notes: string;
  debrief_reminder_enabled: boolean;
};

const NO_CONTACTS: ContactWithLast[] = [];
const NO_PROJECTS: ProjectWithProgress[] = [];
const pad = (n: number) => String(n).padStart(2, '0');
const formatTime = (t: Time) => `${pad(t.hour)}:${pad(t.minute)}`;
const minutesOf = (t: Time) => t.hour * 60 + t.minute;

/** Nouveau RDV : aujourd'hui → l'heure pleine suivante ; autre jour → 9:00 (comme les rappels). */
function defaultStart(date: DateKey, today: DateKey): Time {
  if (date !== today) return { hour: 9, minute: 0 };
  return { hour: Math.min(new Date().getHours() + 1, 23), minute: 0 };
}

/** Fin proposée quand on en ajoute une : 1 h après le début, bornée à 23:45. */
function defaultEnd(start: Time): Time {
  const m = Math.min(minutesOf(start) + 60, 23 * 60 + 45);
  return { hour: Math.floor(m / 60), minute: m % 60 };
}

const toInstant = (date: DateKey, t: Time) => {
  const d = fromDateKey(date);
  d.setHours(t.hour, t.minute, 0, 0);
  return d;
};

const timeOf = (iso: string): Time => {
  const d = new Date(iso);
  return { hour: d.getHours(), minute: d.getMinutes() };
};

/**
 * Création (sans `id`) ou modification d'un rendez-vous. `date` / `contactId`
 * préremplissent un nouveau RDV (ouvert depuis un jour du calendrier ou la Vue du jour).
 */
export function AppointmentFormScreen({
  userId,
  id,
  contactId,
  date,
}: {
  userId: string;
  id?: string;
  contactId?: string;
  date?: DateKey;
}) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const today = useToday();
  const { colors, spacing, radius, fontSize, categories } = useTheme();
  const tint = categories.agenda;
  const [form, setForm] = useState<Form>(() => {
    const day = date ?? today;
    return {
      title: '',
      date: day,
      start: defaultStart(day, today),
      end: null,
      location: '',
      contact_id: contactId ?? null,
      project_id: null,
      notes: '',
      debrief_reminder_enabled: true,
    };
  });
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [picking, setPicking] = useState<'date' | 'start' | 'end' | 'contact' | 'project' | null>(null);

  // Suggestions d'adresses (Nominatim) : null = liste fermée, [] = aucun résultat.
  const [suggestions, setSuggestions] = useState<AddressSuggestion[] | null>(null);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const addressSearch = useRef<AbortController | null>(null);
  useEffect(() => () => addressSearch.current?.abort(), []);

  const loadContacts = useCallback((d: SQLiteDatabase) => listContacts(d, userId), [userId]);
  const { data: contacts } = useLocalQuery(loadContacts, NO_CONTACTS);
  const loadProjects = useCallback((d: SQLiteDatabase) => listProjects(d, userId), [userId]);
  const { data: projects } = useLocalQuery(loadProjects, NO_PROJECTS);
  const contactName = contacts.find((c) => c.id === form.contact_id)?.name ?? null;
  const projectTitle = projects.find((p) => p.id === form.project_id)?.title ?? null;

  // Lu une seule fois à l'ouverture (une sync pendant la saisie ne l'écrase pas).
  useEffect(() => {
    if (!id) return;
    let active = true;
    getAppointment(db, id)
      .then((a) => {
        if (!active) return;
        setAppointment(a);
        if (a) {
          setForm({
            title: a.title,
            date: toDateKey(new Date(a.start_at)),
            start: timeOf(a.start_at),
            end: a.end_at ? timeOf(a.end_at) : null,
            location: a.location ?? '',
            contact_id: a.contact_id,
            project_id: a.project_id,
            notes: a.notes ?? '',
            debrief_reminder_enabled: a.debrief_reminder_enabled,
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
  const endBeforeStart = form.end !== null && minutesOf(form.end) <= minutesOf(form.start);
  const canSave = form.title.trim().length > 0 && !endBeforeStart && !loading && (!id || !!appointment);

  const startAt = toInstant(form.date, form.start).toISOString();
  const endAt = form.end ? toInstant(form.date, form.end).toISOString() : null;
  const debrief = debriefAt({ start_at: startAt, end_at: endAt, debrief_reminder_enabled: form.debrief_reminder_enabled });
  const debriefInFuture = !!debrief && debrief > new Date();

  const save = async () => {
    if (!canSave) return;
    const fields = {
      title: form.title.trim(),
      start_at: startAt,
      end_at: endAt,
      location: form.location.trim() || null,
      contact_id: form.contact_id,
      project_id: form.project_id,
      notes: form.notes.trim() || null,
      debrief_reminder_enabled: form.debrief_reminder_enabled,
    };
    await runLocal(async () => {
      if (appointment) await updateRow(db, APPOINTMENTS, appointment, fields);
      else await addAppointment(db, userId, fields);
    });
    // La notification de debrief suit la reprogrammation globale déclenchée par
    // l'écriture locale. Comme pour les rappels, on demande l'autorisation ici
    // si elle ne l'a jamais été, puis on reprogramme une fois accordée.
    if (debriefInFuture) {
      const permission = await requestNotificationPermission().catch(() => 'unsupported' as const);
      if (permission === 'granted') {
        void rescheduleNotifications(db, userId, getNotificationSettings()).catch(() => undefined);
      } else if (permission === 'denied' || permission === 'blocked') {
        Alert.alert(
          'Notifications désactivées',
          "Le RDV est enregistré, mais le rappel de debrief ne sera pas envoyé tant que les notifications de Road sont refusées dans les réglages du téléphone."
        );
      }
    }
    router.back();
  };

  const closeSuggestions = () => {
    addressSearch.current?.abort();
    addressSearch.current = null;
    setSearchingAddress(false);
    setSuggestions(null);
  };

  // Recherche sur action explicite uniquement : la politique Nominatim interdit
  // l'autocomplétion à la frappe (voir DECISIONS.md §24).
  const findAddress = () => {
    if (!canSearchAddress(form.location)) return;
    closeSuggestions();
    const controller = new AbortController();
    addressSearch.current = controller;
    setSearchingAddress(true);
    searchAddress(form.location, controller.signal)
      .then((results) => {
        if (addressSearch.current === controller) setSuggestions(results);
      })
      .catch(() => undefined) // Échec silencieux : le texte saisi reste tel quel.
      .finally(() => {
        if (addressSearch.current === controller) setSearchingAddress(false);
      });
  };

  const confirmDelete = () => {
    if (!appointment) return;
    Alert.alert('Supprimer ce rendez-vous ?', appointment.title || undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void runLocal(() => softDeleteRow(db, APPOINTMENTS, appointment));
          router.back();
        },
      },
    ]);
  };

  const openDebrief = () =>
    router.push(
      { pathname: '/agency/meeting-report', params: form.contact_id ? { contactId: form.contact_id } : {} },
      { withAnchor: true }
    );

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

  const debriefHint = !form.debrief_reminder_enabled
    ? null
    : debriefInFuture && debrief
      ? `Notification le ${formatDueLabel(toDateKey(debrief), today).toLowerCase()} à ${formatTimeOfDay(debrief.toISOString())} (${form.end ? '1 h après la fin' : '2 h après le début, faute d’heure de fin'}).`
      : 'Ce RDV est déjà passé : aucune notification ne sera envoyée.';

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Rendez-vous' : 'Nouveau rendez-vous' }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Catégorie Agenda : cartes bleu ciel (DECISIONS.md §26). */}
          <CategoryCard tint={tint} icon="calendar-outline" title={id ? 'Rendez-vous' : 'Nouveau rendez-vous'}>
            <View style={{ gap: spacing.md }}>
              <View>
                {label('Titre *')}
                <Field
                  value={form.title}
                  onChangeText={(title) => patch({ title })}
                  placeholder="Ex. Déjeuner avec le directeur sportif"
                  autoFocus={!id}
                />
              </View>
              <View>
                {label('Date')}
                {pickerRow('calendar-outline', formatDueLabel(form.date, today), '', () => setPicking('date'))}
              </View>
              <View style={[styles.row, { gap: spacing.md }]}>
                <View style={styles.flex}>
                  {label('Début')}
                  {pickerRow('time-outline', formatTime(form.start), '', () => setPicking('start'))}
                </View>
                <View style={styles.flex}>
                  {label('Fin (facultative)')}
                  {pickerRow(
                    'time-outline',
                    form.end ? formatTime(form.end) : null,
                    'Ajouter',
                    () => {
                      if (!form.end) patch({ end: defaultEnd(form.start) });
                      setPicking('end');
                    },
                    () => patch({ end: null })
                  )}
                </View>
              </View>
              {endBeforeStart && (
                <Text style={{ color: colors.danger, fontSize: fontSize.small }}>
                  L’heure de fin doit être après l’heure de début.
                </Text>
              )}
            </View>
          </CategoryCard>
          <CategoryCard tint={tint} icon="location-outline" title="Lieu">
            <Field
              value={form.location}
              onChangeText={(location) => {
                // Les suggestions affichées ne correspondent plus au texte : on les ferme.
                if (suggestions || searchingAddress) closeSuggestions();
                patch({ location });
              }}
              placeholder="Adresse, salle, visio…"
              returnKeyType="search"
              onSubmitEditing={findAddress}
            />
            {suggestions && (
              <CardList>
                {suggestions.length === 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.small, padding: spacing.md }}>
                    Aucune adresse trouvée. Le texte saisi est conservé tel quel.
                  </Text>
                ) : (
                  suggestions.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() => {
                        patch({ location: s.label });
                        closeSuggestions();
                      }}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.row,
                        {
                          gap: spacing.sm,
                          padding: spacing.md,
                          borderBottomColor: colors.border,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          opacity: pressed ? 0.6 : 1,
                        },
                      ]}
                    >
                      <Ionicons name="location-outline" size={16} color={tint.fg} />
                      <Text style={{ flexShrink: 1, color: colors.text, fontSize: fontSize.small }}>{s.label}</Text>
                    </Pressable>
                  ))
                )}
                <View style={[styles.row, { justifyContent: 'space-between', padding: spacing.sm }]}>
                  <Text style={{ color: colors.textFaint, fontSize: fontSize.small }}>© contributeurs OpenStreetMap</Text>
                  <Pressable onPress={closeSuggestions} hitSlop={8} accessibilityRole="button">
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>Fermer</Text>
                  </Pressable>
                </View>
              </CardList>
            )}
            {form.location.trim().length > 0 && (
              <View style={[styles.row, { gap: spacing.sm }]}>
                {canSearchAddress(form.location) && (
                  <TextAction
                    label="Chercher l’adresse"
                    icon="search-outline"
                    tint={tint}
                    onPress={findAddress}
                    disabled={searchingAddress}
                  />
                )}
                {searchingAddress && <ActivityIndicator size="small" color={tint.fg} />}
                <TextAction
                  label="Itinéraire"
                  icon="navigate-outline"
                  tint={tint}
                  onPress={() => void openDirections(form.location)}
                />
              </View>
            )}
          </CategoryCard>
          <CategoryCard tint={tint} icon="link-outline" title="Liens">
            <View style={{ gap: spacing.md }}>
              <View>
                {label('Contact lié')}
                {pickerRow('person-outline', contactName, 'Aucun', () => setPicking('contact'), () => patch({ contact_id: null }))}
              </View>
              <View>
                {label('Projet lié')}
                {pickerRow('folder-outline', projectTitle, 'Aucun', () => setPicking('project'), () => patch({ project_id: null }))}
              </View>
            </View>
          </CategoryCard>
          <CategoryCard tint={tint} icon="document-text-outline" title="Notes et debrief">
            <View style={{ gap: spacing.md }}>
              <Field
                value={form.notes}
                onChangeText={(notes) => patch({ notes })}
                placeholder="Ordre du jour, documents à apporter…"
                multiline
                style={styles.notes}
                accessibilityLabel="Notes"
              />
              <View>
                <View style={[styles.row, { justifyContent: 'space-between', gap: spacing.md }]}>
                  <Text style={{ color: colors.text, fontSize: fontSize.body, flexShrink: 1 }}>
                    Rappel de debrief automatique
                  </Text>
                  <Switch
                    value={form.debrief_reminder_enabled}
                    onValueChange={(v) => patch({ debrief_reminder_enabled: v })}
                    trackColor={{ true: colors.primary }}
                    accessibilityLabel="Rappel de debrief automatique"
                  />
                </View>
                {debriefHint && (
                  <Text style={{ color: debriefInFuture ? colors.textMuted : colors.warning, fontSize: fontSize.small, marginTop: spacing.xs }}>
                    {debriefHint}
                  </Text>
                )}
              </View>
            </View>
          </CategoryCard>
          <View style={{ gap: spacing.sm }}>
            <Button label="Enregistrer" onPress={() => void save()} disabled={!canSave} />
            {appointment && <Button label="Faire le compte-rendu" variant="secondary" onPress={openDebrief} />}
            {appointment && <Button label="Supprimer le rendez-vous" variant="danger" onPress={confirmDelete} />}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <DatePickerSheet
        visible={picking === 'date'}
        title="Date du rendez-vous"
        allowNone={false}
        value={form.date}
        onSelect={(d) => {
          if (d) patch({ date: d });
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
      <TimePickerSheet
        visible={picking === 'start'}
        title="Début"
        hour={form.start.hour}
        minute={form.start.minute}
        onChange={(hour, minute) =>
          // La fin suit le début quand on le décale (même durée), tant qu'elle tient dans la journée.
          setForm((f) => {
            const start = { hour, minute };
            if (!f.end) return { ...f, start };
            const m = minutesOf(f.end) + minutesOf(start) - minutesOf(f.start);
            const end = m > minutesOf(start) && m < 24 * 60 ? { hour: Math.floor(m / 60), minute: m % 60 } : f.end;
            return { ...f, start, end };
          })
        }
        onClose={() => setPicking(null)}
      />
      <TimePickerSheet
        visible={picking === 'end'}
        title="Fin"
        hour={form.end?.hour ?? 0}
        minute={form.end?.minute ?? 0}
        onChange={(hour, minute) => patch({ end: { hour, minute } })}
        onClose={() => setPicking(null)}
      />
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
      <Sheet visible={picking === 'project'} onClose={() => setPicking(null)} title="Projet lié">
        {projects.length === 0 ? (
          <EmptyText>Aucun projet. Ajoute-en depuis la section Projets.</EmptyText>
        ) : (
          <ScrollView style={{ maxHeight: 360 }}>
            {projects.map((p) => (
              <SheetOption
                key={p.id}
                label={p.title || 'Sans titre'}
                selected={form.project_id === p.id}
                onPress={() => {
                  patch({ project_id: p.id });
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
  notes: { minHeight: 96, textAlignVertical: 'top' },
});
