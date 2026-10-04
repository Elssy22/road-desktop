import { FileUp, Plus, ShieldCheck, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useConfirm } from '../../components/Dialog';
import { askMarkAsActiveClient, STAGE_ICONS, StageSelect } from '../../components/PipelineStage';
import { SearchField } from '../../components/SearchField';
import {
  CardList,
  CardNote,
  CategoryCard,
  ErrorBanner,
  GradientButton,
  ListRow,
  ScreenHeader,
  TextAction,
} from '../../components/ui';
import {
  listContacts,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGES,
  segmentLabel,
  setPipelineStage,
  type Contact,
  type ContactWithLast,
  type PipelineStage,
} from '../../data/crm';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { useWrite } from '../../data/useWrite';
import { formatDueLabel, type DateKey } from '../../lib/dates';
import { formatMoney } from '../../lib/money';
import { makeMatcher } from '../../lib/search';
import { useToday } from '../../lib/useToday';

const EMPTY: ContactWithLast[] = [];

/** Relance la plus proche d'abord (sans date en dernier), puis par nom. */
const byFollowup = (a: Contact, b: Contact) =>
  (a.next_followup_date ?? '9999').localeCompare(b.next_followup_date ?? '9999') ||
  a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });

/**
 * Pipeline de prospection (DECISIONS.md §31) : portage web de
 * mobile-legacy/src/screens/agency/PipelineBoard.tsx. Sur grand écran, les cinq
 * colonnes sont côte à côte (vrai kanban) ; elles s'empilent sur fenêtre étroite.
 * Pas de glisser-déposer : la liste « Étape » de chaque carte change la colonne.
 */
export function PipelineScreen() {
  const navigate = useNavigate();
  const today = useToday();
  const { data: contacts, error, loading } = useRemoteQuery(listContacts, EMPTY);
  const { run, error: writeError } = useWrite();
  const { confirm, dialog } = useConfirm();
  const [query, setQuery] = useState('');

  const prospects = useMemo(() => {
    const matches = makeMatcher(query);
    return contacts.filter(
      (c) =>
        c.pipeline_stage !== null &&
        matches(c.name, c.role, c.club ?? '', c.notes ?? '', segmentLabel(c.segment) ?? '')
    );
  }, [contacts, query]);

  const columns = useMemo(
    () =>
      PIPELINE_STAGES.map((stage) => {
        const items = prospects.filter((c) => c.pipeline_stage === stage).sort(byFollowup);
        const total = Math.round(items.reduce((sum, c) => sum + (c.pipeline_amount ?? 0), 0) * 100) / 100;
        return { stage, items, total };
      }),
    [prospects]
  );

  const changeStage = (c: Contact, stage: PipelineStage) => {
    if (stage === c.pipeline_stage) return;
    void run(() => setPipelineStage(c, stage));
    if (stage === 'signe') {
      askMarkAsActiveClient(confirm, c.name, () => void run(() => setPipelineStage({ ...c, pipeline_stage: stage }, null)));
    }
  };

  return (
    <div className="screen screen--full">
      <ScreenHeader
        eyebrow="Agence"
        title="Pipeline"
        action={
          <div className="header-actions">
            <TextAction label="Purge RGPD" icon={ShieldCheck} onClick={() => navigate('/agency/prospect-purge')} />
            <TextAction label="Importer un fichier" icon={FileUp} onClick={() => navigate('/agency/contacts/import')} />
            <GradientButton label="Contact" icon={Plus} onClick={() => navigate('/agency/contacts/new')} />
          </div>
        }
      />
      <ErrorBanner message={writeError ?? error} />
      <div className="stack">
        <div className="toolbar">
          <SearchField value={query} onChange={setQuery} placeholder="Rechercher un prospect, un segment…" />
        </div>

        {prospects.length === 0 ? (
          loading ? null : (
            <CategoryCard category="contacts" icon={TrendingUp} title="Prospection">
              <CardNote>
                {query.trim()
                  ? 'Aucun prospect ne correspond.'
                  : 'Aucun prospect. Dans la fiche d’un contact, « Modifier » puis coche « Prospection » pour le suivre ici.'}
              </CardNote>
            </CategoryCard>
          )
        ) : (
          <div className="kanban">
            {columns.map(({ stage, items, total }) => (
              <CategoryCard
                key={stage}
                category="contacts"
                icon={STAGE_ICONS[stage]}
                title={PIPELINE_STAGE_LABELS[stage]}
                count={items.length}
                action={total > 0 ? <span className="card__amount">{formatMoney(total, 'EUR')}</span> : undefined}
              >
                {items.length > 0 ? (
                  <CardList>
                    {items.map((c) => (
                      <ListRow
                        key={c.id}
                        title={c.name || 'Sans nom'}
                        subtitle={prospectSubtitle(c, today)}
                        muted={stage === 'perdu'}
                        onClick={() => navigate(`/agency/contacts/${c.id}`)}
                        right={
                          <StageSelect
                            value={stage}
                            onChange={(s) => changeStage(c, s)}
                            label={`Changer l’étape de ${c.name || 'ce contact'}`}
                          />
                        }
                      />
                    ))}
                  </CardList>
                ) : (
                  <CardNote>Aucun prospect à cette étape.</CardNote>
                )}
              </CategoryCard>
            ))}
          </div>
        )}
        {prospects.length > 0 && (
          <CardNote>Clique sur un prospect pour ouvrir sa fiche ; la liste à droite le change d’étape.</CardNote>
        )}
      </div>
      {dialog}
    </div>
  );
}

function prospectSubtitle(c: Contact, today: DateKey): string | null {
  const parts = [segmentLabel(c.segment)];
  if (c.pipeline_amount != null) parts.push(formatMoney(c.pipeline_amount, 'EUR'));
  if (c.next_followup_date) {
    const label = formatDueLabel(c.next_followup_date, today);
    parts.push(c.next_followup_date < today ? `Relance en retard (${label})` : `Relance ${label}`);
  }
  return parts.filter(Boolean).join(' · ') || null;
}
