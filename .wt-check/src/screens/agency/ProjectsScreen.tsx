import { GitBranch } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { QuickAddTask } from '../../components/QuickAddTask';
import {
  Badge,
  CardList,
  CardNote,
  CategoryCard,
  Chip,
  ChipRow,
  ErrorBanner,
  ListRow,
  ScreenHeader,
} from '../../components/ui';
import {
  addProject,
  listProjects,
  PROJECT_STATUSES,
  STATUS_LABELS,
  statusColor,
  type ProjectStatus,
  type ProjectWithProgress,
} from '../../data/projects';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { useWrite } from '../../data/useWrite';

const EMPTY: ProjectWithProgress[] = [];

/** Liste des projets : portage web de mobile-legacy/src/screens/agency/ProjectsScreen.tsx. */
export function ProjectsScreen() {
  const navigate = useNavigate();
  const { data: projects, error, loading } = useRemoteQuery(listProjects, EMPTY);
  const { run, error: writeError } = useWrite();
  // Par défaut on montre les projets actifs, le reste est à un clic.
  const [filter, setFilter] = useState<ProjectStatus | null>('actif');

  const visible = useMemo(() => (filter ? projects.filter((p) => p.status === filter) : projects), [projects, filter]);

  const count = (s: ProjectStatus | null) => (s ? projects.filter((p) => p.status === s).length : projects.length);

  const create = (title: string) => {
    let id: string | null = null;
    void run(async () => {
      id = await addProject(title);
    }).then((ok) => ok && id && navigate(`/agency/projects/${id}`));
  };

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Agence" title="Projets" />
      <ErrorBanner message={writeError ?? error} />
      <div className="stack">
        <QuickAddTask placeholder="Nouveau projet (ex. Transfert de X)" withDue={false} onAdd={create} />
        <ChipRow>
          {PROJECT_STATUSES.map((s) => (
            <Chip
              key={s}
              label={`${STATUS_LABELS[s]} · ${count(s)}`}
              selected={filter === s}
              onClick={() => setFilter(s)}
            />
          ))}
          <Chip label={`Tous · ${count(null)}`} selected={filter === null} onClick={() => setFilter(null)} />
        </ChipRow>

        {/* Catégorie Projets : la liste est une carte bleu ciel (DECISIONS.md §29). */}
        <CategoryCard
          category="projects"
          icon={GitBranch}
          title={filter ? `Projets · ${STATUS_LABELS[filter]}` : 'Tous les projets'}
          count={visible.length}
        >
          {visible.length > 0 ? (
            <CardList>
              {visible.map((p) => (
                <ListRow
                  key={p.id}
                  title={p.title || 'Sans titre'}
                  subtitle={p.steps_total ? `${p.steps_done}/${p.steps_total} étapes` : 'Aucune étape'}
                  right={<Badge label={STATUS_LABELS[p.status] ?? p.status} color={statusColor(p.status)} />}
                  onClick={() => navigate(`/agency/projects/${p.id}`)}
                />
              ))}
            </CardList>
          ) : loading ? null : (
            <CardNote>
              {projects.length ? 'Aucun projet avec ce statut.' : 'Aucun projet. Ajoute-en un ci-dessus.'}
            </CardNote>
          )}
        </CategoryCard>
      </div>
    </div>
  );
}
