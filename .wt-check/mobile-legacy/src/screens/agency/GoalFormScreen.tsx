import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DatePickerSheet } from '../../components/DatePickerSheet';
import { ProgressBar } from '../../components/ProgressBar';
import { Button, CardNote, CategoryCard, Chip, ChipRow, Field, SegmentedControl } from '../../components/ui';
import { softDeleteRow, updateRow } from '../../db/entityTable';
import { addGoal, clampProgress, getGoal, GOALS, type Goal } from '../../db/goalsDb';
import { listProjects, type ProjectWithProgress } from '../../db/projectsDb';
import { sumQontoReceipts } from '../../db/qontoReceiptsDb';
import {
  CA_PERIODS,
  caPeriodBounds,
  caProgress,
  formatCaPeriod,
  formatEuros,
  type CaPeriod,
  type GoalKind,
} from '../../lib/caGoals';
import { formatDueLabel, type DateKey } from '../../lib/dates';
import { amountToInput, parseAmount } from '../../lib/money';
import { useToday } from '../../lib/useToday';
import { useLocalQuery } from '../../sync/useLocalQuery';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';

type Form = {
  title: string;
  target_date: DateKey | null;
  project_id: string | null;
  progress: number;
  kind: GoalKind;
  /** Montant cible saisi (texte libre, cf. parseAmount). */
  ca_amount: string;
  ca_period: CaPeriod;
};
const EMPTY_FORM: Form = {
  title: '',
  target_date: null,
  project_id: null,
  progress: 0,
  kind: 'manuel',
  ca_amount: '',
  ca_period: 'trimestre',
};
const NO_PROJECTS: ProjectWithProgress[] = [];
const PROGRESS_PRESETS = [0, 25, 50, 75, 100];
const KINDS = [
  { value: 'manuel', label: 'Manuel' },
  { value: 'ca', label: 'Chiffre d’affaires' },
] as const;

