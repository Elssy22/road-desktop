import { CheckCheck, CircleAlert, Clock, Plus, Wallet, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { CardList, CardNote, CategoryCard, ErrorBanner, GradientButton, ScreenHeader } from '../../components/ui';
import {
  effectiveStatus,
  KIND_LABELS,
  listMoneyItems,
  MONEY_STATUS_LABELS,
  MONEY_STATUSES,
  type MoneyItemWithLinks,
} from '../../data/money';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { formatDueLabel, type DateKey } from '../../lib/dates';
import { formatMoney, formatTotals, totalsByCurrency } from '../../lib/money';
import { useToday } from '../../lib/useToday';
import { QontoSection } from './QontoSection';

const EMPTY: MoneyItemWithLinks[] = [];

const STATUS_ICONS: Record<string, LucideIcon> = {
  en_retard: CircleAlert,
  en_attente: Clock,
  payé: CheckCheck,
};

type Group = { status: string; title: string; total: string; data: MoneyItemWithLinks[] };

/**
 * Suivi financier : portage web de mobile-legacy/src/screens/agency/MoneyScreen.tsx.
 * Lignes groupées par statut (une carte lavande par statut), total par groupe
 * et par devise, puis la section « Depuis Qonto ».
 */
export function MoneyScreen({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const today = useToday();
  const { data: items, error, loading } = useRemoteQuery(listMoneyItems, EMPTY);

  const groups = useMemo(() => {
    const byStatus = new Map<string, MoneyItemWithLinks[]>();
    for (const item of items) {
      const s = effectiveStatus(item, today);
      byStatus.set(s, [...(byStatus.get(s) ?? []), item]);
    }
    // Statuts connus dans l'ordre prévu, puis d'éventuels statuts libres (autre appareil, saisie SQL…).
    const known = MONEY_STATUSES as readonly string[];
    const order = [...known, ...[...byStatus.keys()].filter((s) => !known.includes(s))];
    return order
      .filter((s) => byStatus.has(s))
      .map((s): Group => {
        const data = byStatus.get(s)!;
        return { status: s, title: MONEY_STATUS_LABELS[s] ?? s, total: formatTotals(totalsByCurrency(data)), data };
      });
  }, [items, today]);

  return (
    <div className="screen">
      <ScreenHeader
        eyebrow="Agence"
        title="Finances"
        action={<GradientButton label="Ligne" icon={Plus} onClick={() => navigate('/agency/money/new')} />}
      />
      <ErrorBanner message={error} />
      <div className="stack">
        {/* Catégorie Finances : un statut = une carte lavande (DECISIONS.md §30). */}
        {groups.length === 0 && !loading && !error ? (
          <CategoryCard category="finance" icon={Wallet} title="Finances">
            <CardNote>Aucune ligne. Ajoute une commission, une facture ou un paiement avec « Ligne ».</CardNote>
          </CategoryCard>
        ) : (
          groups.map((g) => (
            <CategoryCard
              key={g.status}
              category="finance"
              icon={STATUS_ICONS[g.status] ?? Wallet}
              title={g.title}
              danger={g.status === 'en_retard'}
              count={g.data.length}
              action={<span className="card__amount">{g.total}</span>}
            >
              <CardList>
                {g.data.map((item) => (
                  <MoneyRow key={item.id} item={item} today={today} late={g.status === 'en_retard'} />
                ))}
              </CardList>
            </CategoryCard>
          ))
        )}

        <QontoSection userId={userId} />
      </div>
    </div>
  );
}

function MoneyRow({ item, today, late }: { item: MoneyItemWithLinks; today: DateKey; late: boolean }) {
  const navigate = useNavigate();
  const links = [item.contact_name, item.project_title].filter(Boolean).join(' · ');

  return (
    <li className="row">
      <button type="button" className="row__main row__button" onClick={() => navigate(`/agency/money/${item.id}`)}>
        <span className="row__title row__title--strong">{item.label || 'Sans libellé'}</span>
        <span className="row__meta">
          <span className="row__meta-item">{KIND_LABELS[item.kind] ?? item.kind}</span>
          {item.due_date && (
            <span className={late ? 'row__meta-item row__meta-item--danger' : 'row__meta-item'}>
              · Échéance {formatDueLabel(item.due_date, today)}
            </span>
          )}
        </span>
        {links ? <span className="row__subtitle">{links}</span> : null}
      </button>
      <span className="row__amount">{formatMoney(item.amount, item.currency)}</span>
    </li>
  );
}
