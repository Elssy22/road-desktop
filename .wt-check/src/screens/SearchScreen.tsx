import { GitBranch, NotebookPen, SquareCheck, Users, type LucideIcon } from 'lucide-react';
import { useCallback, useMemo, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useTaskActions } from '../components/TaskActions';
import { TaskRow } from '../components/TaskRow';
import { CardList, CardNote, CategoryCard, ErrorBanner, ListRow, Panel, ScreenHeader } from '../components/ui';
import { listContacts, type ContactWithLast } from '../data/crm';
import { firstLine, listNotes, noteTitle, type Note } from '../data/notes';
import { listProjects, STATUS_LABELS, type ProjectWithProgress } from '../data/projects';
import { useRemoteQuery } from '../data/useRemoteQuery';
import { useTasks } from '../data/useTasks';
import { makeMatcher } from '../lib/search';
import { useToday } from '../lib/useToday';
import type { Category } from '../theme/tokens';

/** Au-delà, on affiche « + N autres » : affiner la requête suffit à ce volume. */
const MAX_PER_GROUP = 20;

type Others = { notes: Note[]; contacts: ContactWithLast[]; projects: ProjectWithProgress[] };
const EMPTY: Others = { notes: [], contacts: [], projects: [] };

/**
 * Résultats de la recherche globale (`/search?q=…`) : portage web de
 * mobile-legacy/src/screens/SearchScreen.tsx. Sur desktop, la saisie se fait
 * dans le champ de la barre latérale (⌘K), toujours visible ; cet écran
 * n'affiche que les résultats. Recherche côté client sur les données lues dans
 * Supabase : tâches (titre), notes (titre + corps), contacts (nom), projets
 * (titre) ; casse et accents ignorés, tous les mots requis.
 */
export function SearchScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const query = params.get('q') ?? '';
  const today = useToday();

  const tasksApi = useTasks();
  const actions = useTaskActions(tasksApi);
  const load = useCallback(async (): Promise<Others> => {
    const [notes, contacts, projects] = await Promise.all([listNotes(), listContacts(), listProjects()]);
    return { notes, contacts, projects };
  }, []);
  const { data, error } = useRemoteQuery(load, EMPTY);

  const results = useMemo(() => {
    if (query.trim() === '') return null;
    const matches = makeMatcher(query);
    return {
      // Tâches à faire d'abord : useTasks les renvoie par date de création.
      tasks: tasksApi.tasks.filter((t) => matches(t.title)).sort((a, b) => Number(a.done) - Number(b.done)),
      notes: data.notes.filter((n) => matches(n.title, n.body)),
      contacts: data.contacts.filter((c) => matches(c.name)),
      projects: data.projects.filter((p) => matches(p.title)),
    };
  }, [query, tasksApi.tasks, data]);

  const total = results
    ? results.tasks.length + results.notes.length + results.contacts.length + results.projects.length
    : 0;

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Recherche" title={query.trim() ? `« ${query.trim()} »` : 'Rechercher'} />
      <ErrorBanner message={error ?? tasksApi.error} />
      <div className="stack">
        {!results && (
          <Panel className="panel-card--padded">
            <CardNote>
              Tape ta recherche dans le champ en haut de la barre latérale (⌘K) : titres des tâches et des projets,
              notes, noms des contacts.
            </CardNote>
          </Panel>
        )}
        {results && total === 0 && (
          <Panel className="panel-card--padded">
            <CardNote>Aucun résultat pour « {query.trim()} ».</CardNote>
          </Panel>
        )}

        {results && results.tasks.length > 0 && (
          <Group category="tasks" title="Tâches" icon={SquareCheck} count={results.tasks.length}>
            {results.tasks.slice(0, MAX_PER_GROUP).map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                today={today}
                onToggle={tasksApi.toggle}
                onPostpone={tasksApi.postponeToTomorrow}
                onOpen={actions.open}
              />
            ))}
          </Group>
        )}

        {results && results.notes.length > 0 && (
          <Group category="notes" title="Notes" icon={NotebookPen} count={results.notes.length}>
            {results.notes.slice(0, MAX_PER_GROUP).map((n) => (
              <ListRow
                key={n.id}
                title={noteTitle(n)}
                subtitle={n.title.trim() ? firstLine(n.body) || null : null}
                onClick={() => navigate(`/notes/${n.id}`)}
              />
            ))}
          </Group>
        )}

        {results && results.contacts.length > 0 && (
          <Group category="contacts" title="Contacts" icon={Users} count={results.contacts.length}>
            {results.contacts.slice(0, MAX_PER_GROUP).map((c) => (
              <ListRow
                key={c.id}
                title={c.name || 'Sans nom'}
                subtitle={[c.role, c.club].filter(Boolean).join(' · ') || null}
                onClick={() => navigate(`/agency/contacts/${c.id}`)}
              />
            ))}
          </Group>
        )}

        {results && results.projects.length > 0 && (
          <Group category="projects" title="Projets" icon={GitBranch} count={results.projects.length}>
            {results.projects.slice(0, MAX_PER_GROUP).map((p) => (
              <ListRow
                key={p.id}
                title={p.title || 'Sans titre'}
                subtitle={`${STATUS_LABELS[p.status] ?? p.status}${
                  p.steps_total > 0 ? ` · ${p.steps_done}/${p.steps_total} étapes` : ''
                }`}
                onClick={() => navigate(`/agency/projects/${p.id}`)}
              />
            ))}
          </Group>
        )}
      </div>
      {/* Pas d'écran de détail pour une tâche : le menu (échéance, priorité…) s'ouvre ici. */}
      {actions.dialog}
    </div>
  );
}

function Group({
  category,
  title,
  icon,
  count,
  children,
}: {
  category: Category;
  title: string;
  icon: LucideIcon;
  count: number;
  children: ReactNode;
}) {
  const hidden = count - MAX_PER_GROUP;
  return (
    <CategoryCard category={category} icon={icon} title={title} count={count}>
      <CardList>{children}</CardList>
      {hidden > 0 && (
        <CardNote>
          + {hidden} autre{hidden > 1 ? 's' : ''} : précise la recherche.
        </CardNote>
      )}
    </CategoryCard>
  );
}