/** Création (sans `id`) ou modification d'un objectif. */
export function GoalFormScreen({ userId, id }: { userId: string; id?: string }) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const today = useToday();
  const { colors, spacing, fontSize, radius, categories } = useTheme();
  const tint = categories.goals;
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [picking, setPicking] = useState(false);

  const loadProjects = useCallback((d: SQLiteDatabase) => listProjects(d, userId), [userId]);
  const { data: projects } = useLocalQuery(loadProjects, NO_PROJECTS);
  // Projets proposés : en cours, plus celui déjà lié quel que soit son statut.
  const choices = projects.filter((p) => p.status !== 'terminé' || p.id === form.project_id);

  // Lu une seule fois à l'ouverture (une sync pendant la saisie ne l'écrase pas).
  useEffect(() => {
    if (!id) return;
    let active = true;
    getGoal(db, id)
      .then((g) => {
        if (!active) return;
        setGoal(g);
        if (g)
          setForm({
            title: g.title,
            target_date: g.target_date,
            project_id: g.project_id,
            progress: g.progress,
            kind: g.kind,
            ca_amount: g.ca_target_amount != null ? amountToInput(g.ca_target_amount) : '',
            ca_period: g.ca_period ?? 'trimestre',
          });
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      active = false;
    };
  }, [db, id]);

  // Objectif de CA : encaissé sur la période choisie, depuis la copie locale Qonto (aperçu).
  const [collectedCents, setCollectedCents] = useState<number | null>(null);
  useEffect(() => {
    if (form.kind !== 'ca' || !form.target_date) return;
    let active = true;
    const { start, end } = caPeriodBounds(form.target_date, form.ca_period);
    sumQontoReceipts(db, userId, start, end)
      .then((cents) => {
        if (active) setCollectedCents(cents);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [db, userId, form.kind, form.target_date, form.ca_period]);

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const isCa = form.kind === 'ca';
  const caAmount = parseAmount(form.ca_amount);
  const amountInvalid = isCa && form.ca_amount.trim().length > 0 && !caAmount;
  // Objectif de CA : cible > 0 et date cible obligatoires (la période se termine à cette date).
  const caReady = !isCa || (!!caAmount && !!form.target_date);
  const canSave = form.title.trim().length > 0 && caReady && !loading && (!id || !!goal);

  const save = async () => {
    if (!canSave) return;
    // progress manuel conservé tel quel pour un objectif de CA (ignoré à l'affichage),
    // pour le retrouver si l'objectif repasse en manuel.
    const fields = {
      title: form.title.trim(),
      target_date: form.target_date,
      project_id: form.project_id,
      progress: clampProgress(form.progress),
      kind: form.kind,
      ca_target_amount: isCa ? caAmount : null,
      ca_period: isCa ? form.ca_period : null,
    };
    await runLocal(async () => {
      if (goal) await updateRow(db, GOALS, goal, fields);
      else await addGoal(db, userId, fields);
    });
    router.back();
  };

  const confirmDelete = () => {
    if (!goal) return;
    Alert.alert('Supprimer cet objectif ?', goal.title || undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void runLocal(() => softDeleteRow(db, GOALS, goal));
          router.back();
        },
      },
    ]);
  };

  const label = (text: string) => (
    <Text style={{ color: colors.textMuted, fontSize: fontSize.small, marginBottom: spacing.xs }}>{text}</Text>
  );

  const step = (delta: number, icon: 'remove' | 'add', a11y: string) => (
    <Pressable
      onPress={() => patch({ progress: clampProgress(form.progress + delta) })}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => ({
        padding: spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: tint.iconBg,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={18} color={tint.fg} />
    </Pressable>
  );

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Objectif' : 'Nouvel objectif' }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Catégorie Objectifs : cartes menthe (DECISIONS.md §29). */}
          <CategoryCard tint={tint} icon="trophy-outline" title={id ? 'Objectif' : 'Nouvel objectif'}>
            <View>
              {label('Objectif *')}
              <Field
                value={form.title}
                onChangeText={(title) => patch({ title })}
                placeholder="Ex. Signer 3 nouveaux clients"
                autoFocus={!id}
              />
            </View>
            <View>
              {label('Type')}
              <SegmentedControl options={KINDS} value={form.kind} onChange={(kind) => patch({ kind })} tint={tint} />
            </View>
          </CategoryCard>

          {isCa ? (
            // Objectif de CA : cible et période à la place de l'avancement manuel.
            <CategoryCard tint={tint} icon="cash-outline" title="Chiffre d’affaires">
              <View>
                {label('Montant cible (€) *')}
                <Field
                  value={form.ca_amount}
                  onChangeText={(ca_amount) => patch({ ca_amount })}
                  placeholder="Ex. 20000"
                  keyboardType="decimal-pad"
                  accessibilityLabel="Montant cible en euros"
                />
                {amountInvalid && (
                  <Text style={{ color: colors.danger, fontSize: fontSize.caption, marginTop: spacing.xs }}>
                    Montant invalide (ex. 20000 ou 20000,50).
                  </Text>
                )}
              </View>
              <View>
                {label('Période')}
                <SegmentedControl
                  options={CA_PERIODS}
                  value={form.ca_period}
                  onChange={(ca_period) => patch({ ca_period })}
                  tint={tint}
                />
              </View>
              <CardNote tone={form.target_date ? 'muted' : 'danger'}>
                {form.target_date
                  ? `Période comptée : ${formatCaPeriod(form.target_date, form.ca_period)}.`
                  : 'Choisis une date cible : la période se termine à cette date.'}
              </CardNote>
              {form.target_date && collectedCents != null && (
                <View style={{ gap: spacing.xs }}>
                  <Text style={{ color: colors.text, fontSize: fontSize.small, fontWeight: '600' }}>
                    Encaissé : {formatEuros(collectedCents / 100)}
                    {caAmount ? ` / ${formatEuros(caAmount)} · ${caProgress(collectedCents, caAmount)} %` : ''}
                  </Text>
                  {!!caAmount && <ProgressBar value={caProgress(collectedCents, caAmount)} />}
                </View>
              )}
              <CardNote>
                Avancement calculé depuis Qonto : encaissements effectués, en euros, sur la période.
              </CardNote>
            </CategoryCard>
          ) : (
            <CategoryCard tint={tint} icon="trending-up-outline" title={`Avancement · ${form.progress} %`}>
              <View style={[styles.row, { gap: spacing.md }]}>
                {step(-10, 'remove', 'Moins 10 %')}
                <View style={styles.flex}>
                  <ProgressBar value={form.progress} />
                </View>
                {step(10, 'add', 'Plus 10 %')}
              </View>
              <ChipRow>
                {PROGRESS_PRESETS.map((p) => (
                  <Chip key={p} label={`${p} %`} selected={form.progress === p} onPress={() => patch({ progress: p })} />
                ))}
              </ChipRow>
            </CategoryCard>
          )}

          <CategoryCard tint={tint} icon="flag-outline" title="Échéance et projet">
            <View style={{ gap: spacing.md }}>
              <View>
                {label(isCa ? 'Date cible *' : 'Date cible')}
                {/* Présenté comme un champ blanc sur le fond pastel de la carte. */}
                <Pressable
                  onPress={() => setPicking(true)}
                  accessibilityRole="button"
                  style={[
                    styles.row,
                    {
                      gap: spacing.sm,
                      paddingVertical: spacing.md,
                      paddingHorizontal: spacing.md,
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderRadius: radius.md,
                    },
                  ]}
                >
                  <Ionicons name="calendar-outline" size={18} color={tint.fg} />
                  <Text style={{ color: form.target_date ? colors.text : colors.textFaint, fontSize: fontSize.body }}>
                    {form.target_date ? formatDueLabel(form.target_date, today) : 'Sans date'}
                  </Text>
                </Pressable>
              </View>

              <View>
                {label('Projet associé')}
                <ChipRow>
                  <Chip label="Aucun" selected={form.project_id === null} onPress={() => patch({ project_id: null })} />
                  {choices.map((p) => (
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
            {goal && <Button label="Supprimer l’objectif" variant="danger" onPress={confirmDelete} />}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <DatePickerSheet
        visible={picking}
        title="Date cible"
        value={form.target_date}
        onSelect={(d) => {
          patch({ target_date: d });
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
