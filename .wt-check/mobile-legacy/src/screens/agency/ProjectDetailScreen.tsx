import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { QuickAddRow } from '../../components/QuickAddRow';
import { Sheet, SheetOption } from '../../components/Sheet';
import {
  CardList,
  CardNote,
  CategoryCard,
  EmptyText,
  Field,
  ListRow,
  SegmentedControl,
  TextAction,
} from '../../components/ui';
import { softDeleteRow, updateRow } from '../../db/entityTable';
import { setTaskDone, setTaskProject, type Task } from '../../db/localDb';
import {
  addStep,
  getProject,
  listLinkableTasks,
  listProjectTasks,
  listSteps,
  moveStep,
  PROJECT_STATUSES,
  PROJECT_STEPS,
  PROJECTS,
  softDeleteProject,
  STATUS_LABELS,
  type Project,
  type ProjectStep,
} from '../../db/projectsDb';
import { formatDueLabel } from '../../lib/dates';
import { useToday } from '../../lib/useToday';
import { useLocalQuery } from '../../sync/useLocalQuery';
import { useSync } from '../../sync/SyncProvider';
import { useTheme } from '../../theme/ThemeProvider';

type Detail = { project: Project | null; steps: ProjectStep[]; tasks: Task[] };
const EMPTY: Detail = { project: null, steps: [], tasks: [] };

export function ProjectDetailScreen({ userId, id }: { userId: string; id: string }) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const today = useToday();
  const { colors, spacing, categories } = useTheme();
  const tint = categories.projects;
  const [linking, setLinking] = useState(false);

  const load = useCallback(
    async (d: SQLiteDatabase): Promise<Detail> => ({
      project: await getProject(d, id),
      steps: await listSteps(d, id),
      tasks: await listProjectTasks(d, id),
    }),
    [id]
  );
  const { data, loaded } = useLocalQuery(load, EMPTY);
  const { project, steps, tasks } = data;

  const confirmDelete = () => {
    if (!project) return;
    Alert.alert('Supprimer ce projet ?', 'Ses étapes seront supprimées ; les tâches et objectifs liés sont conservés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void runLocal(() => softDeleteProject(db, project));
          router.back();
        },
      },
    ]);
  };

  const confirmDeleteStep = (s: ProjectStep) =>
    Alert.alert('Supprimer cette étape ?', s.title || undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => void runLocal(() => softDeleteRow(db, PROJECT_STEPS, s)) },
    ]);

  const confirmUnlink = (t: Task) =>
    Alert.alert('Détacher cette tâche du projet ?', t.title, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Détacher', onPress: () => void runLocal(() => setTaskProject(db, t, null)) },
    ]);

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }
  if (!project) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Stack.Screen options={{ title: 'Projet' }} />
        <EmptyText>Ce projet n’existe plus (supprimé sur un autre appareil ?).</EmptyText>
      </View>
    );
  }

  const done = steps.filter((s) => s.done).length;

  return (
    <>
      <Stack.Screen
        options={{
          title: project.title || 'Projet',
          headerRight: () => (
            <Pressable
              onPress={confirmDelete}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Supprimer le projet"
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, paddingHorizontal: spacing.sm })}
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Projet, étapes : cartes bleu ciel ; tâches liées : carte pêche (DECISIONS.md §29). */}
        <CategoryCard tint={tint} icon="git-branch-outline" title="Projet">
          {/* Lu une fois à l'ouverture, comme l'éditeur de notes : une sync n'écrase pas la saisie. */}
          <ProjectFields key={project.id} project={project} />
          <SegmentedControl
            tint={tint}
            options={PROJECT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            value={project.status}
            onChange={(s) => {
              if (project.status !== s) void runLocal(() => updateRow(db, PROJECTS, project, { status: s }));
            }}
          />
        </CategoryCard>

        <CategoryCard tint={tint} icon="list-outline" title={steps.length ? `Étapes · ${done}/${steps.length}` : 'Étapes'}>
          <QuickAddRow
            placeholder="Nouvelle étape"
            onAdd={(title) => void runLocal(() => addStep(db, userId, project.id, title))}
          />
          {steps.length > 0 ? (
            <CardList>
              {steps.map((s, idx) => (
                <StepRow
                  key={s.id}
                  step={s}
                  isFirst={idx === 0}
                  isLast={idx === steps.length - 1}
                  onToggle={() => void runLocal(() => updateRow(db, PROJECT_STEPS, s, { done: !s.done }))}
                  onMove={(delta) => void runLocal(() => moveStep(db, steps, idx, delta))}
                  onLongPress={() => confirmDeleteStep(s)}
                />
              ))}
            </CardList>
          ) : (
            <CardNote>Aucune étape pour l’instant.</CardNote>
          )}
          {steps.length > 0 && <CardNote>Flèches pour réordonner, appui long pour supprimer une étape.</CardNote>}
        </CategoryCard>

        <CategoryCard
          tint={categories.tasks}
          icon="checkbox-outline"
          title="Tâches liées"
          count={tasks.length}
          action={
            <TextAction label="Lier" icon="link-outline" tint={categories.tasks} accessibilityLabel="Lier une tâche" onPress={() => setLinking(true)} />
          }
        >
          {tasks.length > 0 ? (
            <CardList>
              {tasks.map((t, idx) => (
                <ListRow
                  key={t.id}
                  title={t.title}
                  subtitle={t.due_date && !t.done ? formatDueLabel(t.due_date, today) : null}
                  muted={t.done}
                  chevron={false}
                  left={
                    <Pressable
                      onPress={() => void runLocal(() => setTaskDone(db, t, !t.done))}
                      hitSlop={10}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: t.done }}
                      accessibilityLabel={t.title}
                    >
                      <Ionicons
                        name={t.done ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={t.done ? colors.success : colors.textFaint}
                      />
                    </Pressable>
                  }
                  onLongPress={() => confirmUnlink(t)}
                  isLast={idx === tasks.length - 1}
                />
              ))}
            </CardList>
          ) : (
            <CardNote>Aucune tâche liée. Les tâches restent gérées dans l’onglet Tâches.</CardNote>
          )}
          {tasks.length > 0 && <CardNote>Appui long sur une tâche pour la détacher du projet.</CardNote>}
        </CategoryCard>
      </ScrollView>
      <LinkTaskSheet
        visible={linking}
        userId={userId}
        onClose={() => setLinking(false)}
        onPick={(t) => {
          setLinking(false);
          void runLocal(() => setTaskProject(db, t, project.id));
        }}
      />
    </>
  );
}

