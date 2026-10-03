import Ionicons from '@expo/vector-icons/Ionicons';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '../components/ProgressBar';
import { CardList, CardNote, CategoryCard, Field, ListRow, Panel } from '../components/ui';
import { listGoals, type GoalWithProject } from '../db/goalsDb';
import { listKeyDatesBetween, type KeyDateWithContact } from '../db/keyDatesDb';
import type { Task } from '../db/localDb';
import { listProjects, type ProjectWithProgress } from '../db/projectsDb';
import {
  EMPTY_REVIEW,
  getWeeklyReview,
  listOverdueTasks,
  listTasksDoneBetween,
  saveWeeklyReview,
  type WeeklyReviewText,
} from '../db/weeklyReviewDb';
import { addDays, formatDueLabel, formatLongDate, startOfWeek, type DateKey } from '../lib/dates';
import { useToday } from '../lib/useToday';
import { useLocalQuery } from '../sync/useLocalQuery';
import { useTheme } from '../theme/ThemeProvider';

const SAVE_DEBOUNCE_MS = 600;

type Overview = {
  done: Task[];
  overdue: Task[];
  projects: ProjectWithProgress[];
  goals: GoalWithProject[];
  nextWeekDates: KeyDateWithContact[];
};
const EMPTY: Overview = { done: [], overdue: [], projects: [], goals: [], nextWeekDates: [] };

/**
 * Revue de la semaine : lecture agrégée des données existantes, puis trois
 * champs libres enregistrés en local. On peut revenir sur les semaines passées
 * (utile pour faire la revue le lundi matin).
 */
export function WeeklyReviewScreen({ userId }: { userId: string }) {
  const today = useToday();
  const currentWeek = startOfWeek(today);
  const [week, setWeek] = useState<DateKey>(currentWeek);
  const { colors, spacing, typography, categories } = useTheme();
  const nextWeek = addDays(week, 7);

  const load = useCallback(
    async (db: SQLiteDatabase): Promise<Overview> => ({
      done: await listTasksDoneBetween(db, userId, week, nextWeek),
      // En retard / projets / objectifs : l'état actuel, quelle que soit la semaine revue.
      overdue: await listOverdueTasks(db, userId, today),
      projects: (await listProjects(db, userId)).filter((p) => p.status === 'actif'),
      goals: await listGoals(db, userId),
      nextWeekDates: await listKeyDatesBetween(db, userId, nextWeek, addDays(nextWeek, 6)),
    }),
    [userId, week, nextWeek, today]
  );
  const { data } = useLocalQuery(load, EMPTY);

  const arrow = (icon: 'chevron-back' | 'chevron-forward', label: string, target: DateKey, disabled = false) => (
    <Pressable
      onPress={() => setWeek(target)}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ padding: spacing.xs, opacity: disabled ? 0.25 : pressed ? 0.5 : 1 })}
    >
      <Ionicons name={icon} size={22} color={colors.primary} />
    </Pressable>
  );

  const weekTitle =
    week === currentWeek ? 'Cette semaine' : week === addDays(currentWeek, -7) ? 'Semaine dernière' : 'Semaine';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Panel style={[styles.row, { justifyContent: 'space-between', padding: spacing.md, marginBottom: spacing.lg }]}>
          {arrow('chevron-back', 'Semaine précédente', addDays(week, -7))}
          <View style={styles.center}>
            <Text style={[typography.heading, { color: colors.text }]}>{weekTitle}</Text>
            <Text style={[typography.small, { color: colors.textMuted }]}>
              du {formatLongDate(week)} au {formatLongDate(addDays(week, 6))}
            </Text>
          </View>
          {arrow('chevron-forward', 'Semaine suivante', addDays(week, 7), week >= currentWeek)}
        </Panel>

        <CategoryCard tint={categories.tasks} icon="checkmark-done-outline" title="Tâches terminées" count={data.done.length}>
          {data.done.length === 0 ? (
            <CardNote>Aucune tâche cochée sur cette semaine.</CardNote>
          ) : (
            <CardList>
              {data.done.map((t, i) => (
                <ListRow
                  key={t.id}
                  title={t.title}
                  left={<Ionicons name="checkmark-circle" size={20} color={categories.tasks.fg} />}
                  isLast={i === data.done.length - 1}
                />
              ))}
            </CardList>
          )}
        </CategoryCard>

        <CategoryCard tint={categories.tasks} icon="alert-circle-outline" title="Tâches en retard" count={data.overdue.length}>
          {data.overdue.length === 0 ? (
            <CardNote>Rien en retard.</CardNote>
          ) : (
            <CardList>
              {data.overdue.map((t, i) => (
                <ListRow
                  key={t.id}
                  title={t.title}
                  right={
                    <Text style={[typography.caption, { color: colors.danger }]}>
                      {t.due_date ? formatDueLabel(t.due_date, today) : ''}
                    </Text>
                  }
                  isLast={i === data.overdue.length - 1}
                />
              ))}
            </CardList>
          )}
        </CategoryCard>

        <CategoryCard tint={categories.projects} icon="git-branch-outline" title="Projets actifs" count={data.projects.length}>
          {data.projects.length === 0 ? (
            <CardNote>Aucun projet actif.</CardNote>
          ) : (
            <CardList>
              {data.projects.map((p, i) => (
                <ProgressLine
                  key={p.id}
                  title={p.title || 'Sans titre'}
                  value={p.steps_total > 0 ? (p.steps_done / p.steps_total) * 100 : 0}
                  label={p.steps_total > 0 ? `${p.steps_done}/${p.steps_total} étapes` : 'Aucune étape'}
                  isLast={i === data.projects.length - 1}
                />
              ))}
            </CardList>
          )}
        </CategoryCard>

        <CategoryCard tint={categories.goals} icon="flag-outline" title="Objectifs" count={data.goals.length}>
          {data.goals.length === 0 ? (
            <CardNote>Aucun objectif.</CardNote>
          ) : (
            <CardList>
              {data.goals.map((g, i) => (
                <ProgressLine
                  key={g.id}
                  title={g.title || 'Sans titre'}
                  value={g.progress}
                  label={`${g.progress} %${g.target_date ? ` · cible ${formatDueLabel(g.target_date, today)}` : ''}`}
                  isLast={i === data.goals.length - 1}
                />
              ))}
            </CardList>
          )}
        </CategoryCard>

        <CategoryCard
          tint={categories.keyDates}
          icon="hourglass-outline"
          title="Échéances semaine suivante"
          count={data.nextWeekDates.length}
        >
          {data.nextWeekDates.length === 0 ? (
            <CardNote>
              Aucune échéance du {formatLongDate(nextWeek)} au {formatLongDate(addDays(nextWeek, 6))}.
            </CardNote>
          ) : (
            <CardList>
              {data.nextWeekDates.map((k, i) => (
                <ListRow
                  key={k.id}
                  title={k.title || 'Sans titre'}
                  subtitle={k.contact_name}
                  right={
                    <Text style={[typography.caption, { color: colors.textMuted }]}>
                      {formatDueLabel(k.date, today)}
                    </Text>
                  }
                  isLast={i === data.nextWeekDates.length - 1}
                />
              ))}
            </CardList>
          )}
        </CategoryCard>

        {/* Remonté à chaque changement de semaine : on relit le bilan de la semaine affichée. */}
        <ReviewNotes key={week} userId={userId} week={week} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ProgressLine({ title, value, label, isLast }: { title: string; value: number; label: string; isLast: boolean }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View
      style={{
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        gap: spacing.xs,
        borderBottomColor: colors.border,
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
      }}
    >
      <View style={[styles.row, { gap: spacing.md }]}>
        <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: fontSize.body }}>
          {title}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.caption }}>{label}</Text>
      </View>
      <ProgressBar value={value} />
    </View>
  );
}

