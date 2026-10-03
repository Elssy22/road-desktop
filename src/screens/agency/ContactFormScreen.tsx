import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { DatePickerSheet } from '../../components/DatePickerSheet';
import { Button, CategoryCard, Chip, ChipRow, Field } from '../../components/ui';
import { updateRow } from '../../db/entityTable';
import {
  addContact,
  CONTACTS,
  getContact,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGES,
  ROLE_SUGGESTIONS,
  SEGMENT_LABELS,
  SEGMENTS,
  stageFields,
  type Contact,
  type ContactSegment,
  type PipelineStage,
} from '../../db/crmDb';
import { formatDueLabel, type DateKey } from '../../lib/dates';
import { amountToInput, parseAmount } from '../../lib/money';
import { useToday } from '../../lib/useToday';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';

type Form = {
  name: string;
  role: string;
  club: string;
  phone: string;
  email: string;
  notes: string;
  segment: ContactSegment | null;
  /** Section « Prospection » ouverte (contact dans le pipeline). */
  prospect: boolean;
  stage: PipelineStage;
  amount: string;
  followup: DateKey | null;
};

const EMPTY_FORM: Form = {
  name: '',
  role: '',
  club: '',
  phone: '',
  email: '',
  notes: '',
  segment: null,
  prospect: false,
  stage: 'a_demarcher',
  amount: '',
  followup: null,
};

const toForm = (c: Contact): Form => ({
  name: c.name,
  role: c.role,
  club: c.club ?? '',
  phone: c.phone ?? '',
  email: c.email ?? '',
  notes: c.notes ?? '',
  segment: c.segment,
  prospect: c.pipeline_stage !== null,
  stage: c.pipeline_stage ?? 'a_demarcher',
  amount: c.pipeline_amount != null ? amountToInput(c.pipeline_amount) : '',
  followup: c.next_followup_date,
});

/** Champ facultatif : chaîne vide → NULL. */
const orNull = (s: string) => (s.trim() ? s.trim() : null);

