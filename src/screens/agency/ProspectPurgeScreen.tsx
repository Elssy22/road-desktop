import { ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useConfirm } from '../../components/Dialog';
import { CardList, CardNote, CategoryCard, ErrorBanner, ListRow, ScreenHeader, TextAction } from '../../components/ui';
import {
  listProspectsForRetention,
  PIPELINE_STAGE_LABELS,
  purgeContacts,
  segmentLabel,
  type PipelineStage,
  type RetentionRow,
} from '../../data/crm';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { useWrite } from '../../data/useWrite';
import { PROSPECT_RETENTION_YEARS, purgeCandidates } from '../../lib/crmRetention';
import { formatDueLabel, toDateKey } from '../../lib/dates';
import { useToday } from '../../lib/useToday';

const EMPTY: RetentionRow[] = [];
const dayOf = (iso: string | null) => (iso ? toDateKey(new Date(iso)) : null);

/**
 * Purge RGPD des prospects inactifs (DECISIONS.md §32) : portage web de
 * mobile-legacy/src/screens/ProspectPurgeScreen.tsx (Réglages > Données
 * personnelles sur le mobile, rangé dans l'Agence sur Mac tant que les Réglages
 * ne sont pas portés). Rien n'est supprimé sans une confirmation explicite,
 * contact par contact ou pour toute la liste.
 */
export function ProspectPurgeScreen() {
  const navigate = useNavigate();
  const today = useToday();
  const { run, error: writeError } = useWrite();
  const { confirm, dialog } = useConfirm();
  const { data: prospects, error, loading } = useRemoteQuery(listProspectsForRetention, EMPTY);

  const candidates = useMemo(
    () =>
      purgeCandidates(
        prospects.map((p) => ({
          ...p,
          created_day: toDateKey(new Date(p.created_at)),
          stage_changed_day: dayOf(p.stage_changed_at),
          last_interaction_day: dayOf(p.last_interaction_at),
          last_appointment_day: dayOf(p.last_appointment_at),
        })),
        today
      ),
    [prospects, today]
  );

  const purge = (list: RetentionRow[]) => void run(() => purgeContacts(list.map((c) => c.id)));

  const confirmOne = (c: RetentionRow) =>
    confirm({
      title: `Supprimer ${c.name || 'ce prospect'} ?`,
      message:
        'La fiche, ses interactions et ses relances sont supprimées et leurs données personnelles effacées. Action définitive.',
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () => purge([c]),
    });

  const confirmAll = () => {
    const n = candidates.length;
    confirm({
      title: `Supprimer ${n} prospect${n > 1 ? 's' : ''} ?`,
      message:
        'Toutes les fiches listées, leurs interactions et leurs relances sont supprimées et leurs données personnelles effacées. Action définitive.',
      confirmLabel: `Supprimer les ${n}`,
      danger: true,
      onConfirm: () => purge(candidates),
    });
  };

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Données personnelles" title="Purge RGPD" />
      <ErrorBanner message={writeError ?? error} />
      {!loading && (
        <div className="stack">
          <CategoryCard category="contacts" icon={ShieldCheck} title="Prospects inactifs" count={candidates.length}>
            <CardNote>
              Durée de conservation : un prospect non signé sans aucun signe de vie (création, changement d’étape,
              interaction, RDV) depuis {PROSPECT_RETENTION_YEARS} ans peut être supprimé. Rien n’est supprimé sans ta
              confirmation.
            </CardNote>
            {candidates.length > 0 ? (
              <CardList>
                {candidates.map((c) => (
                  <ListRow
                    key={c.id}
                    title={c.name || 'Sans nom'}
                    subtitle={[
                      PIPELINE_STAGE_LABELS[c.pipeline_stage as PipelineStage] ?? c.pipeline_stage,
                      segmentLabel(c.segment),
                      `Dernier signe de vie : ${formatDueLabel(c.last_sign_day, today)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    left={<UserRound size={18} className="tint-icon" />}
                    right={
                      <TextAction label="Supprimer" icon={Trash2} category="contacts" onClick={() => confirmOne(c)} />
                    }
                    onClick={() => navigate(`/agency/contacts/${c.id}`)}
                  />
                ))}
              </CardList>
            ) : (
              <CardNote>Aucun prospect à purger.</CardNote>
            )}
          </CategoryCard>
          {candidates.length > 1 && (
            <button type="button" className="button button--danger" onClick={confirmAll}>
              Tout supprimer ({candidates.length})
            </button>
          )}
        </div>
      )}
      {dialog}
    </div>
  );
}
