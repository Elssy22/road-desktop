import { Banknote, Flag, Minus, Plus, TrendingUp, Trophy } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { useConfirm } from '../../components/Dialog';
import {
  CardNote,
  CategoryCard,
  Chip,
  ChipRow,
  ErrorBanner,
  FormField,
  ProgressBar,
  ScreenHeader,
  SegmentedControl,
} from '../../components/ui';
import {
  addGoal,
  clampProgress,
  getGoal,
  loadQontoReceipts,
  softDeleteGoal,
  sumReceipts,
  updateGoal,
  type Goal,
  type QontoReceipts,
} from '../../data/goals';
import { listProjects, type ProjectWithProgress } from '../../data/projects';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { useWrite } from '../../data/useWrite';
import { changedFields } from '../../data/base';
import { CA_PERIODS, caPeriodBounds, caProgress, formatCaPeriod, type CaPeriod, type GoalKind } from '../../lib/caGoals';
import type { DateKey } from '../../lib/dates';
import { errorMessage } from '../../lib/errors';
import { amountToInput, formatEuros, parseAmount } from '../../lib/money';
import { useFormExit } from '../../lib/useFormExit';

type Form = {
  title: string;
  target_date: DateKey | null;
  project_id: string | null;
  progress: number;
  kind: GoalKind;
  /** Montant cible saisi (texte libre, cf. parseAmount). */
  ca_amount: string;
  ca_period: CaPeriod;
};
const EMPTY_FORM: Form = {
  title: '',
  target_date: null,
  project_id: null,
  progress: 0,
  kind: 'manuel',
  ca_amount: '',
  ca_period: 'trimestre',
};
const NO_PROJECTS: ProjectWithProgress[] = [];
const PROGRESS_PRESETS = [0, 25, 50, 75, 100];
const KINDS = [
  { value: 'manuel', label: 'Manuel' },
  { value: 'ca', label: 'Chiffre d’affaires' },
] as const;

const toForm = (g: Goal): Form => ({
  title: g.title,
  target_date: g.target_date,
  project_id: g.project_id,
  progress: g.progress,
  kind: g.kind,
  ca_amount: g.ca_target_amount != null ? amountToInput(g.ca_target_amount) : '',
  ca_period: g.ca_period ?? 'trimestre',
});

/**
 * Création (`/agency/goals/new`) ou modification (`/agency/goals/:id`) d'un
 * objectif : portage web de mobile-legacy/src/screens/agency/GoalFormScreen.tsx.
 */
export function GoalFormScreen({ userId }: { userId: string }) {
  const { id } = useParams();
  // Même écran pour les deux routes : la clé repart d'un formulaire vierge (et relu).
  return <GoalForm key={id ?? 'new'} id={id} userId={userId} />;
}

