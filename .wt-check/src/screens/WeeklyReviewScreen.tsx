import {
  AlertCircle,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Hourglass,
  NotebookPen,
  Trophy,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { KeyDateRow } from '../components/KeyDateRow';
import {
  CardList,
  CardNote,
  CategoryCard,
  ErrorBanner,
  FormField,
  ListRow,
  Panel,
  ProgressBar,
  ScreenHeader,
} from '../components/ui';
import { isCaGoal, listGoals, type GoalWithProject } from '../data/goals';
import { listKeyDatesBetween, type KeyDateWithContact } from '../data/keyDates';
import { listProjects, type ProjectWithProgress } from '../data/projects';
import type { Task } from '../data/tasks';
import { useRemoteQuery } from '../data/useRemoteQuery';
import {
  listOverdueTasks,
  listTasksDoneBetween,
  loadWeeklyReview,
  saveWeeklyReview,
  type WeeklyReviewText,
} from '../data/weeklyReview';
import { addDays, formatDueLabel, formatLongDate, startOfWeek, type DateKey } from '../lib/dates';
import { useToday } from '../lib/useToday';

type Overview = {
  done: Task[];
  overdue: Task[];
  projects: ProjectWithProgress[];
  goals: GoalWithProject[];
  nextWeekDates: KeyDateWithContact[];
};
const EMPTY: Overview = { done: [], overdue: [], projects: [], goals: [], nextWeekDates: [] };

/**
 * Revue de la semaine : portage web de mobile-legacy/src/screens/WeeklyReviewScreen.tsx.
 * Lecture agrégée des données existantes, puis trois champs libres enregistrés
 * sur cet ordinateur. On peut revenir sur les semaines passées (utile pour
 * faire la revue le lundi matin).
 */
export function WeeklyReviewScreen({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const today = useToday();
  const currentWeek = startOfWeek(today);
  const [week, setWeek] = useState<DateKey>(currentWeek);
  const nextWeek = addDays(week, 7);

  const load = useCallback(async (): Promise<Overview> => {
    const [done, overdue, projects, goals, nextWeekDates] = await Promise.all([
      listTasksDoneBetween(week, nextWeek),
      // En retard / projets / objectifs : l'état actuel, quelle que soit la semaine revue.
      listOverdueTasks(today),
      listProjects(),
      listGoals(userId),
      listKeyDatesBetween(nextWeek, addDays(nextWeek, 6)),
    ]);
    return { done, overdue, projects: projects.filter((p) => p.status === 'actif'), goals: goals.goals, nextWeekDates };
  }, [userId, week, nextWeek, today]);
  // Changement de semaine : les chiffres de la semaine précédente restent affichés,
  // atténués, jusqu'à la réponse.
  const { data, error, loading } = useRemoteQuery(load, EMPTY);

  const weekTitle =
    week === currentWeek ? 'Cette semaine' : week === addDays(currentWeek, -7) ? 'Semaine dernière' : 'Semaine';

  return (
    <div className="screen screen--wide">
      <ScreenHeader eyebrow="Organisation" title="Revue de la semaine" />
      <ErrorBanner message={error} />

      <Panel className="panel-card--padded week-nav">
        <div className="period">
          <button
            type="button"
            className="icon-button icon-button--round"
            onClick={() => setWeek(addDays(week, -7))}
            aria-label="Semaine précédente"
            title="Semaine précédente"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="week-nav__title">
            <h2 className="period__title">{weekTitle}</h2>
            <span className="row__subtitle">
              du {formatLongDate(week)} au {formatLongDate(addDays(week, 6))}
            </span>
          </div>
          <button
            type="button"
            className="icon-button icon-button--round"
            onClick={() => setWeek(addDays(week, 7))}
            disabled={week >= currentWeek}
            aria-label="Semaine suivante"
            title="Semaine suivante"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </Panel>

      <div className={loading ? 'columns is-pending' : 'columns'} aria-busy={loading}>
        <div className="columns__main">
          <CategoryCard category="tasks" icon={CheckCheck} title="Tâches terminées" count={data.done.length}>
            {data.done.length === 0 ? (
              <CardNote>Aucune tâche cochée sur cette semaine.</CardNote>
            ) : (
              <CardList>
                {data.done.map((t) => (
                  <ListRow key={t.id} title={t.title} left={<CheckCircle2 size={20} className="tint-icon" />} />
                ))}
              </CardList>
            )}
          </CategoryCard>

          <CategoryCard category="tasks" icon={AlertCircle} title="Tâches en retard" count={data.overdue.length}>
            {data.overdue.length === 0 ? (
              <CardNote>Rien en retard.</CardNote>
            ) : (
              <CardList>
                {data.overdue.map((t) => (
                  <ListRow
                    key={t.id}
                    title={t.title}
                    right={
                      <span className="row__meta-item row__meta-item--danger">
                        {t.due_date ? formatDueLabel(t.due_date, today) : ''}
                      </span>
                    }
                  />
                ))}
              </CardList>
            )}
          </CategoryCard>

          {/* Remonté à chaque changement de semaine : on relit le bilan de la semaine affichée. */}
          <ReviewNotes key={week} userId={userId} week={week} />
        </div>

        <div className="columns__side">
          <CategoryCard category="projects" icon={GitBranch} title="Projets actifs" count={data.projects.length}>
            {data.projects.length === 0 ? (
              <CardNote>Aucun projet actif.</CardNote>
            ) : (
              <CardList>
                {data.projects.map((p) => (
                  <ProgressLine
                    key={p.id}
                    title={p.title || 'Sans titre'}
                    value={p.steps_total > 0 ? (p.steps_done / p.steps_total) * 100 : 0}
                    label={p.steps_total > 0 ? `${p.steps_done}/${p.steps_total} étapes` : 'Aucune étape'}
                    onClick={() => navigate(`/agency/projects/${p.id}`)}
                  />
                ))}
              </CardList>
            )}
          </CategoryCard>

          <CategoryCard category="goals" icon={Trophy} title="Objectifs" count={data.goals.length}>
            {data.goals.length === 0 ? (
              <CardNote>Aucun objectif.</CardNote>
            ) : (
              <CardList>
                {data.goals.map((g) => {
                  // Objectif de CA sans encaissements Qonto lisibles : pas d'avancement à montrer.
                  const pending = isCaGoal(g) && g.ca_collected_cents == null;
                  const target = g.target_date ? ` · cible ${formatDueLabel(g.target_date, today)}` : '';
                  return (
                    <ProgressLine
                      key={g.id}
                      title={g.title || 'Sans titre'}
                      value={pending ? null : g.progress}
                      label={`${pending ? '—' : g.progress} %${target}`}
                      onClick={() => navigate(`/agency/goals/${g.id}`)}
                    />
                  );
                })}
              </CardList>
            )}
          </CategoryCard>

          <CategoryCard
            category="keyDates"
            icon={Hourglass}
            title="Échéances semaine suivante"
            count={data.nextWeekDates.length}
          >
            {data.nextWeekDates.length === 0 ? (
              <CardNote>
                Aucune échéance du {formatLongDate(nextWeek)} au {formatLongDate(addDays(nextWeek, 6))}.
              </CardNote>
            ) : (
              <CardList>
                {data.nextWeekDates.map((k) => (
                  <KeyDateRow key={k.id} keyDate={k} today={today} />
                ))}
              </CardList>
            )}
          </CategoryCard>
        </div>
      </div>
    </div>
  );
}

/** Ligne avec barre d'avancement (projet, objectif) ; clic : sa fiche. */
function ProgressLine({
  title,
  value,
  label,
  onClick,
}: {
  title: string;
  /** null : avancement inconnu, pas de barre. */
  value: number | null;
  label: string;
  onClick: () => void;
}) {
  return (
    <li className="row">
      <button type="button" className="row__main row__button progress-line" onClick={onClick}>
        <span className="progress-line__head">
          <span className="row__title">{title}</span>
          <span className="row__meta-item">{label}</span>
        </span>
        {value != null && <ProgressBar value={value} label={title} />}
      </button>
    </li>
  );
}

const FIELDS: { key: keyof WeeklyReviewText; title: string; placeholder: string }[] = [
  { key: 'done_text', title: 'Ce qui a été fait', placeholder: 'Signatures, livrables, rendez-vous marquants…' },
  { key: 'slipping_text', title: 'Ce qui glisse', placeholder: 'Ce qui prend du retard, et pourquoi' },
  { key: 'next_priority_text', title: 'Priorité de la semaine prochaine', placeholder: 'La chose la plus importante' },
];

/**
 * Bilan libre, enregistré sur cet ordinateur à chaque frappe (localStorage,
 * synchrone) : comme sur le mobile, il n'est pas synchronisé.
 */
function ReviewNotes({ userId, week }: { userId: string; week: DateKey }) {
  const [review, setReview] = useState<WeeklyReviewText>(() => loadWeeklyReview(userId, week));

  const update = (key: keyof WeeklyReviewText, text: string) => {
    const next = { ...review, [key]: text };
    setReview(next);
    saveWeeklyReview(userId, week, next);
  };

  return (
    <CategoryCard category="notes" icon={NotebookPen} title="Bilan">
      <div className="form">
        {FIELDS.map((f) => (
          <FormField key={f.key} label={f.title} htmlFor={`review-${f.key}`}>
            <textarea
              id={`review-${f.key}`}
              className="input textarea"
              rows={3}
              value={review[f.key]}
              onChange={(e) => update(f.key, e.target.value)}
              placeholder={f.placeholder}
            />
          </FormField>
        ))}
        <CardNote>Enregistré automatiquement sur cet ordinateur (non synchronisé avec le mobile).</CardNote>
      </div>
    </CategoryCard>
  );
}