const FIELDS: { key: keyof WeeklyReviewText; title: string; placeholder: string }[] = [
  { key: 'done_text', title: 'Ce qui a été fait', placeholder: 'Signatures, livrables, rendez-vous marquants…' },
  { key: 'slipping_text', title: 'Ce qui glisse', placeholder: 'Ce qui prend du retard, et pourquoi' },
  { key: 'next_priority_text', title: 'Priorité de la semaine prochaine', placeholder: 'La chose la plus importante' },
];

/**
 * Bilan libre, enregistré en local (pas de sync) : sauvegarde automatique
 * après la frappe et à la sortie de l'écran, comme l'éditeur de notes.
 */
function ReviewNotes({ userId, week }: { userId: string; week: DateKey }) {
  const db = useSQLiteContext();
  const { colors, spacing, typography } = useTheme();
  const [review, setReview] = useState<WeeklyReviewText>(EMPTY_REVIEW);
  const [loaded, setLoaded] = useState(false);
  const draftRef = useRef<WeeklyReviewText | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    getWeeklyReview(db, userId, week)
      .then((r) => {
        if (!active) return;
        setReview(r);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      active = false;
    };
  }, [db, userId, week]);

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const draft = draftRef.current;
    if (!draft) return;
    draftRef.current = null;
    void saveWeeklyReview(db, userId, week, draft);
  }, [db, userId, week]);

  useEffect(() => () => flush(), [flush]);

  const update = (key: keyof WeeklyReviewText, text: string) => {
    const next = { ...review, [key]: text };
    setReview(next);
    draftRef.current = next;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  };

  return (
    <CategoryCard tint={colors.tints.lavender} icon="create-outline" title="Bilan">
      <View style={{ gap: spacing.lg }}>
        {FIELDS.map((f) => (
          <View key={f.key}>
            <Text style={[typography.small, { color: colors.text, fontWeight: '600', marginBottom: spacing.xs }]}>
              {f.title}
            </Text>
            <Field
              value={review[f.key]}
              onChangeText={(t) => update(f.key, t)}
              onBlur={flush}
              editable={loaded}
              multiline
              placeholder={f.placeholder}
              style={styles.notes}
            />
          </View>
        ))}
        <CardNote>Enregistré automatiquement sur cet appareil.</CardNote>
      </View>
    </CategoryCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center', flex: 1 },
  notes: { minHeight: 88, textAlignVertical: 'top' },
});
