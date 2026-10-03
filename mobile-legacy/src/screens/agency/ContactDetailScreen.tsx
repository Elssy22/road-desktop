import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { router, Stack } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DatePickerSheet } from '../../components/DatePickerSheet';
import { askMarkAsActiveClient, PipelineStageSheet, STAGE_ICONS } from '../../components/PipelineStageSheet';
import {
  Badge,
  CardList,
  CardNote,
  CategoryCard,
  Chip,
  ChipRow,
  EmptyText,
  GradientButton,
  ListRow,
  TextAction,
} from '../../components/ui';
import { ReminderRow } from '../../components/ReminderRow';
import { softDeleteRow, updateRow } from '../../db/entityTable';
import { listOpenRemindersForContact, REMINDERS, type Reminder, type ReminderWithLinks } from '../../db/remindersDb';
import {
  addInteraction,
  CONTACTS,
  getContact,
  INTERACTION_TYPES,
  INTERACTIONS,
  listInteractions,
  PIPELINE_STAGE_LABELS,
  segmentLabel,
  setPipelineStage,
  softDeleteContact,
  type Contact,
  type Interaction,
  type PipelineStage,
} from '../../db/crmDb';
import { formatDueLabel, fromDateKey, toDateKey, type DateKey } from '../../lib/dates';
import { daysSinceContact, FOLLOW_UP_DAYS } from '../../lib/followUp';
import { formatMoney } from '../../lib/money';
import { useToday } from '../../lib/useToday';
import { getOpenAutoTask } from '../../db/crmFollowupsDb';
import { useFollowupAutomation } from '../../sync/useFollowupAutomation';
import { useLocalQuery } from '../../sync/useLocalQuery';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';

type AutoTask = { id: string; title: string; due_date: string | null };
type Detail = {
  contact: Contact | null;
  interactions: Interaction[];
  reminders: ReminderWithLinks[];
  autoTask: AutoTask | null;
};
const EMPTY: Detail = { contact: null, interactions: [], reminders: [], autoTask: null };

const TYPE_LABELS: Record<string, string> = { appel: 'Appel', rdv: 'RDV', mail: 'Mail', deck: 'Deck', autre: 'Autre' };
const TYPE_ICONS: Record<
  string,
  'call-outline' | 'people-outline' | 'mail-outline' | 'document-attach-outline' | 'chatbubble-outline'
> = {
  appel: 'call-outline',
  rdv: 'people-outline',
  mail: 'mail-outline',
  deck: 'document-attach-outline',
};