function GoalForm({ id, userId }: { id?: string; userId: string }) {
  const goBack = useFormExit('/agency/goals');
  const { run, error: writeError } = useWrite();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: projects } = useRemoteQuery(listProjects, NO_PROJECTS);
  // Projets proposés : en cours, plus celui déjà lié quel que soit son statut.
  const choices = projects.filter((p) => p.status !== 'terminé' || p.id === form.project_id);

  // Lu une seule fois à l'ouverture (une écriture ailleurs pendant la saisie ne l'écrase pas).
  useEffect(() => {
    if (!id) return;
    let active = true;
    getGoal(id)
      .then((g) => {
        if (!active) return;
        setGoal(g);
        if (g) setForm(toForm(g));
      })
      .catch((e: unknown) => active && setLoadError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const isCa = form.kind === 'ca';

  // Objectif de CA : encaissements Qonto lus une fois quand le type passe en CA ;
  // l'aperçu est ensuite recalculé sur place quand la date ou la période change.
  const [qonto, setQonto] = useState<QontoReceipts | null>(null);
  useEffect(() => {
    if (!isCa || qonto) return;
    let active = true;
    void loadQontoReceipts(userId).then((q) => active && setQonto(q));
    return () => {
      active = false;
    };
  }, [isCa, qonto, userId]);

  const caAmount = parseAmount(form.ca_amount);
  const amountInvalid = isCa && form.ca_amount.trim().length > 0 && !caAmount;
  const collectedCents =
    isCa && form.target_date && qonto?.receipts
      ? (() => {
          const { start, end } = caPeriodBounds(form.target_date, form.ca_period);
          return sumReceipts(qonto.receipts, start, end);
        })()
      : null;

  // Objectif de CA : cible > 0 et date cible obligatoires (la période se termine à cette date).
  const caReady = !isCa || (!!caAmount && !!form.target_date);
  const canSave = form.title.trim().length > 0 && caReady && !loading && !saving && (!id || !!goal);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    // progress manuel conservé tel quel pour un objectif de CA (ignoré à l'affichage),
    // pour le retrouver si l'objectif repasse en manuel.
    const fields = {
      title: form.title.trim(),
      target_date: form.target_date,
      project_id: form.project_id,
      progress: clampProgress(form.progress),
      kind: form.kind,
      ca_target_amount: isCa ? caAmount : null,
      ca_period: isCa ? form.ca_period : null,
    };
    setSaving(true);
    const ok = await run(async () => {
      if (goal) await updateGoal(goal.id, changedFields(goal, fields));
      else await addGoal(fields);
    });
    setSaving(false);
    if (ok) goBack();
  };

  const confirmDelete = () => {
    if (!goal) return;
    confirm({
      title: 'Supprimer cet objectif ?',
      message: goal.title || undefined,
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () => void run(() => softDeleteGoal(goal.id)).then((ok) => ok && goBack()),
    });
  };

  const title = id ? 'Objectif' : 'Nouvel objectif';

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Objectifs" title={id ? 'Modifier l’objectif' : 'Nouvel objectif'} />
      <ErrorBanner message={loadError ?? writeError} />
      {id && !loading && !goal && !loadError ? (
        <CategoryCard category="goals" icon={Trophy} title="Objectif">
          <CardNote>Cet objectif n’existe plus (supprimé sur un autre appareil ?).</CardNote>
        </CategoryCard>
      ) : (
        <form className="stack" onSubmit={(e) => void save(e)}>
          {/* Catégorie Objectifs : cartes menthe (DECISIONS.md §29). */}
          <CategoryCard category="goals" icon={Trophy} title={title}>
            <div className="form">
              <FormField label="Objectif *" htmlFor="goal-title">
                <input
                  id="goal-title"
                  className="input"
                  value={form.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  placeholder="Ex. Signer 3 nouveaux clients"
                  autoFocus={!id}
                  disabled={loading}
                />
              </FormField>
              <FormField label="Type">
                <SegmentedControl<GoalKind> options={KINDS} value={form.kind} onChange={(kind) => patch({ kind })} />
              </FormField>
            </div>
          </CategoryCard>

          {isCa ? (
            // Objectif de CA : cible et période à la place de l'avancement manuel.
            <CategoryCard category="goals" icon={Banknote} title="Chiffre d’affaires">
              <div className="form">
                <div className="form form--grid">
                  <FormField
                    label="Montant cible (€) *"
                    htmlFor="goal-ca-amount"
                    error={amountInvalid ? 'Montant invalide (ex. 20000 ou 20000,50).' : null}
                  >
                    <input
                      id="goal-ca-amount"
                      className="input"
                      inputMode="decimal"
                      value={form.ca_amount}
                      onChange={(e) => patch({ ca_amount: e.target.value })}
                      placeholder="Ex. 20000"
                    />
                  </FormField>
                  <FormField label="Période">
                    <SegmentedControl<CaPeriod>
                      options={CA_PERIODS}
                      value={form.ca_period}
                      onChange={(ca_period) => patch({ ca_period })}
                    />
                  </FormField>
                </div>
                <CardNote tone={form.target_date ? 'muted' : 'danger'}>
                  {form.target_date
                    ? `Période comptée : ${formatCaPeriod(form.target_date, form.ca_period)}.`
                    : 'Choisis une date cible ci-dessous : la période se termine à cette date.'}
                </CardNote>
                {collectedCents != null && (
                  <div className="form">
                    <p className="goal-row__amount">
                      Encaissé : {formatEuros(collectedCents / 100)}
                      {caAmount ? ` / ${formatEuros(caAmount)} · ${caProgress(collectedCents, caAmount)} %` : ''}
                    </p>
                    {!!caAmount && <ProgressBar value={caProgress(collectedCents, caAmount)} label="Encaissé sur la période" />}
                  </div>
                )}
                {qonto && !qonto.receipts ? (
                  <CardNote tone="danger">
                    Aperçu indisponible : encaissements Qonto illisibles pour l’instant
                    {qonto.error ? ` (${qonto.error})` : ''}. L’objectif peut quand même être enregistré.
                  </CardNote>
                ) : (
                  <CardNote>
                    Avancement calculé depuis Qonto : encaissements effectués, en euros, sur la période (dernier import
                    Qonto connu).
                  </CardNote>
                )}
              </div>
            </CategoryCard>
          ) : (
            <CategoryCard category="goals" icon={TrendingUp} title={`Avancement · ${form.progress} %`}>
              <div className="progress-stepper">
                <button
                  type="button"
                  className="icon-button icon-button--round"
                  onClick={() => patch({ progress: clampProgress(form.progress - 10) })}
                  aria-label="Moins 10 %"
                  title="Moins 10 %"
                >
                  <Minus size={18} />
                </button>
                <ProgressBar value={form.progress} label="Avancement" />
                <button
                  type="button"
                  className="icon-button icon-button--round"
                  onClick={() => patch({ progress: clampProgress(form.progress + 10) })}
                  aria-label="Plus 10 %"
                  title="Plus 10 %"
                >
                  <Plus size={18} />
                </button>
              </div>
              <ChipRow>
                {PROGRESS_PRESETS.map((p) => (
                  <Chip key={p} label={`${p} %`} selected={form.progress === p} onClick={() => patch({ progress: p })} />
                ))}
              </ChipRow>
            </CategoryCard>
          )}

          <CategoryCard category="goals" icon={Flag} title="Échéance et projet">
            <div className="form">
              <FormField label={isCa ? 'Date cible *' : 'Date cible'} htmlFor="goal-date">
                <span className="inline-field">
                  <input
                    id="goal-date"
                    className="input"
                    type="date"
                    value={form.target_date ?? ''}
                    onChange={(e) => patch({ target_date: e.target.value || null })}
                  />
                  {form.target_date && (
                    <button type="button" className="text-action" onClick={() => patch({ target_date: null })}>
                      Retirer
                    </button>
                  )}
                </span>
              </FormField>
              <FormField label="Projet associé">
                <ChipRow>
                  <Chip label="Aucun" selected={form.project_id === null} onClick={() => patch({ project_id: null })} />
                  {choices.map((p) => (
                    <Chip
                      key={p.id}
                      label={p.title || 'Sans titre'}
                      selected={form.project_id === p.id}
                      onClick={() => patch({ project_id: p.id })}
                    />
                  ))}
                </ChipRow>
              </FormField>
            </div>
          </CategoryCard>

          <div className="form-actions">
            {goal && (
              <button type="button" className="button button--danger" onClick={confirmDelete}>
                Supprimer l’objectif
              </button>
            )}
            <button type="button" className="button button--ghost" onClick={goBack}>
              Annuler
            </button>
            <button type="submit" className="button button--primary" disabled={!canSave}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}
      {dialog}
    </div>
  );
}
