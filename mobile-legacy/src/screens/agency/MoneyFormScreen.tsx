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
  addMoneyItem,
  CURRENCIES,
  getMoneyItem,
  KIND_LABELS,
  MONEY_ITEMS,
  MONEY_KINDS,
  MONEY_STATUS_LABELS,
  type MoneyItem,
} from '../../db/moneyDb';
import { listProjects, type ProjectWithProgress } from '../../db/projectsDb';
import { formatDueLabel, type DateKey } from '../../lib/dates';
import { amountToInput, parseAmount } from '../../lib/money';
import { useToday } from '../../lib/useToday';
import { useLocalQuery } from '../../sync/useLocalQuery';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';

type Form = {
  label: string;
  amount: string;
  currency: string;
  kind: string;
  status: string;
  due_date: DateKey | null;
  contact_id: string | null;
  project_id: string | null;
};
const EMPTY_FORM: Form = {
  label: '',
  amount: '',
  currency: 'EUR',
  kind: 'commission_attendue',
  status: 'en_attente',
  due_date: null,
  contact_id: null,
  project_id: null,
};
/** Ordre de saisie (la liste, elle, montre « En retard » en premier). */
const FORM_STATUSES = ['en_attente', 'payé', 'en_retard'];
const NO_CONTACTS: ContactWithLast[] = [];
const NO_PROJECTS: ProjectWithProgress[] = [];

/** Création (sans `id`) ou modification d'une ligne du suivi financier. */
export function MoneyFormScreen({ userId, id }: { userId: string; id?: string }) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const today = useToday();
  const { colors, spacing, radius, fontSize, categories } = useTheme();
  const tint = categories.finance;
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [item, setItem] = useState<MoneyItem | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [picking, setPicking] = useState<'date' | 'contact' | null>(null);

  const loadContacts = useCallback((d: SQLiteDatabase) => listContacts(d, userId), [userId]);
  const { data: contacts } = useLocalQuery(loadContacts, NO_CONTACTS);
  const contactName = contacts.find((c) => c.id === form.contact_id)?.name ?? null;
  const loadProjects = useCallback((d: SQLiteDatabase) => listProjects(d, userId), [userId]);
  const { data: projects } = useLocalQuery(loadProjects, NO_PROJECTS);
  // Projets proposés : en cours, plus celui déjà lié quel que soit son statut.
  const projectChoices = projects.filter((p) => p.status !== 'terminé' || p.id === form.project_id);

  // Lu une seule fois à l'ouverture (une sync pendant la saisie ne l'écrase pas).
  useEffect(() => {
    if (!id) return;
    let active = true;
    getMoneyItem(db, id)
      .then((m) => {
        if (!active) return;
        setItem(m);
        if (m) {
          setForm({
            label: m.label,
            amount: amountToInput(m.amount),
            currency: m.currency,
            kind: m.kind,
            status: m.status,
            due_date: m.due_date,
            contact_id: m.contact_id,
            project_id: m.project_id,
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
  const amount = parseAmount(form.amount);
  const amountInvalid = form.amount.trim() !== '' && amount === null;
  const canSave = form.label.trim().length > 0 && amount !== null && !loading && (!id || !!item);

  const save = async () => {
    if (!canSave || amount === null) return;
    const fields = { ...form, label: form.label.trim(), amount };
    await runLocal(async () => {
      if (item) await updateRow(db, MONEY_ITEMS, item, fields);
      else await addMoneyItem(db, userId, fields);
    });
    router.back();
  };

  const confirmDelete = () => {
    if (!item) return;
    Alert.alert('Supprimer cette ligne ?', item.label || undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void runLocal(() => softDeleteRow(db, MONEY_ITEMS, item));
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
      <Stack.Screen options={{ title: id ? 'Ligne financière' : 'Nouvelle ligne' }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Catégorie Finances : cartes lavande (DECISIONS.md §30). */}
          <CategoryCard tint={tint} icon="wallet-outline" title={id ? 'Ligne financière' : 'Nouvelle ligne'}>
            <View style={{ gap: spacing.md }}>
              <View>
                {label('Libellé *')}
                <Field
                  value={form.label}
                  onChangeText={(v) => patch({ label: v })}
                  placeholder="Ex. Commission partenariat marque"
                  autoFocus={!id}
                />
              </View>

              <View>
                {label('Montant *')}
                <Field
                  value={form.amount}
                  onChangeText={(v) => patch({ amount: v })}
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                  accessibilityLabel="Montant"
                />
                {amountInvalid && (
                  <Text style={{ color: colors.danger, fontSize: fontSize.caption, marginTop: spacing.xs }}>
                    Montant invalide (ex. 1200 ou 1200,50).
                  </Text>
                )}
                <View style={{ marginTop: spacing.sm }}>
                  <ChipRow>
                    {[...new Set([...CURRENCIES, form.currency])].map((c) => (
                      <Chip key={c} label={c} selected={form.currency === c} onPress={() => patch({ currency: c })} />
                    ))}
                  </ChipRow>
                </View>
              </View>
            </View>
          </CategoryCard>

          <CategoryCard tint={tint} icon="pricetags-outline" title="Type et statut">
            <View style={{ gap: spacing.md }}>
              <View>
                {label('Type')}
                <ChipRow>
                  {MONEY_KINDS.map((k) => (
                    <Chip
                      key={k}
                      label={KIND_LABELS[k]}
                      selected={form.kind === k}
                      // Un paiement reçu est, par définition, payé.
                      onPress={() => patch(k === 'paiement_recu' ? { kind: k, status: 'payé' } : { kind: k })}
                    />
                  ))}
                </ChipRow>
              </View>

              <View>
                {label('Statut')}
                <ChipRow>
                  {FORM_STATUSES.map((s) => (
                    <Chip key={s} label={MONEY_STATUS_LABELS[s]} selected={form.status === s} onPress={() => patch({ status: s })} />
                  ))}
                </ChipRow>
              </View>

              <View>
                {label('Échéance')}
                {pickerRow(
                  'calendar-outline',
                  form.due_date ? formatDueLabel(form.due_date, today) : null,
                  'Sans échéance',
                  () => setPicking('date'),
                  form.due_date ? () => patch({ due_date: null }) : undefined
                )}
              </View>
            </View>
          </CategoryCard>

          <CategoryCard tint={tint} icon="link-outline" title="Contact et projet">
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
                {label('Projet lié')}
                <ChipRow>
                  <Chip label="Aucun" selected={form.project_id === null} onPress={() => patch({ project_id: null })} />
                  {projectChoices.map((p) => (
                    <Chip
                      key={p.id}
                      label={p.title || 'Sans titre'}
                      selected={form.project_id === p.id}
                      onPress={() => patch({ project_id: p.id })}
                    />
                  ))}
                </ChipRow>
              </View>
            </View>
          </CategoryCard>

          <View style={{ gap: spacing.sm }}>
            <Button label="Enregistrer" onPress={() => void save()} disabled={!canSave} />
            {item && <Button label="Supprimer la ligne" variant="danger" onPress={confirmDelete} />}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <DatePickerSheet
        visible={picking === 'date'}
        title="Échéance"
        value={form.due_date}
        onSelect={(d) => {
          patch({ due_date: d });
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
});