export function ContactDetailScreen({ userId, id }: { userId: string; id: string }) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const today = useToday();
  const { colors, spacing, fontSize, categories } = useTheme();
  const tint = categories.contacts;

  const load = useCallback(
    async (d: SQLiteDatabase): Promise<Detail> => ({
      contact: await getContact(d, id),
      interactions: await listInteractions(d, id),
      reminders: await listOpenRemindersForContact(d, userId, id),
      autoTask: await getOpenAutoTask(d, id),
    }),
    [id, userId]
  );
  useFollowupAutomation();
  const { data, loaded } = useLocalQuery(load, EMPTY);
  const { contact, interactions, reminders, autoTask } = data;
  const toggleReminder = (r: Reminder) => void runLocal(() => updateRow(db, REMINDERS, r, { done: !r.done }));
  const [picking, setPicking] = useState<'stage' | 'followup' | null>(null);

  /** Sortie du pipeline : le contact devient un client actif (même ligne, sans étape). */
  const markAsActiveClient = (c: Contact) => void runLocal(() => setPipelineStage(db, c, null));

  const changeStage = (c: Contact, stage: PipelineStage) => {
    setPicking(null);
    if (stage === c.pipeline_stage) return;
    void runLocal(() => setPipelineStage(db, c, stage));
    if (stage === 'signe') askMarkAsActiveClient(c.name, () => markAsActiveClient({ ...c, pipeline_stage: stage }));
  };

  const confirmDelete = () => {
    if (!contact) return;
    Alert.alert('Supprimer ce contact ?', 'Son historique d’interactions et ses relances automatiques seront aussi supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void runLocal(() => softDeleteContact(db, contact));
          router.back();
        },
      },
    ]);
  };

  const confirmDeleteInteraction = (i: Interaction) =>
    Alert.alert('Supprimer cette interaction ?', i.summary || undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => void runLocal(() => softDeleteRow(db, INTERACTIONS, i)) },
    ]);

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  if (!contact) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Stack.Screen options={{ title: 'Contact' }} />
        <EmptyText>Ce contact n’existe plus (supprimé sur un autre appareil ?).</EmptyText>
      </View>
    );
  }

  // Interactions triées de la plus récente à la plus ancienne.
  const days = daysSinceContact({ ...contact, last_interaction_at: interactions[0]?.happened_at ?? null }, today);

  const infoRows: { icon: 'call-outline' | 'mail-outline' | 'football-outline'; text: string; url?: string }[] = [];
  if (contact.club) infoRows.push({ icon: 'football-outline', text: contact.club });
  if (contact.phone) infoRows.push({ icon: 'call-outline', text: contact.phone, url: `tel:${contact.phone.replace(/\s+/g, '')}` });
  if (contact.email) infoRows.push({ icon: 'mail-outline', text: contact.email, url: `mailto:${contact.email}` });

  const headerButton = (
    icon: 'create-outline' | 'trash-outline' | 'sparkles-outline',
    label: string,
    color: string,
    onPress: () => void
  ) => (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingHorizontal: spacing.sm })}
    >
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: contact.name || 'Contact',
          headerRight: () => (
            <View style={styles.headerActions}>
              {headerButton('sparkles-outline', 'Compte-rendu de RDV', colors.primary, () =>
                router.push({ pathname: '/agency/meeting-report', params: { contactId: contact.id } })
              )}
              {headerButton('create-outline', 'Modifier', colors.textMuted, () =>
                router.push({ pathname: '/agency/contact-form', params: { id: contact.id } })
              )}
              {headerButton('trash-outline', 'Supprimer le contact', colors.danger, confirmDelete)}
            </View>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.titleRow, { gap: spacing.sm, marginBottom: spacing.lg }]}>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.body, flexShrink: 1 }}>
            {[contact.role || 'Rôle non précisé', segmentLabel(contact.segment)].filter(Boolean).join(' · ')}
          </Text>
          {days >= FOLLOW_UP_DAYS && <Badge label={`À relancer · ${days} j`} color={colors.warning} />}
        </View>

        {/* Fiche : cartes roses (Contacts), rappels en menthe (DECISIONS.md §29). */}
        {(infoRows.length > 0 || contact.notes) && (
          <CategoryCard tint={tint} icon="person-outline" title="Infos">
            <CardList>
              {infoRows.map((r, i) => (
                <ListRow
                  key={r.icon}
                  title={r.text}
                  left={<Ionicons name={r.icon} size={18} color={tint.fg} />}
                  onPress={r.url ? () => void Linking.openURL(r.url!) : undefined}
                  chevron={false}
                  isLast={i === infoRows.length - 1 && !contact.notes}
                />
              ))}
              {contact.notes ? (
                <Text style={{ color: colors.text, fontSize: fontSize.small, padding: spacing.lg }}>{contact.notes}</Text>
              ) : null}
            </CardList>
          </CategoryCard>
        )}

        {contact.pipeline_stage && (
          <ProspectionCard
            contact={contact}
            stage={contact.pipeline_stage}
            autoTask={autoTask}
            today={today}
            onPickStage={() => setPicking('stage')}
            onPickFollowup={() => setPicking('followup')}
            onMarkAsActiveClient={() => markAsActiveClient(contact)}
          />
        )}

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
              accessibilityLabel="Nouveau rappel pour ce contact"
              onPress={() => router.push({ pathname: '/reminder-form', params: { contactId: contact.id } })}
            />
          }
        >
          {reminders.length > 0 ? (
            <CardList>
              {reminders.map((r, i) => (
                <ReminderRow key={r.id} reminder={r} today={today} day={null} onToggle={toggleReminder} isLast={i === reminders.length - 1} />
              ))}
            </CardList>
          ) : (
            <CardNote>Aucun rappel prévu.</CardNote>
          )}
        </CategoryCard>

        <CategoryCard tint={tint} icon="chatbubbles-outline" title="Interactions" count={interactions.length}>
          <QuickAddInteraction
            today={today}
            onAdd={(type, summary, day) =>
              runLocal(() =>
                addInteraction(db, userId, {
                  contact_id: contact.id,
                  type,
                  summary,
                  happened_at: atCurrentTime(day, today),
                }).then(() => undefined)
              )
            }
          />
          {interactions.length > 0 ? (
            <CardList>
              {interactions.map((i, idx) => (
                <ListRow
                  key={i.id}
                  title={i.summary || TYPE_LABELS[i.type] || i.type}
                  subtitle={`${TYPE_LABELS[i.type] ?? i.type} · ${formatDueLabel(toDateKey(new Date(i.happened_at)), today)}`}
                  left={<Ionicons name={TYPE_ICONS[i.type] ?? 'chatbubble-outline'} size={18} color={tint.fg} />}
                  onLongPress={() => confirmDeleteInteraction(i)}
                  isLast={idx === interactions.length - 1}
                />
              ))}
            </CardList>
          ) : (
            <CardNote>Aucune interaction enregistrée.</CardNote>
          )}
          {interactions.length > 0 && <CardNote>Appui long sur une interaction pour la supprimer.</CardNote>}
        </CategoryCard>
      </ScrollView>
      <PipelineStageSheet
        visible={picking === 'stage'}
        value={contact.pipeline_stage}
        onSelect={(s) => changeStage(contact, s)}
        onClose={() => setPicking(null)}
      />
      <DatePickerSheet
        visible={picking === 'followup'}
        title="Prochaine relance"
        value={contact.next_followup_date}
        onSelect={(d) => {
          setPicking(null);
          void runLocal(() => updateRow(db, CONTACTS, contact, { next_followup_date: d }));
        }}
        onClose={() => setPicking(null)}
      />
    </>
  );
}

