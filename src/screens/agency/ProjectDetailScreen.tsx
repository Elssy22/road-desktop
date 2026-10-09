import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  GitBranch,
  Link2,
  ListChecks,
  ListTodo,
  NotebookPen,
  Receipt,
  Trash2,
  Unlink,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Dialog, useConfirm } from '../../components/Dialog';
import { LinkedDocumentsCard } from '../../components/LinkedDocumentsCard';
import { QuickAddTask } from '../../components/QuickAddTask';
import {
  Badge,
  CardList,
  CardNote,
  CategoryCard,
  ErrorBanner,
  FormField,
  ListRow,
  ScreenHeader,
  SegmentedControl,
  TextAction,
} from '../../components/ui';
import { listProjectNotes, noteTitle, type Note } from '../../data/notes';
import {
  addStep,
  getProject,
  listLinkableTasks,
  listProjectTasks,
  listSteps,
  moveStep,
  PROJECT_STATUSES,
  setStepDone,
  softDeleteProject,
  softDeleteStep,
  STATUS_LABELS,
  statusColor,
  updateProject,
  type Project,
  type ProjectStatus,
  type ProjectStep,
} from '../../data/projects';
import { setTaskDone, setTaskProject, type Task } from '../../data/tasks';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { useWrite } from '../../data/useWrite';
import { formatDueLabel, formatEditedLabel, type DateKey } from '../../lib/dates';
import { formatMoney } from '../../lib/money';
import { fetchProjectQontoItems, qontoStatusLabel, type QontoItem } from '../../lib/qonto';
import { useToday } from '../../lib/useToday';

type Detail = { project: Project | null; steps: ProjectStep[]; tasks: Task[]; notes: Note[] };
const EMPTY: Detail = { project: null, steps: [], tasks: [], notes: [] };
const NO_TASKS: Task[] = [];
const NO_QONTO: QontoItem[] = [];

const STATUS_OPTIONS = PROJECT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }));

