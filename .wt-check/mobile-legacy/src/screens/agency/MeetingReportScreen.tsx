import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { DatePickerSheet } from '../../components/DatePickerSheet';
import { Sheet, SheetOption } from '../../components/Sheet';
import { Button, CardList, CardNote, CategoryCard, EmptyText, Field, Panel, TextAction } from '../../components/ui';
import { listContacts, type ContactWithLast } from '../../db/crmDb';
import { saveMeetingReport } from '../../db/meetingReportDb';
import { formatDueLabel, formatLongDate, type DateKey } from '../../lib/dates';
import { meetingNoteBody, meetingNoteTitle, summarizeMeeting } from '../../lib/meetingSummary';
import { useToday } from '../../lib/useToday';
import { useLocalQuery } from '../../sync/useLocalQuery';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';

type EditableTask = { key: string; title: string; due_date: DateKey | null; checked: boolean };
type Result = { summary: string; tasks: EditableTask[] };

const NO_CONTACTS: ContactWithLast[] = [];
/** Longueur max du résumé recopié dans l'historique du contact (le CR complet est dans Notes). */
const INTERACTION_SUMMARY_MAX = 280;
const DRAFT_SAVE_DELAY_MS = 600;

// Brouillon des notes brutes conservé localement (kv-store) : une dictée longue
// survit à une erreur IA, à un retour arrière ou à la fermeture de l'app.
const draftKey = (userId: string) => `meeting_draft:${userId}`;

/**
 * Compte-rendu de RDV : notes libres (dictée du clavier) → résumé + tâches
 * suggérées par l'IA → validation explicite avant toute écriture.
 */
