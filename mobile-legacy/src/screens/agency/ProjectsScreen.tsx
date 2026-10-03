import { router } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { QuickAddRow } from '../../components/QuickAddRow';
import {
  Badge,
  CardNote,
  CardSectionFooter,
  CardSectionHeader,
  CardSectionItem,
  CategoryCard,
  Chip,
  ChipRow,
  ListRow,
} from '../../components/ui';
import {
  addProject,
  listProjects,
  PROJECT_STATUSES,
  STATUS_LABELS,
  type ProjectWithProgress,
} from '../../db/projectsDb';
import { useLocalQuery } from '../../sync/useLocalQuery';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';
import type { Palette } from '../../theme/tokens';

const EMPTY: ProjectWithProgress[] = [];

export const statusColor = (status: string, colors: Palette) =>
  status === 'actif' ? colors.success : status === 'en_pause' ? colors.warning : colors.textFaint;

export function ProjectsScreen({ userId }: { userId: string }) {
  const db = useSQLiteContext();
  const { syncing, syncNow, runLocal } = useSync();
  const load = useCallback((d: SQLiteDatabase) => listProjects(d, userId), [userId]);
  const { data: projects } = useLocalQuery(load, EMPTY);
  // Par défaut on montre les projets actifs, le reste est à un appui.
  const [filter, setFilter] = useState<string | null>('actif');
  const { colors, spacing, categories } = useTheme();
  const tint = categories.projects;

  const visible = useMemo(
    () => (filter ? projects.filter((p) => p.status === filter) : projects),
    [projects, filter]
  );

  const create = (title: string) =>
    void runLocal(async () => {
      const id = await addProject(db, userId, title);
      router.push(`/agency/projects/${id}`);
    });

  const count = (s: string | null) => (s ? projects.filter((p) => p.status === s).length : projects.length);

  return (
    <View style={styles.container}>
      <View style={{ padding: spacing.lg, paddingBottom: 0, gap: spacing.md }}>
        <QuickAddRow placeholder="Nouveau projet (ex. Transfert de X)" onAdd={create} />
        <ChipRow>
          {PROJECT_STATUSES.map((s) => (
            <Chip
              key={s}
              label={`${STATUS_LABELS[s]} · ${count(s)}`}
              selected={filter === s}
              onPress={() => setFilter(s)}
            />
          ))}
          <Chip label={`Tous · ${count(null)}`} selected={filter === null} onPress={() => setFilter(null)} />
        </ChipRow>
      </View>
      {/* Catégorie Projets : la liste est une carte bleu ciel (DECISIONS.md §29). */}
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        refreshing={syncing}
        onRefresh={syncNow}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
        ListHeaderComponent={
          visible.length > 0 ? (
            <CardSectionHeader
              tint={tint}
              icon="git-branch-outline"
              title={filter ? `Projets · ${STATUS_LABELS[filter] ?? filter}` : 'Tous les projets'}
              count={visible.length}
            />
          ) : null
        }
        ListFooterComponent={visible.length > 0 ? <CardSectionFooter tint={tint} /> : null}
        ListEmptyComponent={
          <View style={{ marginTop: spacing.lg }}>
            <CategoryCard tint={tint} icon="git-branch-outline" title="Projets">
              <CardNote>
                {projects.length ? 'Aucun projet avec ce statut.' : 'Aucun projet. Ajoute-en un ci-dessus.'}
              </CardNote>
            </CategoryCard>
          </View>
        }
        renderItem={({ item: p, index }) => {
          const last = index === visible.length - 1;
          return (
            <CardSectionItem tint={tint} first={index === 0} last={last}>
              <ListRow
                title={p.title || 'Sans titre'}
                subtitle={p.steps_total ? `${p.steps_done}/${p.steps_total} étapes` : 'Aucune étape'}
                right={<Badge label={STATUS_LABELS[p.status] ?? p.status} color={statusColor(p.status, colors)} />}
                onPress={() => router.push(`/agency/projects/${p.id}`)}
                isLast={last}
              />
            </CardSectionItem>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
