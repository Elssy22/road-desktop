import { Building2, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { ProjectSelect } from '../../components/ProjectSelect';
import { CardList, CardNote, CategoryCard, ErrorBanner, TextAction } from '../../components/ui';
import { notifyDataChanged } from '../../data/base';
import { listProjects, type ProjectWithProgress } from '../../data/projects';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { useWrite } from '../../data/useWrite';
import { formatDueLabel, type DateKey } from '../../lib/dates';
import { formatMoney, formatTotals, totalsByCurrency } from '../../lib/money';
import {
  fetchQontoItems,
  groupQontoItems,
  isProjectLinkable,
  QONTO_KIND_LABELS,
  setQontoItemProject,
  syncQonto,
  type QontoItem,
  type QontoKind,
} from '../../lib/qonto';
import { useToday } from '../../lib/useToday';

type Feedback = { tone: 'success' | 'danger'; text: string };

const KIND_ORDER: QontoKind[] = ['client_invoice', 'quote', 'transaction'];
const EMPTY: QontoItem[] = [];
const NO_PROJECTS: ProjectWithProgress[] = [];

/** "12 importés (Factures clients 4 · Devis 2 · Transactions 6)" */
function describeImport(imported: Partial<Record<QontoKind, number>>, total: number): string {
  const parts = KIND_ORDER.filter((k) => imported[k] !== undefined).map(
    (k) => `${QONTO_KIND_LABELS[k]} ${imported[k]}`
  );
  return `${total} élément${total > 1 ? 's' : ''} importé${total > 1 ? 's' : ''}${parts.length ? ` (${parts.join(' · ')})` : ''}.`;
}

/**
 * Section « Depuis Qonto » de l'écran Finances : portage web de
 * mobile-legacy/src/screens/agency/QontoSection.tsx. Lecture seule : les données
 * sont importées par l'Edge Function qonto-sync (seul endroit où la clé Qonto
 * existe, dans les secrets Supabase) puis relues dans qonto_items. L'app
 * n'appelle jamais l'API Qonto et ne détient aucun secret (DECISIONS.md §14).
 * Seule exception : le projet lié d'une facture ou d'un devis, choisi à la main
 * (jamais de rapprochement automatique sur le libellé ou le montant).
 */
export function QontoSection({ userId }: { userId: string }) {
  const today = useToday();
  const load = useCallback(() => fetchQontoItems(userId), [userId]);
  const { data: items, error, loading } = useRemoteQuery(load, EMPTY);
  const { data: projects } = useRemoteQuery(listProjects, NO_PROJECTS);
  const { run, error: writeError } = useWrite();
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const onSync = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      const result = await syncQonto();
      const failed = result.errors.map((e) => `${QONTO_KIND_LABELS[e.kind] ?? e.kind} : ${e.message}`);
      setFeedback({
        tone: failed.length ? 'danger' : 'success',
        text: [describeImport(result.imported, result.total), ...failed].join('\n'),
      });
    } catch (e) {
      setFeedback({ tone: 'danger', text: `Échec de la synchronisation : ${(e as Error).message}` });
    } finally {
      setSyncing(false);
      // Relit cette liste et les écrans montés (objectifs de CA calculés depuis Qonto).
      notifyDataChanged();
    }
  };

  const groups = useMemo(() => groupQontoItems(items, today), [items, today]);

  return (
    // Carte lavande (Finances), sous les cartes de l'écran Finances (DECISIONS.md §30).
    <CategoryCard
      category="finance"
      icon={Building2}
      title="Depuis Qonto"
      action={
        <TextAction
          label={syncing ? 'Synchronisation…' : 'Synchroniser'}
          icon={RefreshCw}
          category="finance"
          title="Importer les transactions, factures et devis Qonto"
          disabled={syncing}
          onClick={() => void onSync()}
        />
      }
    >
      <CardNote>Importé depuis Qonto · lecture seule, sauf le projet lié des factures et devis</CardNote>
      <ErrorBanner message={writeError} />
      {feedback && (
        <p className={feedback.tone === 'danger' ? 'notice notice--error' : 'notice notice--info'} role="status">
          {feedback.text}
        </p>
      )}
      {error ? (
        <CardNote tone="danger">Données Qonto illisibles pour l’instant : {error}</CardNote>
      ) : groups.length === 0 ? (
        loading ? null : (
          <CardNote>Rien d’importé pour l’instant. Lance une synchronisation.</CardNote>
        )
      ) : (
        groups.map((group) => (
          <div key={group.key} className="qonto-group">
            <div className="qonto-group__head">
              <span className={`qonto-group__title qonto-group__title--${group.tone}`}>
                {group.title} · {group.data.length}
              </span>
              <span className="card__amount">{formatTotals(totalsByCurrency(group.data))}</span>
            </div>
            <CardList>
              {group.data.map((item) => (
                <QontoRow
                  key={item.id}
                  item={item}
                  today={today}
                  late={group.tone === 'danger'}
                  projects={projects}
                  onLink={(projectId) => run(() => setQontoItemProject(item.id, projectId))}
                />
              ))}
            </CardList>
          </div>
        ))
      )}
    </CategoryCard>
  );
}

function QontoRow({
  item,
  today,
  late,
  projects,
  onLink,
}: {
  item: QontoItem;
  today: DateKey;
  late: boolean;
  projects: ProjectWithProgress[];
  onLink: (projectId: string | null) => Promise<boolean>;
}) {
  const [linking, setLinking] = useState(false);
  const dates = [
    item.qonto_date && formatDueLabel(item.qonto_date, today),
    item.due_date && `${item.kind === 'quote' ? 'Expire' : 'Échéance'} ${formatDueLabel(item.due_date, today)}`,
  ].filter(Boolean);
  // Transactions : les encaissements ressortent en vert, les débits restent neutres.
  const credit = item.kind === 'transaction' && item.amount > 0;

  return (
    <li className="row">
      <div className="row__main">
        <span className="row__title row__title--strong">{item.label || 'Sans libellé'}</span>
        {dates.length > 0 && (
          <span className="row__meta">
            <span className={late ? 'row__meta-item row__meta-item--danger' : 'row__meta-item'}>
              {dates.join(' · ')}
            </span>
          </span>
        )}
        {isProjectLinkable(item) && (
          <span className="qonto-row__project">
            <label className="qonto-row__project-label" htmlFor={`qonto-project-${item.id}`}>
              Projet lié
            </label>
            <ProjectSelect
              id={`qonto-project-${item.id}`}
              projects={projects.filter((p) => p.status !== 'terminé' || p.id === item.project_id)}
              value={item.project_id}
              disabled={linking}
              onChange={(projectId) => {
                setLinking(true);
                void onLink(projectId).finally(() => setLinking(false));
              }}
            />
          </span>
        )}
      </div>
      <span className={credit ? 'row__amount row__amount--credit' : 'row__amount'}>
        {formatMoney(item.amount, item.currency)}
      </span>
    </li>
  );
}
