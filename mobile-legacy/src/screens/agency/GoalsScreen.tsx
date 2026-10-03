import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '../../components/ProgressBar';
import { CardNote, CardSectionFooter, CardSectionHeader, CardSectionItem, CategoryCard } from '../../components/ui';
import { hasCaGoals, isCaGoal, listGoals, type GoalWithProject } from '../../db/goalsDb';
import { qontoReceiptsRefreshedAt, refreshQontoReceipts } from '../../db/qontoReceiptsDb';
import { formatCaPeriod, formatEuros } from '../../lib/caGoals';
import { formatDueLabel, formatEditedLabel } from '../../lib/dates';
import { useToday } from '../../lib/useToday';
import { useLocalQuery } from '../../sync/useLocalQuery';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';

const EMPTY: GoalWithProject[] = [];

export function GoalsScreen({ userId }: { userId: string }) {
  const db = useSQLiteContext();
  const { syncing, syncNow, runLocal } = useSync();
  const today = useToday();
  const { colors, spacing, categories } = useTheme();
  const tint = categories.goals;
  // Dernière copie réussie des encaissements sur cet appareil (null : jamais).
  const [receiptsAt, setReceiptsAt] = useState<string | null>(null);
  const load = useCallback((d: SQLiteDatabase) => listGoals(d, userId), [userId]);
  const { data: goals } = useLocalQuery(load, EMPTY);

  // Objectifs de CA : relit les encaissements Qonto à chaque ouverture de l'écran (après une
  // synchro faite depuis Finances, par exemple). runLocal relance ensuite les lectures
  // locales, donc le calcul. Hors ligne, la dernière copie locale sert.
  const refreshReceipts = useCallback(async () => {
    if (await hasCaGoals(db, userId)) {
      await runLocal(() => refreshQontoReceipts(db, userId)).catch(() => undefined);
    }
    setReceiptsAt(await qontoReceiptsRefreshedAt(db, userId));
  }, [db, userId, runLocal]);

  useFocusEffect(
    useCallback(() => {
      void refreshReceipts().catch(() => undefined);
    }, [refreshReceipts])
  );

  const onRefresh = () => {
    void syncNow();
    void refreshReceipts().catch(() => undefined);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/agency/goal-form')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Nouvel objectif"
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingHorizontal: spacing.sm })}
            >
              <Ionicons name="add" size={24} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      {/* Catégorie Objectifs : la liste est une carte menthe (DECISIONS.md §29). */}
      <FlatList
        data={goals}
        keyExtractor={(g) => g.id}
        refreshing={syncing}
        onRefresh={onRefresh}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
        ListHeaderComponent={
          goals.length > 0 ? (
            <CardSectionHeader tint={tint} icon="trophy-outline" title="Objectifs" count={goals.length} />
          ) : null
        }
        ListFooterComponent={goals.length > 0 ? <CardSectionFooter tint={tint} /> : null}
        ListEmptyComponent={
          <View style={{ marginTop: spacing.lg }}>
            <CategoryCard tint={tint} icon="trophy-outline" title="Objectifs">
              <CardNote>Aucun objectif. Ajoute-en un avec le bouton +.</CardNote>
            </CategoryCard>
          </View>
        }
        renderItem={({ item, index }) => {
          const last = index === goals.length - 1;
          return (
            <CardSectionItem tint={tint} first={index === 0} last={last}>
              <GoalRow goal={item} today={today} receiptsAt={receiptsAt} isLast={last} />
            </CardSectionItem>
          );
        }}
      />
    </>
  );
}

function GoalRow({
  goal,
  today,
  receiptsAt,
  isLast,
}: {
  goal: GoalWithProject;
  today: string;
  receiptsAt: string | null;
  isLast: boolean;
}) {
  const { colors, spacing, fontSize, categories } = useTheme();
  // Le projet lié prend l'encre de sa catégorie (Projets, ciel).
  const projectInk = categories.projects.fg;
  const reached = goal.progress >= 100;
  const late = !reached && goal.target_date != null && goal.target_date < today;
  const ca = isCaGoal(goal) && goal.ca_collected_cents != null ? goal : null;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/agency/goal-form', params: { id: goal.id } })}
      style={({ pressed }) => ({
        padding: spacing.lg,
        gap: spacing.sm,
        borderBottomColor: colors.border,
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
      })}
    >
      <View style={[styles.row, { gap: spacing.md }]}>
        <Text numberOfLines={2} style={{ flex: 1, color: colors.text, fontSize: fontSize.body, fontWeight: '500' }}>
          {goal.title || 'Sans titre'}
        </Text>
        <Text style={{ color: reached ? colors.success : colors.textMuted, fontSize: fontSize.small, fontWeight: '600' }}>
          {goal.progress} %
        </Text>
      </View>
      {ca && (
        // Encaissé réel / cible, sous le titre : c'est l'information principale d'un objectif de CA.
        <Text style={{ color: reached ? colors.success : colors.text, fontSize: fontSize.small, fontWeight: '600' }}>
          {formatEuros((ca.ca_collected_cents ?? 0) / 100)} / {formatEuros(ca.ca_target_amount)}
        </Text>
      )}
      <ProgressBar value={goal.progress} />
      {ca && (
        <View style={[styles.row, { gap: 4 }]}>
          <Ionicons name="sync-outline" size={12} color={colors.textMuted} />
          <Text style={{ flex: 1, color: colors.textMuted, fontSize: fontSize.caption }}>
            Calculé depuis Qonto · {formatCaPeriod(ca.target_date, ca.ca_period)}
            {receiptsAt ? ` · à jour ${formatEditedLabel(receiptsAt, today)}` : ' · aucune donnée (connexion requise)'}
          </Text>
        </View>
      )}
      {(goal.target_date || goal.project_title) && (
        <View style={[styles.row, { gap: spacing.md, flexWrap: 'wrap' }]}>
          {goal.target_date && (
            <Text style={{ color: late ? colors.danger : colors.textMuted, fontSize: fontSize.caption }}>
              Cible : {formatDueLabel(goal.target_date, today)}
            </Text>
          )}
          {goal.project_id && goal.project_title && (
            <Pressable
              onPress={() => router.push(`/agency/projects/${goal.project_id}`)}
              hitSlop={6}
              accessibilityRole="link"
              style={[styles.row, { gap: 4 }]}
            >
              <Ionicons name="git-branch-outline" size={12} color={projectInk} />
              <Text numberOfLines={1} style={{ color: projectInk, fontSize: fontSize.caption, fontWeight: '600' }}>
                {goal.project_title}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