/** Création (sans `id`) ou modification d'un contact. */
export function ContactFormScreen({ userId, id }: { userId: string; id?: string }) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const { colors, spacing, radius, fontSize, categories } = useTheme();
  const tint = categories.contacts;
  const today = useToday();
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [pickingDate, setPickingDate] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(!!id);

  // Lu une seule fois à l'ouverture (une sync pendant la saisie ne l'écrase pas).
  useEffect(() => {
    if (!id) return;
    let active = true;
    getContact(db, id)
      .then((c) => {
        if (!active) return;
        setContact(c);
        if (c) setForm(toForm(c));
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      active = false;
    };
  }, [db, id]);

  const set = (key: 'name' | 'role' | 'club' | 'phone' | 'email' | 'notes') => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));

  const amount = form.amount.trim() ? parseAmount(form.amount) : null;
  const amountInvalid = form.prospect && form.amount.trim().length > 0 && amount === null;

  // En modification, rien à enregistrer si le contact a disparu entre-temps.
  const canSave = form.name.trim().length > 0 && !amountInvalid && !loading && (!id || !!contact);

  const save = async () => {
    if (!canSave) return;
    const fields = {
      name: form.name.trim(),
      role: form.role.trim(),
      club: orNull(form.club),
      phone: orNull(form.phone),
      email: orNull(form.email),
      notes: orNull(form.notes),
      segment: form.segment,
      // Section fermée = hors pipeline. Montant et relance sont conservés : ils
      // réapparaissent si le contact redevient un prospect.
      ...stageFields(contact, form.prospect ? form.stage : null),
      pipeline_amount: form.prospect ? amount : (contact?.pipeline_amount ?? null),
      next_followup_date: form.prospect ? form.followup : (contact?.next_followup_date ?? null),
    };
    await runLocal(async () => {
      if (contact) await updateRow(db, CONTACTS, contact, fields);
      else await addContact(db, userId, fields);
    });
    router.back();
  };

  const label = (text: string) => (
    <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginBottom: spacing.xs }}>{text}</Text>
  );

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Modifier le contact' : 'Nouveau contact' }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Catégorie Contacts : cartes roses (DECISIONS.md §29). */}
          <CategoryCard tint={tint} icon="person-outline" title={id ? 'Contact' : 'Nouveau contact'}>
            <View style={{ gap: spacing.md }}>
              <View>
                {label('Nom *')}
                <Field value={form.name} onChangeText={set('name')} placeholder="Prénom Nom ou nom du club" autoFocus={!id} />
              </View>
              <View>
                {label('Rôle')}
                <Field value={form.role} onChangeText={set('role')} placeholder="Créateur, Club, Coach…" />
                <View style={{ marginTop: spacing.sm }}>
                  <ChipRow>
                    {ROLE_SUGGESTIONS.map((r) => (
                      <Chip key={r} label={r} selected={form.role === r} onPress={() => set('role')(r)} />
                    ))}
                  </ChipRow>
                </View>
              </View>
              <View>
                {label('Segment')}
                <ChipRow>
                  <Chip label="Aucun" selected={form.segment === null} onPress={() => patch({ segment: null })} />
                  {SEGMENTS.map((s) => (
                    <Chip key={s} label={SEGMENT_LABELS[s]} selected={form.segment === s} onPress={() => patch({ segment: s })} />
                  ))}
                </ChipRow>
              </View>
            </View>
          </CategoryCard>
          <CategoryCard tint={tint} icon="call-outline" title="Coordonnées">
            <View style={{ gap: spacing.md }}>
              <View>
                {label('Club')}
                <Field value={form.club} onChangeText={set('club')} placeholder="Club actuel" />
              </View>
              <View>
                {label('Téléphone')}
                <Field value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="+33…" />
              </View>
              <View>
                {label('E-mail')}
                <Field
                  value={form.email}
                  onChangeText={set('email')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="nom@exemple.com"
                />
              </View>
            </View>
          </CategoryCard>
          <CategoryCard tint={tint} icon="trending-up-outline" title="Prospection">
            <View style={{ gap: spacing.md }}>
              <View style={[styles.row, { justifyContent: 'space-between', gap: spacing.md }]}>
                <Text style={{ color: colors.text, fontSize: fontSize.body, flexShrink: 1 }}>
                  Ce contact est un prospect en cours de démarchage
                </Text>
                <Switch
                  value={form.prospect}
                  onValueChange={(prospect) => patch({ prospect })}
                  trackColor={{ true: colors.primary }}
                  accessibilityLabel="Ce contact est un prospect en cours de démarchage"
                />
              </View>
              {form.prospect && (
                <>
                  <View>
                    {label('Étape')}
                    <ChipRow>
                      {PIPELINE_STAGES.map((s) => (
                        <Chip key={s} label={PIPELINE_STAGE_LABELS[s]} selected={form.stage === s} onPress={() => patch({ stage: s })} />
                      ))}
                    </ChipRow>
                  </View>
                  <View>
                    {label('Montant potentiel (€)')}
                    <Field
                      value={form.amount}
                      onChangeText={(v) => patch({ amount: v })}
                      placeholder="0,00"
                      keyboardType="decimal-pad"
                      accessibilityLabel="Montant potentiel"
                    />
                    {amountInvalid && (
                      <Text style={{ color: colors.danger, fontSize: fontSize.caption, marginTop: spacing.xs }}>
                        Montant invalide (ex. 1200 ou 1200,50).
                      </Text>
                    )}
                  </View>
                  <View>
                    {label('Prochaine relance')}
                    {/* Champ blanc à icône teintée, comme les formulaires de date clé et financier. */}
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
                        onPress={() => setPickingDate(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Choisir la date de prochaine relance"
                        style={[styles.row, styles.flex, { gap: spacing.sm, paddingVertical: spacing.md }]}
                      >
                        <Ionicons name="calendar-outline" size={18} color={tint.fg} />
                        <Text
                          numberOfLines={1}
                          style={{ flexShrink: 1, color: form.followup ? colors.text : colors.textFaint, fontSize: fontSize.body }}
                        >
                          {form.followup ? formatDueLabel(form.followup, today) : 'Pas de relance prévue'}
                        </Text>
                      </Pressable>
                      {form.followup && (
                        <Pressable onPress={() => patch({ followup: null })} hitSlop={8} accessibilityRole="button">
                          <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>Retirer</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </>
              )}
            </View>
          </CategoryCard>
          <CategoryCard tint={tint} icon="document-text-outline" title="Notes">
            <Field
              value={form.notes}
              onChangeText={set('notes')}
              multiline
              accessibilityLabel="Notes"
              placeholder="Poste, situation contractuelle, contexte…"
              style={styles.notes}
            />
          </CategoryCard>
          <Button label="Enregistrer" onPress={() => void save()} disabled={!canSave} />
        </ScrollView>
      </KeyboardAvoidingView>
      <DatePickerSheet
        visible={pickingDate}
        title="Prochaine relance"
        value={form.followup}
        onSelect={(followup) => {
          patch({ followup });
          setPickingDate(false);
        }}
        onClose={() => setPickingDate(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  notes: { minHeight: 96, textAlignVertical: 'top' },
});