/** Carte rose « Prospection » : étape (modifiable), montant potentiel, prochaine relance. */
function ProspectionCard({
  contact,
  stage,
  autoTask,
  today,
  onPickStage,
  onPickFollowup,
  onMarkAsActiveClient,
}: {
  contact: Contact;
  stage: PipelineStage;
  /** Relance automatique en cours (DECISIONS.md §32). */
  autoTask: AutoTask | null;
  today: DateKey;
  onPickStage: () => void;
  onPickFollowup: () => void;
  onMarkAsActiveClient: () => void;
}) {
  const { colors, categories } = useTheme();
  const tint = categories.contacts;
  const followup = contact.next_followup_date;
  const since = contact.stage_changed_at
    ? `Depuis ${formatDueLabel(toDateKey(new Date(contact.stage_changed_at)), today).toLowerCase()}`
    : null;

  return (
    <CategoryCard
      tint={tint}
      icon="trending-up-outline"
      title="Prospection"
      action={
        stage === 'signe' ? (
          <TextAction label="Client actif" icon="checkmark" tint={tint} onPress={onMarkAsActiveClient} accessibilityLabel="Marquer comme client actif" />
        ) : undefined
      }
    >
      <CardList>
        <ListRow
          title={PIPELINE_STAGE_LABELS[stage]}
          subtitle={since}
          left={<Ionicons name={STAGE_ICONS[stage]} size={18} color={tint.fg} />}
          onPress={onPickStage}
        />
        <ListRow
          title={contact.pipeline_amount != null ? formatMoney(contact.pipeline_amount, 'EUR') : 'Montant non renseigné'}
          subtitle="Montant potentiel"
          left={<Ionicons name="cash-outline" size={18} color={tint.fg} />}
          onPress={() => router.push({ pathname: '/agency/contact-form', params: { id: contact.id } })}
        />
        <ListRow
          title={followup ? formatDueLabel(followup, today) : 'Pas de relance prévue'}
          subtitle="Prochaine relance"
          left={<Ionicons name="calendar-outline" size={18} color={tint.fg} />}
          right={followup && followup < today ? <Badge label="En retard" color={colors.warning} /> : null}
          onPress={onPickFollowup}
          isLast={!autoTask}
        />
        {autoTask && (
          <ListRow
            title={autoTask.title}
            subtitle={autoTask.due_date ? `Tâche automatique · ${formatDueLabel(autoTask.due_date, today)}` : 'Tâche automatique'}
            left={<Ionicons name="repeat-outline" size={18} color={tint.fg} />}
            onPress={() => router.push('/tasks')}
            isLast
          />
        )}
      </CardList>
      {autoTask && (
        <CardNote>
          Relances automatiques : un mail, appel ou deck enregistré ci-dessous (ou la tâche cochée) programme la
          suivante ; un RDV les arrête. Changer la date de relance déplace la tâche.
        </CardNote>
      )}
      {stage === 'signe' && <CardNote>Deal signé : « Client actif » retire ce contact du pipeline.</CardNote>}
    </CategoryCard>
  );
}

