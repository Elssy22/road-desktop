import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DatePickerSheet } from '../../components/DatePickerSheet';
import { Sheet, SheetOption } from '../../components/Sheet';
import { Button, CategoryCard, Chip, ChipRow, EmptyText, Field } from '../../components/ui';
import { listContacts, type ContactWithLast } from '../../db/crmDb';
import { softDeleteRow, updateRow } from '../../db/entityTable';
import {
  addKeyDate,
  CATEGORY_LABELS,
  getKeyDate,
  KEY_DATE_CATEGORIES,
  KEY_DATES,
  type KeyDate,
} from '../../db/keyDatesDb';
import { formatDueLabel, type DateKey } from '../../lib/dates';
import { useToday } from '../../lib/useToday';
import { useLocalQuery } from '../../sync/useLocalQuery';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';

type Form = { title: string; date: DateKey | null; category: string; contact_id: string | null; notes: string };
const EMPTY_FORM: Form = { title: '', date: null, category: 'fin_contrat', contact_id: null, notes: '' };
const NO_CONTACTS: ContactWithLast[] = [];

/** Création (sans `id`) ou modification d'une date clé. */
export function KeyDateFormScreen({ userId, id }: { userId: string; id?: string }) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const today = useToday();
  const { colors, spacing, radius, fontSize, categories } = useTheme();
  const tint = categories.keyDates;
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [keyDate, setKeyDate] = useState<KeyDate | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [picking, setPicking] = useState<'date' | 'contact' | null>(null);

  const loadContacts = useCallback((d: SQLiteDatabase) => listContacts(d, userId), [userId]);
  const { data: contacts } = useLocalQuery(loadContacts, NO_CONTACTS);
  const contactName = contacts.find((c) => c.id === form.contact_id)?.name ?? null;

  // Lu une seule fois à l'ouverture (une sync pendant la saisie ne l'écrase pas).
  useEffect(() => {
    if (!id) return;
    let active = true;
    getKeyDate(db, id)
      .then((k) => {
        if (!active) return;
        setKeyDate(k);
        if (k) {
          setForm({
            title: k.title,
            date: k.date,
            category: k.category,
            contact_id: k.contact_id,
            notes: k.notes ?? '',
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
  const canSave = form.title.trim().length > 0 && form.date != null && !loading && (!id || !!keyDate);

  const save = async () => {
    if (!canSave || !form.date) return;
    const fields = {
      title: form.title.trim(),
      date: form.date,
      category: form.category,
      contact_id: form.contact_id,
      notes: form.notes.trim() || null,
    };
    await runLocal(async () => {
      if (keyDate) await updateRow(db, KEY_DATES, keyDate, fields);
      else await addKeyDate(db, userId, fields);
    });
    router.back();
  };

  const confirmDelete = () => {
    if (!keyDate) return;
    Alert.alert('Supprimer cette date clé ?', keyDate.title || undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void runLocal(() => softDeleteRow(db, KEY_DATES, keyDate));
          router.back();
        },
      },
    ]);
  };

  const label = (text: string) => (
    <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginBottom: spacing.xs }}>{text}</Text>
  );

  const pickerRow = (
    icon: 'calendar-outline' | 'person-outline',
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
      {onClear && (
        <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>Retirer</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Date clé' : 'Nouvelle date clé' }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Catégorie Échéances clés : cartes beurre (DECISIONS.md §29). */}
          <CategoryCard tint={tint} icon="hourglass-outline" title={id ? 'Date clé' : 'Nouvelle date clé'}>
            <View style={{ gap: spacing.md }}>
              <View>
                {label('Intitulé *')}
                <Field
                  value={form.title}
                  onChangeText={(title) => patch({ title })}
                  placeholder="Ex. Fin de contrat de X avec Y"
                  autoFocus={!id}
                />
              </View>
              <View>
                {label('Date *')}
                {pickerRow(
                  'calendar-outline',
                  form.date ? formatDueLabel(form.date, today) : null,
                  'Choisir une date',
                  () => setPicking('date')
                )}
              </View>
              <View>
                {label('Catégorie')}
                <ChipRow>
                  {KEY_DATE_CATEGORIES.map((c) => (
                    <Chip key={c} label={CATEGORY_LABELS[c]} selected={form.category === c} onPress={() => patch({ category: c })} />
                  ))}
                </ChipRow>
              </View>
            </View>
          </CategoryCard>
          <CategoryCard tint={tint} icon="link-outline" title="Contact et notes">
            <View style={{ gap: spacing.md }}>
              <View>
                {label('Contact lié')}
                {pickerRow(
                  'person-outline',
                  contactName,
                  'Aucun',
                  () => setPicking('contact'),
                  form.contact_id ? () => patch({ contact_id: null }) : undefined
                )}
              </View>
              <View>
                {label('Notes')}
                <Field
                  value={form.notes}
                  onChangeText={(notes) => patch({ notes })}
                  multiline
                  placeholder="Clauses, options, interlocuteurs…"
                  style={styles.notes}
                />
              </View>
            </View>
          </CategoryCard>
          <View style={{ gap: spacing.sm }}>
            <Button label="Enregistrer" onPress={() => void save()} disabled={!canSave} />
            {keyDate && <Button label="Supprimer la date clé" variant="danger" onPress={confirmDelete} />}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <DatePickerSheet
        visible={picking === 'date'}
        title="Date clé"
        allowNone={false}
        value={form.date}
        onSelect={(d) => {
          patch({ date: d });
          setPicking(null);
        }}
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
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  notes: { minHeight: 96, textAlignVertical: 'top' },
});
