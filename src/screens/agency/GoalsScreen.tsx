import { GitBranch, Plus, RefreshCw, Trophy } from 'lucide-react';
import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  CardList,
  CardNote,
  CategoryCard,
  ErrorBanner,
  GradientButton,
  ProgressBar,
  ScreenHeader,
} from '../../components/ui';
import { isCaGoal, listGoals, type GoalList, type GoalWithProject, type QontoReceipts } from '../../data/goals';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { formatCaPeriod } from '../../lib/caGoals';
import { formatEuros } from '../../lib/money';
import { formatDueLabel, formatEditedLabel, type DateKey } from '../../lib/dates';
import { useToday } from '../../lib/useToday';

const EMPTY: GoalList = { goals: [], qonto: null };

/**
 * Liste des objectifs : portage web de mobile-legacy/src/screens/agency/GoalsScreen.tsx.
 * Objectifs de CA (DECISIONS.md §34) calculés à chaque lecture depuis les
 * encaissements Qonto déjà importés sur Supabase ; si leur lecture échoue, les
 * objectifs manuels restent affichés et les objectifs de CA montrent un encart d'attente.
 */
export function GoalsScreen({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const today = useToday();
  const load = useCallback(() => listGoals(userId), [userId]);
  const { data, error, loading } = useRemoteQuery(load, EMPTY);
  const { goals, qonto } = data;
  const hasCa = goals.some(isCaGoal);

  return (
    <div className="screen">
      <ScreenHeader
        eyebrow="Agence"
        title="Objectifs"
        action={<GradientButton label="Objectif" icon={Plus} onClick={() => navigate('/agency/goals/new')} />}
      />
      <ErrorBanner message={error} />
      <div className="stack">
        {/* Catégorie Objectifs : la liste est une carte menthe (DECISIONS.md §29). */}
        <CategoryCard category="goals" icon={Trophy} title="Objectifs" count={goals.length}>
          {goals.length > 0 ? (
            <CardList>
              {goals.map((g) => (
                <GoalRow key={g.id} goal={g} today={today} qonto={qonto} />
              ))}
            </CardList>
          ) : loading ? null : (
            <CardNote>Aucun objectif. Clique sur « Objectif » pour en ajouter un.</CardNote>
          )}
          {hasCa && <QontoNote qonto={qonto} />}
        </CategoryCard>
      </div>
    </div>
  );
}

/** Provenance des montants des objectifs de CA, ou raison de leur absence. */
function QontoNote({ qonto }: { qonto: QontoReceipts | null }) {
  if (!qonto?.receipts) {
    return (
      <CardNote tone="danger">
        Encaissements Qonto illisibles pour l’instant{qonto?.error ? ` (${qonto.error})` : ''} : les objectifs de
        chiffre d’affaires s’afficheront dès qu’ils seront lisibles.
      </CardNote>
    );
  }
  return (
    <CardNote>
      Chiffre d’affaires calculé depuis les encaissements Qonto déjà importés. Pour les mettre à jour, lance
      « Synchroniser » dans <Link to="/agency/money">Finances › Depuis Qonto</Link>.
    </CardNote>
  );
}

function GoalRow({ goal, today, qonto }: { goal: GoalWithProject; today: DateKey; qonto: QontoReceipts | null }) {
  const navigate = useNavigate();
  const ca = isCaGoal(goal) ? goal : null;
  // Objectif de CA sans encaissements lisibles : pas d'avancement à montrer.
  const pending = ca != null && goal.ca_collected_cents == null;
  const reached = !pending && goal.progress >= 100;
  const late = !reached && goal.target_date != null && goal.target_date < today;

  return (
    <li className="goal-row">
      <div className="goal-row__head">
        <button type="button" className="goal-row__title" onClick={() => navigate(`/agency/goals/${goal.id}`)}>
          {goal.title || 'Sans titre'}
        </button>
        <span className={reached ? 'goal-row__pct goal-row__pct--done' : 'goal-row__pct'}>
          {pending ? '— %' : `${goal.progress} %`}
        </span>
      </div>
      {ca && (
        // Encaissé réel / cible, sous le titre : c'est l'information principale d'un objectif de CA.
        <p className={reached ? 'goal-row__amount goal-row__amount--done' : 'goal-row__amount'}>
          {pending ? '…' : formatEuros((goal.ca_collected_cents ?? 0) / 100)} / {formatEuros(ca.ca_target_amount)}
        </p>
      )}
      {!pending && <ProgressBar value={goal.progress} label={`Avancement de ${goal.title || 'l’objectif'}`} />}
      {ca && (
        <span className="row__meta">
          <span className="row__meta-item">
            <RefreshCw size={12} />
            {pending
              ? `Calcul depuis Qonto en attente · ${formatCaPeriod(ca.target_date, ca.ca_period)}`
              : `Calculé depuis Qonto · ${formatCaPeriod(ca.target_date, ca.ca_period)}` +
                (qonto?.importedAt ? ` · dernier import ${formatEditedLabel(qonto.importedAt, today).toLowerCase()}` : ' · aucun import Qonto')}
          </span>
        </span>
      )}
      {(goal.target_date || goal.project_title) && (
        <span className="row__meta goal-row__meta">
          {goal.target_date && (
            <span className={late ? 'row__meta-item row__meta-item--danger' : 'row__meta-item'}>
              Cible : {formatDueLabel(goal.target_date, today)}
            </span>
          )}
          {goal.project_id && goal.project_title && (
            <button type="button" className="project-link" onClick={() => navigate(`/agency/projects/${goal.project_id}`)}>
              <GitBranch size={12} />
              {goal.project_title}
            </button>
          )}
        </span>
      )}
    </li>
  );
}