/** Fiche d'un projet : portage web de mobile-legacy/src/screens/agency/ProjectDetailScreen.tsx. */
export function ProjectDetailScreen({ userId }: { userId: string }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const { run, error: writeError } = useWrite();
  const { confirm, dialog } = useConfirm();
  const [linking, setLinking] = useState(false);

  const load = useCallback(async (): Promise<Detail> => {
    const [project, steps, tasks, notes] = await Promise.all([
      getProject(id),
      listSteps(id),
      listProjectTasks(id),
      listProjectNotes(id),
    ]);
    return { project, steps, tasks, notes };
  }, [id]);
  const { data, error, loading } = useRemoteQuery(load, EMPTY);
  const { project, steps, tasks, notes } = data;
  // Lecture à part : une erreur Qonto (migration 020 absente…) ne masque pas la fiche.
  const loadBilling = useCallback(() => fetchProjectQontoItems(id), [id]);
  const { data: billing, error: billingError } = useRemoteQuery(loadBilling, NO_QONTO);

  // Premier chargement, ou fiche précédente encore affichée après un changement d'URL.
  if (loading || (project && project.id !== id)) {
    return (
      <div className="screen">
        <ErrorBanner message={error} />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="screen">
        <ScreenHeader eyebrow="Projets" title="Projet" />
        <ErrorBanner message={error} />
        <CategoryCard category="projects" icon={GitBranch} title="Projet">
          <CardNote>Ce projet n’existe plus (supprimé sur un autre appareil ?).</CardNote>
        </CategoryCard>
      </div>
    );
  }

  const done = steps.filter((s) => s.done).length;

  const confirmDelete = () =>
    confirm({
      title: 'Supprimer ce projet ?',
      message: 'Ses étapes seront supprimées ; les tâches, notes et objectifs liés sont conservés.',
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () =>
        void run(() => softDeleteProject(project.id)).then(
          (ok) => ok && navigate('/agency/projects', { replace: true })
        ),
    });

  const confirmDeleteStep = (s: ProjectStep) =>
    confirm({
      title: 'Supprimer cette étape ?',
      message: s.title || undefined,
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () => void run(() => softDeleteStep(s)),
    });

  const confirmUnlink = (t: Task) =>
    confirm({
      title: 'Détacher cette tâche du projet ?',
      message: t.title,
      confirmLabel: 'Détacher',
      onConfirm: () => void run(() => setTaskProject(t, null)),
    });

  const changeStatus = (s: ProjectStatus) => {
    if (project.status !== s) void run(() => updateProject(project.id, { status: s }));
  };

  return (
    <div className="screen screen--wide">
      <ScreenHeader
        eyebrow="Projet"
        title={project.title || 'Sans titre'}
        action={
          <div className="header-actions">
            <Badge label={STATUS_LABELS[project.status] ?? project.status} color={statusColor(project.status)} />
            <TextAction label="Supprimer" icon={Trash2} onClick={confirmDelete} />
          </div>
        }
      />
      <ErrorBanner message={writeError ?? error} />

      {/* Projet, étapes : cartes bleu ciel ; tâches liées : carte pêche (DECISIONS.md §29). */}
      <div className="columns">
        <div className="columns__main">
          <CategoryCard category="projects" icon={GitBranch} title="Projet">
            {/* Lu une fois à l'ouverture : une relecture n'écrase pas la saisie en cours. */}
            <ProjectFields
              key={project.id}
              project={project}
              onSave={(patch) => void run(() => updateProject(project.id, patch))}
            />
            <FormField label="Statut">
              <SegmentedControl<ProjectStatus>
                options={STATUS_OPTIONS}
                value={project.status as ProjectStatus}
                onChange={changeStatus}
              />
            </FormField>
          </CategoryCard>

          <CategoryCard
            category="projects"
            icon={ListChecks}
            title={steps.length ? `Étapes · ${done}/${steps.length}` : 'Étapes'}
          >
            <QuickAddTask
              placeholder="Nouvelle étape"
              withDue={false}
              onAdd={(title) => void run(() => addStep(project.id, title))}
            />
            {steps.length > 0 ? (
              <CardList>
                {steps.map((s, idx) => (
                  <StepRow
                    key={s.id}
                    step={s}
                    isFirst={idx === 0}
                    isLast={idx === steps.length - 1}
                    onToggle={() => void run(() => setStepDone(s, !s.done))}
                    onMove={(delta) => void run(() => moveStep(steps, idx, delta))}
                    onDelete={() => confirmDeleteStep(s)}
                  />
                ))}
              </CardList>
            ) : (
              <CardNote>Aucune étape pour l’instant.</CardNote>
            )}
          </CategoryCard>
        </div>

        <div className="columns__side">
          <CategoryCard
            category="tasks"
            icon={ListTodo}
            title="Tâches liées"
            count={tasks.length}
            action={<TextAction label="Lier" icon={Link2} category="tasks" onClick={() => setLinking(true)} />}
          >
            {tasks.length > 0 ? (
              <CardList>
                {tasks.map((t) => (
                  <ListRow
                    key={t.id}
                    title={t.title}
                    subtitle={t.due_date && !t.done ? formatDueLabel(t.due_date, today) : null}
                    muted={t.done}
                    left={
                      <button
                        type="button"
                        className={t.done ? 'check check--done' : 'check'}
                        role="checkbox"
                        aria-checked={t.done}
                        aria-label={t.title}
                        onClick={() => void run(() => setTaskDone(t, !t.done))}
                      >
                        {t.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                      </button>
                    }
                    right={
                      <button
                        type="button"
                        className="icon-button row__hover-action"
                        onClick={() => confirmUnlink(t)}
                        aria-label="Détacher la tâche du projet"
                        title="Détacher du projet"
                      >
                        <Unlink size={16} />
                      </button>
                    }
                  />
                ))}
              </CardList>
            ) : (
              <CardNote>Aucune tâche liée. Les tâches restent gérées dans la section Tâches.</CardNote>
            )}
          </CategoryCard>

          <CategoryCard category="notes" icon={NotebookPen} title="Notes" count={notes.length}>
            {notes.length > 0 ? (
              <CardList>
                {notes.map((n) => (
                  <ListRow
                    key={n.id}
                    title={noteTitle(n)}
                    subtitle={formatEditedLabel(n.updated_at, today)}
                    onClick={() => navigate(`/notes/${n.id}`)}
                  />
                ))}
              </CardList>
            ) : (
              <CardNote>Aucune note liée. Choisis ce projet dans « Projet lié » depuis l’éditeur d’une note.</CardNote>
            )}
          </CategoryCard>

          <CategoryCard category="finance" icon={Receipt} title="Facturation" count={billing.length}>
            {billingError ? (
              <CardNote tone="danger">Factures Qonto illisibles pour l’instant : {billingError}</CardNote>
            ) : billing.length > 0 ? (
              <CardList>
                {billing.map((item) => (
                  <ListRow
                    key={item.id}
                    title={item.label || 'Sans libellé'}
                    subtitle={billingSubtitle(item, today)}
                    right={<span className="row__amount">{formatMoney(item.amount, item.currency)}</span>}
                  />
                ))}
              </CardList>
            ) : (
              <CardNote>
                Aucune facture ni devis Qonto lié. Choisis ce projet dans « Projet lié » depuis Finances › Depuis Qonto.
              </CardNote>
            )}
          </CategoryCard>

          <LinkedDocumentsCard userId={userId} kind="project" id={project.id} />
        </div>
      </div>
      {linking && (
        <LinkTaskDialog
          onClose={() => setLinking(false)}
          onPick={(t) => {
            setLinking(false);
            void run(() => setTaskProject(t, project.id));
          }}
        />
      )}
      {dialog}
    </div>
  );
}

/** « Facture · Impayée · Échéance 12 oct. » ; « Expire » pour un devis. */
function billingSubtitle(item: QontoItem, today: DateKey): string {
  const due = item.due_date && `${item.kind === 'quote' ? 'Expire' : 'Échéance'} ${formatDueLabel(item.due_date, today)}`;
  return [qontoStatusLabel(item, today), due].filter(Boolean).join(' · ');
}

/** Titre et description, enregistrés à la perte de focus. */
function ProjectFields({
  project,
  onSave,
}: {
  project: Project;
  onSave: (patch: Partial<Pick<Project, 'title' | 'description'>>) => void;
}) {
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? '');

  const saveTitle = () => {
    const t = title.trim();
    if (!t) return setTitle(project.title); // pas de projet sans titre
    if (t !== project.title) onSave({ title: t });
  };
  const saveDescription = () => {
    const d = description.trim() || null;
    if (d !== project.description) onSave({ description: d });
  };

  return (
    <div className="form">
      <FormField label="Titre" htmlFor="project-title">
        <input
          id="project-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder="Titre du projet"
        />
      </FormField>
      <FormField label="Description" htmlFor="project-description">
        <textarea
          id="project-description"
          className="input textarea"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          placeholder="Description (facultatif)"
        />
      </FormField>
    </div>
  );
}

