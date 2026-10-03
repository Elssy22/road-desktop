import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { useTaskActions } from '../components/TaskActionsSheet';
import { TaskRow } from '../components/TaskRow';
import { CardList, CardNote, CategoryCard, EmptyText, Field, ListRow } from '../components/ui';
import { listContacts, type ContactWithLast } from '../db/crmDb';
import { listNotes, type Note } from '../db/notesDb';
import { listProjects, STATUS_LABELS, type ProjectWithProgress } from '../db/projectsDb';
import { makeMatcher } from '../lib/search';
import { useToday } from '../lib/useToday';
import { useLocalQuery } from '../sync/useLocalQuery';
import { useOfflineTasks } from '../sync/useOfflineTasks';
import { useTheme } from '../theme/ThemeProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Au-delà, on affiche « + N autres » : affiner la requête suffit à ce volume. */
const MAX_PER_GROUP = 20;

type Others = { notes: Note[]; contacts: ContactWithLast[]; projects: ProjectWithProgress[] };
const EMPTY: Others = { notes: [], contacts: [], projects: [] };

/** Première ligne non vide, comme titre de secours d'une note sans titre. */
const noteTitle = (n: Note) =>
  n.title.trim() || n.body.split('\n').find((l) => l.trim() !== '')?.trim() || 'Sans titre';

/**
 * Recherche globale, côté client, sur les données locales (SQLite) : tâches
 * (titre), notes (titre + corps), contacts (nom), projets (titre). Même règle
 * que la recherche des notes : casse et accents ignorés, tous les mots requis.
 */
export function SearchScreen({ userId }: { userId: string }) {
  const today = useToday();
  const { spacing } = useTheme();
  const [query, setQuery] = useState('');

  const tasksApi = useOfflineTasks(userId);
  const actions = useTaskActions(tasksApi);
  const load = useCallback(
    async (db: SQLiteDatabase): Promise<Others> => ({
      notes: await listNotes(db, userId),
      contacts: await listContacts(db, userId),
      projects: await listProjects(db, userId),
    }),
    [userId]
  );
  const { data } = useLocalQuery(load, EMPTY);

  const results = useMemo(() => {
    if (query.trim() === '') return null;
    const matches = makeMatcher(query);
    return {
      // Tâches à faire d'abord : useOfflineTasks les renvoie par date de création.
      tasks: tasksApi.tasks.filter((t) => matches(t.title)).sort((a, b) => Number(a.done) - Number(b.done)),
      notes: data.notes.filter((n) => matches(n.title, n.body)),
      contacts: data.contacts.filter((c) => matches(c.name)),
      projects: data.projects.filter((p) => matches(p.title)),
    };
  }, [query, tasksApi.tasks, data]);

  const total = results
    ? results.tasks.length + results.notes.length + results.contacts.length + results.projects.length
    : 0;

  // Contacts et projets vivent dans la Stack de l'onglet Agence : `navigate`
  // revient aux onglets (la recherche se ferme) et `withAnchor` garde le menu
  // Agence sous la fiche pour le retour. Les notes s'ouvrent par-dessus.
  const openInAgency = (href: Href) => router.navigate(href, { withAnchor: true });

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder="Tâches, notes, contacts, projets…"
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
        autoFocus
        style={{ marginBottom: spacing.xl }}
        accessibilityLabel="Rechercher"
      />

      {!results && <EmptyText>Recherche dans les titres des tâches et projets, les notes et les noms des contacts.</EmptyText>}
      {results && total === 0 && <EmptyText>Aucun résultat pour « {query.trim()} ».</EmptyText>}

      {results && results.tasks.length > 0 && (
        <Group category="tasks" title="Tâches" icon="checkbox-outline" count={results.tasks.length}>
          {results.tasks.slice(0, MAX_PER_GROUP).map((t, i, list) => (
            <TaskRow
              key={t.id}
              task={t}
              today={today}
              onToggle={tasksApi.toggle}
              onPostpone={tasksApi.postponeToTomorrow}
              onOpen={actions.open}
              isLast={i === list.length - 1}
            />
          ))}
        </Group>
      )}

      {results && results.notes.length > 0 && (
        <Group category="notes" title="Notes" icon="document-text-outline" count={results.notes.length}>
          {results.notes.slice(0, MAX_PER_GROUP).map((n, i, list) => (
            <ListRow
              key={n.id}
              title={noteTitle(n)}
              subtitle={n.title.trim() ? n.body.trim().split('\n')[0] : null}
              onPress={() => router.push({ pathname: '/notes/[id]', params: { id: n.id } })}
              isLast={i === list.length - 1}
            />
          ))}
        </Group>
      )}

      {results && results.contacts.length > 0 && (
        <Group category="contacts" title="Contacts" icon="people-outline" count={results.contacts.length}>
          {results.contacts.slice(0, MAX_PER_GROUP).map((c, i, list) => (
            <ListRow
              key={c.id}
              title={c.name || 'Sans nom'}
              subtitle={[c.role, c.club].filter(Boolean).join(' · ') || null}
              onPress={() => openInAgency({ pathname: '/agency/contacts/[id]', params: { id: c.id } })}
              isLast={i === list.length - 1}
            />
          ))}
        </Group>
      )}

      {results && results.projects.length > 0 && (
        <Group category="projects" title="Projets" icon="git-branch-outline" count={results.projects.length}>
          {results.projects.slice(0, MAX_PER_GROUP).map((p, i, list) => (
            <ListRow
              key={p.id}
              title={p.title || 'Sans titre'}
              subtitle={`${STATUS_LABELS[p.status] ?? p.status}${
                p.steps_total > 0 ? ` · ${p.steps_done}/${p.steps_total} étapes` : ''
              }`}
              onPress={() => openInAgency({ pathname: '/agency/projects/[id]', params: { id: p.id } })}
              isLast={i === list.length - 1}
            />
          ))}
        </Group>
      )}

      {/* Pas d'écran de détail pour une tâche : le menu (échéance, priorité…) s'ouvre ici. */}
      {actions.sheet}
    </ScrollView>
  );
}

function Group({
  category,
  title,
  icon,
  count,
  children,
}: {
  category: 'tasks' | 'notes' | 'contacts' | 'projects';
  title: string;
  icon: IconName;
  count: number;
  children: ReactNode;
}) {
  const { categories } = useTheme();
  const hidden = count - MAX_PER_GROUP;
  return (
    <CategoryCard tint={categories[category]} icon={icon} title={title} count={count}>
      <CardList>{children}</CardList>
      {hidden > 0 && (
        <CardNote>
          + {hidden} autre{hidden > 1 ? 's' : ''} : précise la recherche.
        </CardNote>
      )}
    </CategoryCard>
  );
}