/** Titre et description, enregistrés à la perte de focus (pas d'entrée d'outbox par frappe). */
function ProjectFields({ project }: { project: Project }) {
  const db = useSQLiteContext();
  const { runLocal } = useSync();
  const { spacing } = useTheme();
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? '');

  const saveTitle = () => {
    const t = title.trim();
    if (!t) return setTitle(project.title); // pas de projet sans titre
    if (t !== project.title) void runLocal(() => updateRow(db, PROJECTS, project, { title: t }));
  };
  const saveDescription = () => {
    const d = description.trim() || null;
    if (d !== project.description) void runLocal(() => updateRow(db, PROJECTS, project, { description: d }));
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Field value={title} onChangeText={setTitle} onBlur={saveTitle} placeholder="Titre du projet" />
      <Field
        value={description}
        onChangeText={setDescription}
        onBlur={saveDescription}
        placeholder="Description (facultatif)"
        multiline
        style={{ minHeight: 72, textAlignVertical: 'top' }}
      />
    </View>
  );
}

function StepRow({
  step,
  isFirst,
  isLast,
  onToggle,
  onMove,
  onLongPress,
}: {
  step: ProjectStep;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
  onLongPress: () => void;
}) {
  const { colors, spacing } = useTheme();
  const arrow = (icon: 'chevron-up' | 'chevron-down', label: string, disabled: boolean, delta: -1 | 1) => (
    <Pressable
      onPress={() => onMove(delta)}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ opacity: disabled ? 0.25 : pressed ? 0.5 : 1, padding: spacing.xs })}
    >
      <Ionicons name={icon} size={18} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <ListRow
      title={step.title || 'Sans titre'}
      muted={step.done}
      chevron={false}
      onLongPress={onLongPress}
      isLast={isLast}
      left={
        <Pressable
          onPress={onToggle}
          hitSlop={10}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: step.done }}
          accessibilityLabel={step.title}
        >
          <Ionicons
            name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={step.done ? colors.success : colors.textFaint}
          />
        </Pressable>
      }
      right={
        <View style={styles.arrows}>
          {arrow('chevron-up', 'Monter l’étape', isFirst, -1)}
          {arrow('chevron-down', 'Descendre l’étape', isLast, 1)}
        </View>
      }
    />
  );
}

/** Choix d'une tâche à faire, pas encore rattachée à un projet. */
function LinkTaskSheet({
  visible,
  userId,
  onClose,
  onPick,
}: {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onPick: (task: Task) => void;
}) {
  const { colors, spacing } = useTheme();
  const load = useCallback((d: SQLiteDatabase) => listLinkableTasks(d, userId), [userId]);
  const { data: tasks } = useLocalQuery(load, [] as Task[]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Lier une tâche existante">
      {tasks.length === 0 ? (
        <EmptyText>Aucune tâche à faire sans projet.</EmptyText>
      ) : (
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: spacing.sm }}>
          {tasks.map((t) => (
            <SheetOption
              key={t.id}
              label={t.title}
              icon={<Ionicons name="ellipse-outline" size={18} color={colors.textFaint} />}
              onPress={() => onPick(t)}
            />
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  arrows: { flexDirection: 'row', alignItems: 'center' },
});