/** Jour choisi + heure actuelle (aujourd'hui → maintenant). */
function atCurrentTime(day: DateKey, today: DateKey): string {
  if (day === today) return new Date().toISOString();
  const d = fromDateKey(day);
  const n = new Date();
  d.setHours(n.getHours(), n.getMinutes(), 0, 0);
  return d.toISOString();
}

function QuickAddInteraction({
  today,
  onAdd,
}: {
  today: DateKey;
  onAdd: (type: string, summary: string, day: DateKey) => Promise<void>;
}) {
  const { colors, spacing, radius, fontSize, categories } = useTheme();
  const [type, setType] = useState<string>('appel');
  const [summary, setSummary] = useState('');
  const [day, setDay] = useState<DateKey | null>(null);
  const [picking, setPicking] = useState(false);

  const submit = () => {
    void onAdd(type, summary.trim(), day ?? today);
    setSummary('');
    setDay(null);
  };

  return (
    // Bloc de saisie blanc sur le fond rose de la carte Interactions.
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md }}>
      <ChipRow>
        {INTERACTION_TYPES.map((t) => (
          <Chip key={t} label={TYPE_LABELS[t]} selected={type === t} onPress={() => setType(t)} />
        ))}
      </ChipRow>
      <TextInput
        value={summary}
        onChangeText={setSummary}
        placeholder="Résumé (ex. intéressé, rappeler après le match)"
        placeholderTextColor={colors.textFaint}
        multiline
        style={{
          color: colors.text,
          fontSize: fontSize.body,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.sm,
          padding: spacing.sm,
          minHeight: 44,
          textAlignVertical: 'top',
        }}
      />
      <View style={[styles.titleRow, { justifyContent: 'space-between' }]}>
        <Pressable
          onPress={() => setPicking(true)}
          hitSlop={6}
          accessibilityLabel="Choisir la date de l’interaction"
          style={[styles.titleRow, { gap: spacing.xs }]}
        >
          <Ionicons name="calendar-outline" size={18} color={categories.contacts.fg} />
          <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>{formatDueLabel(day ?? today, today)}</Text>
        </Pressable>
        <GradientButton label="Ajouter" icon="add" onPress={submit} />
      </View>
      <DatePickerSheet
        visible={picking}
        title="Date de l’interaction"
        allowNone={false}
        value={day ?? today}
        onSelect={(d) => {
          setDay(d);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
});