function StepRow({
  step,
  isFirst,
  isLast,
  onToggle,
  onMove,
  onDelete,
}: {
  step: ProjectStep;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <ListRow
      title={step.title || 'Sans titre'}
      muted={step.done}
      left={
        <button
          type="button"
          className={step.done ? 'check check--done' : 'check'}
          role="checkbox"
          aria-checked={step.done}
          aria-label={step.title}
          onClick={onToggle}
        >
          {step.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
        </button>
      }
      right={
        <span className="row__arrows">
          <button
            type="button"
            className="icon-button row__hover-action"
            onClick={onDelete}
            aria-label="Supprimer l’étape"
            title="Supprimer l’étape"
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            aria-label="Monter l’étape"
            title="Monter"
          >
            <ChevronUp size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => onMove(1)}
            disabled={isLast}
            aria-label="Descendre l’étape"
            title="Descendre"
          >
            <ChevronDown size={18} />
          </button>
        </span>
      }
    />
  );
}

/** Choix d'une tâche à faire, pas encore rattachée à un projet. */
function LinkTaskDialog({ onClose, onPick }: { onClose: () => void; onPick: (task: Task) => void }) {
  const { data: tasks, error, loading } = useRemoteQuery(listLinkableTasks, NO_TASKS);
  return (
    <Dialog title="Lier une tâche existante" onClose={onClose}>
      <ErrorBanner message={error} />
      {tasks.length === 0 ? (
        loading ? null : (
          <p className="dialog__message">Aucune tâche à faire sans projet.</p>
        )
      ) : (
        <div className="dialog__options dialog__list">
          {tasks.map((t) => (
            <button key={t.id} type="button" className="dialog__option" onClick={() => onPick(t)}>
              <Circle size={18} color="var(--color-text-faint)" />
              {t.title}
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