export function MeetingReportScreen({ userId, contactId }: { userId: string; contactId?: string }) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const today = useToday();
  const { colors, spacing, radius, fontSize, categories } = useTheme();
  const tint = categories.tasks;

  const [notes, setNotes] = useState(() => Storage.getItemSync(draftKey(userId)) ?? '');
  const [selectedContact, setSelectedContact] = useState<string | null>(contactId ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [addToHistory, setAddToHistory] = useState(true);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState<'contact' | { taskKey: string } | null>(null);

  const loadContacts = useCallback((d: SQLiteDatabase) => listContacts(d, userId), [userId]);
  const { data: contacts } = useLocalQuery(loadContacts, NO_CONTACTS);
  const contact = contacts.find((c) => c.id === selectedContact) ?? null;

  // Sauvegarde du brouillon après la frappe (et à la sortie de l'écran).
  const notesRef = useRef(notes);
  const changeNotes = (text: string) => {
    notesRef.current = text;
    setNotes(text);
  };
  useEffect(() => {
    const t = setTimeout(() => void Storage.setItemAsync(draftKey(userId), notes), DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [notes, userId]);
  useEffect(() => () => void Storage.setItemAsync(draftKey(userId), notesRef.current), [userId]);

  const summarize = async () => {
    const text = notes.trim();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await summarizeMeeting(text, today);
      setResult({
        summary: r.summary,
        tasks: r.suggested_tasks.map((t, i) => ({ key: `${i}`, ...t, checked: true })),
      });
    } catch (e) {
      // Les notes restent dans le champ (et dans le brouillon) : rien n'est perdu.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const patchTask = (key: string, p: Partial<EditableTask>) =>
    setResult((r) => r && { ...r, tasks: r.tasks.map((t) => (t.key === key ? { ...t, ...p } : t)) });

  const checkedTasks = result?.tasks.filter((t) => t.checked && t.title.trim()) ?? [];
  const canSave = !!result && result.summary.trim().length > 0 && !saving && !loading;

  const save = async () => {
    if (!result || !canSave) return;
    setSaving(true);
    const summary = result.summary.trim();
    try {
      await runLocal(() =>
        saveMeetingReport(db, userId, {
          noteTitle: meetingNoteTitle(formatLongDate(today), contact?.name ?? null),
          noteBody: meetingNoteBody(summary, notes),
          tasks: checkedTasks.map((t) => ({ title: t.title.trim(), due_date: t.due_date })),
          interaction:
            contact && addToHistory
              ? {
                  contact_id: contact.id,
                  summary:
                    summary.length > INTERACTION_SUMMARY_MAX
                      ? `${summary.slice(0, INTERACTION_SUMMARY_MAX - 1).trimEnd()}…`
                      : summary,
                }
              : null,
        })
      );
    } catch (e) {
      setSaving(false);
      Alert.alert('Enregistrement impossible', e instanceof Error ? e.message : String(e));
      return;
    }
    notesRef.current = '';
    await Storage.removeItemAsync(draftKey(userId));
    const n = checkedTasks.length;
    Alert.alert(
      'Compte-rendu enregistré',
      `Note créée dans l’onglet Notes${n > 0 ? ` · ${n} tâche${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}` : ''}.`
    );
    router.back();
  };

  const confirmClear = () =>
    Alert.alert('Effacer les notes ?', 'Le texte saisi et le résumé seront perdus.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Effacer',
        style: 'destructive',
        onPress: () => {
          changeNotes('');
          setResult(null);
          setError(null);
        },
      },
    ]);

  const label = (text: string) => (
    <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginBottom: spacing.xs }}>{text}</Text>
  );

  const pickingTask = picking && typeof picking === 'object' ? result?.tasks.find((t) => t.key === picking.taskKey) : null;

  return (
    <>
      <Stack.Screen options={{ title: 'Compte-rendu de RDV' }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Produit des tâches : cartes pêche, comme sa carte du menu Agence (DECISIONS.md §29-30). */}
          <CategoryCard
            tint={tint}
            icon="document-text-outline"
            title="Notes du RDV"
            action={
              notes.length > 0 && !loading ? (
                <TextAction label="Effacer" tint={tint} accessibilityLabel="Effacer les notes" onPress={confirmClear} />
              ) : undefined
            }
          >
            <View style={{ gap: spacing.md }}>
              <View>
                {label('Contact (facultatif)')}
                {/* Présenté comme un champ blanc sur le fond pastel de la carte. */}
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
                    onPress={() => setPicking('contact')}
                    accessibilityRole="button"
                    style={[styles.row, styles.flex, { gap: spacing.sm, paddingVertical: spacing.md }]}
                  >
                    <Ionicons name="person-outline" size={18} color={tint.fg} />
                    <Text
                      numberOfLines={1}
                      style={{ flexShrink: 1, color: contact ? colors.text : colors.textFaint, fontSize: fontSize.body }}
                    >
                      {contact?.name ?? 'Aucun'}
                    </Text>
                  </Pressable>
                  {selectedContact && (
                    <Pressable onPress={() => setSelectedContact(null)} hitSlop={8} accessibilityRole="button">
                      <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>Retirer</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              <View>
                {label('Notes du RDV')}
                <Field
                  value={notes}
                  onChangeText={changeNotes}
                  multiline
                  editable={!loading}
                  placeholder="Tape ou dicte (micro du clavier) : qui, quoi, décisions, prochaines étapes…"
                  style={styles.notes}
                  autoFocus={!notes}
                />
              </View>
              <CardNote>
                Brouillon conservé sur l’appareil. Le texte est envoyé à un service d’IA externe (OpenRouter) pour le
                résumé ; rien n’est enregistré sans ta validation.
              </CardNote>
            </View>
          </CategoryCard>

          {/* Les cartes portent leur marge basse : les autres blocs prennent la même. */}
          <View style={{ marginBottom: spacing.lg }}>
            {loading ? (
              <View style={[styles.row, { gap: spacing.sm, justifyContent: 'center', paddingVertical: spacing.md }]}>
                <ActivityIndicator color={colors.primary} />
                <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>Résumé en cours…</Text>
              </View>
            ) : (
              <Button
                label={result ? 'Relancer le résumé' : 'Résumer et extraire les tâches'}
                variant={result ? 'secondary' : 'primary'}
                onPress={() => void summarize()}
                disabled={!notes.trim()}
              />
            )}
          </View>

          {error && (
            <Panel
              style={{ padding: spacing.lg, borderWidth: 1, borderColor: colors.danger, gap: spacing.xs, marginBottom: spacing.lg }}
            >
              <View style={[styles.row, { gap: spacing.sm }]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
                <Text style={{ color: colors.danger, fontWeight: '600', fontSize: fontSize.small }}>
                  Le résumé a échoué
                </Text>
              </View>
              <Text style={{ color: colors.text, fontSize: fontSize.small }}>{error}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.caption }}>
                Tes notes sont intactes. Tu peux réessayer, ou les garder et revenir plus tard.
              </Text>
            </Panel>
          )}

          {result && (
            <>
              <CategoryCard tint={tint} icon="sparkles-outline" title="Résumé">
                <Field
                  value={result.summary}
                  onChangeText={(summary) => setResult((r) => r && { ...r, summary })}
                  multiline
                  style={styles.summary}
                />
              </CategoryCard>

              <CategoryCard
                tint={tint}
                icon="checkbox-outline"
                title={result.tasks.length ? `Tâches suggérées · ${checkedTasks.length}/${result.tasks.length}` : 'Tâches suggérées'}
              >
                {result.tasks.length === 0 ? (
                  <CardNote>Aucune action identifiée dans les notes.</CardNote>
                ) : (
                  <CardList>
                    {result.tasks.map((t, i) => (
                      <View
                        key={t.key}
                        style={[
                          styles.row,
                          {
                            gap: spacing.sm,
                            paddingVertical: spacing.sm,
                            paddingHorizontal: spacing.md,
                            borderBottomColor: colors.border,
                            borderBottomWidth: i === result.tasks.length - 1 ? 0 : StyleSheet.hairlineWidth,
                          },
                        ]}
                      >
                        <Pressable
                          onPress={() => patchTask(t.key, { checked: !t.checked })}
                          hitSlop={8}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: t.checked }}
                          accessibilityLabel={`Créer la tâche ${t.title}`}
                        >
                          <Ionicons
                            name={t.checked ? 'checkbox' : 'square-outline'}
                            size={24}
                            color={t.checked ? colors.primary : colors.textFaint}
                          />
                        </Pressable>
                        <View style={styles.flex}>
                          <TextInput
                            value={t.title}
                            onChangeText={(title) => patchTask(t.key, { title })}
                            multiline
                            style={{
                              color: t.checked ? colors.text : colors.textFaint,
                              fontSize: fontSize.body,
                              paddingVertical: 2,
                            }}
                          />
                          <Pressable
                            onPress={() => setPicking({ taskKey: t.key })}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel="Choisir l’échéance"
                            style={[
                              styles.row,
                              {
                                gap: spacing.xs,
                                alignSelf: 'flex-start',
                                marginTop: 2,
                                paddingHorizontal: spacing.xs,
                                borderRadius: radius.sm,
                              },
                            ]}
                          >
                            <Ionicons name="calendar-outline" size={14} color={tint.fg} />
                            <Text style={{ color: colors.textMuted, fontSize: fontSize.caption }}>
                              {t.due_date ? formatDueLabel(t.due_date, today) : 'Sans échéance'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </CardList>
                )}
              </CategoryCard>

              {contact && (
                <Pressable
                  onPress={() => setAddToHistory((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: addToHistory }}
                  style={[styles.row, { gap: spacing.sm, marginBottom: spacing.lg }]}
                >
                  <Ionicons
                    name={addToHistory ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={addToHistory ? colors.primary : colors.textFaint}
                  />
                  <Text style={{ color: colors.text, fontSize: fontSize.small, flexShrink: 1 }}>
                    Ajouter aussi à l’historique de {contact.name} (interaction « RDV »)
                  </Text>
                </Pressable>
              )}

              <Button
                label={
                  saving
                    ? 'Enregistrement…'
                    : checkedTasks.length > 0
                      ? `Enregistrer (note + ${checkedTasks.length} tâche${checkedTasks.length > 1 ? 's' : ''})`
                      : 'Enregistrer la note'
                }
                onPress={() => void save()}
                disabled={!canSave}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={picking === 'contact'} onClose={() => setPicking(null)} title="Contact du RDV">
        {contacts.length === 0 ? (
          <EmptyText>Aucun contact. Ajoute-en depuis la section Contacts.</EmptyText>
        ) : (
          <ScrollView style={{ maxHeight: 360 }}>
            {contacts.map((c) => (
              <SheetOption
                key={c.id}
                label={c.club ? `${c.name} · ${c.club}` : c.name}
                selected={selectedContact === c.id}
                onPress={() => {
                  setSelectedContact(c.id);
                  setPicking(null);
                }}
              />
            ))}
          </ScrollView>
        )}
      </Sheet>
      <DatePickerSheet
        visible={!!pickingTask}
        title="Échéance de la tâche"
        value={pickingTask?.due_date ?? null}
        onSelect={(d) => {
          if (pickingTask) patchTask(pickingTask.key, { due_date: d });
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  notes: { minHeight: 200, textAlignVertical: 'top' },
  summary: { minHeight: 140, textAlignVertical: 'top' },
});
