import { Copy, EyeOff, RefreshCw, Search, Send, SlidersHorizontal, Sparkles, Star, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ExternalLinkAction } from '../../components/ExternalLinkAction';
import { Badge, CardList, CardNote, CategoryCard, Chip, ChipRow, ErrorBanner, ScreenHeader, TextAction } from '../../components/ui';
import { notifyDataChanged } from '../../data/base';
import {
  listTenderOffers,
  setTenderStatus,
  TENDER_STATUS_LABELS,
  TENDER_STATUSES,
  type TenderOffer,
  type TenderStatus,
} from '../../data/tenderOffers';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { useWrite } from '../../data/useWrite';
import { formatEditedLabel, type DateKey } from '../../lib/dates';
import { useToday } from '../../lib/useToday';
import { deadlineLabel, fetchVeilleSettings, isUrgent, offersFor, syncBoamp, type VeilleSettings } from '../../lib/veille';

const EMPTY: TenderOffer[] = [];

/** Libellés courts des filtres (le sélecteur de chaque avis garde les libellés complets). */
const FILTER_LABELS: Record<TenderStatus, string> = {
  nouveau: 'Nouveaux',
  interessant: 'Intéressants',
  ignore: 'Ignorés',
  candidate: 'Candidatures',
};

const STATUS_ICONS: Record<TenderStatus, LucideIcon> = {
  nouveau: Sparkles,
  interessant: Star,
  ignore: EyeOff,
  candidate: Send,
};

type Feedback = { tone: 'success' | 'danger'; text: string };

/**
 * Veille BOAMP : portage web de mobile-legacy/src/screens/agency/VeilleScreen.tsx.
 * Avis repérés par l'Edge Function boamp-sync (DECISIONS.md §33), lus dans
 * tender_offers ; l'app ne fait qu'en changer le statut.
 */
export function VeilleScreen({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const today = useToday();
  const { data: all, error, loading } = useRemoteQuery(listTenderOffers, EMPTY);
  const { run, error: writeError } = useWrite();
  const [filter, setFilter] = useState<TenderStatus>('nouveau');
  const [settings, setSettings] = useState<VeilleSettings | null>(null);
  const [searching, setSearching] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const loadSettings = useCallback(
    () =>
      fetchVeilleSettings(userId)
        .then(setSettings)
        // Migration 015 absente ou réseau : pas d'état de recherche, la liste reste utilisable.
        .catch(() => undefined),
    [userId]
  );
  useEffect(() => void loadSettings(), [loadSettings]);

  const counts = useMemo(() => {
    const out: Record<TenderStatus, number> = { nouveau: 0, interessant: 0, ignore: 0, candidate: 0 };
    for (const o of all) out[o.status] = (out[o.status] ?? 0) + 1;
    return out;
  }, [all]);
  const visible = useMemo(() => offersFor(all, filter, today), [all, filter, today]);

  const onSearch = async () => {
    setSearching(true);
    setFeedback(null);
    try {
      const result = await syncBoamp();
      setFeedback({
        tone: 'success',
        text:
          result.added > 0
            ? `${result.added} nouvel${result.added > 1 ? 's' : ''} appel${result.added > 1 ? 's' : ''} d’offres.`
            : 'Aucun nouvel appel d’offres.',
      });
    } catch (e) {
      setFeedback({ tone: 'danger', text: `Échec de la recherche : ${(e as Error).message}` });
    } finally {
      setSearching(false);
      // Relit la liste (nouveaux avis) et l'état de la dernière recherche.
      notifyDataChanged();
      void loadSettings();
    }
  };

  const lastRun = settings?.last_run_at
    ? `Dernière recherche : ${formatEditedLabel(settings.last_run_at, today)}`
    : settings
      ? 'Aucune recherche pour l’instant.'
      : 'État de la recherche indisponible (connexion requise).';

  return (
    <div className="screen">
      <ScreenHeader
        eyebrow="Agence"
        title="Veille appels d’offres"
        action={
          <TextAction
            label="Mots-clés"
            icon={SlidersHorizontal}
            onClick={() => navigate('/agency/veille/settings')}
            title="Mots-clés de la veille"
          />
        }
      />
      <ErrorBanner message={error ?? writeError} />
      <div className="stack">
        {/* Catégorie Veille : cartes lavande (DECISIONS.md §33). */}
        <CategoryCard
          category="veille"
          icon={Search}
          title="Recherche BOAMP"
          action={
            <TextAction
              label={searching ? 'Recherche…' : 'Synchroniser'}
              icon={RefreshCw}
              category="veille"
              title="Chercher de nouveaux appels d’offres"
              disabled={searching}
              onClick={() => void onSearch()}
            />
          }
        >
          <CardNote>{lastRun}</CardNote>
          {settings?.last_run_status === 'erreur' && !feedback && (
            <CardNote tone="danger">
              Dernière tentative en échec{settings.last_run_message ? ` : ${settings.last_run_message}` : '.'}
            </CardNote>
          )}
          {feedback && (
            <p className={feedback.tone === 'danger' ? 'notice notice--error' : 'notice notice--info'} role="status">
              {feedback.text}
            </p>
          )}
        </CategoryCard>

        <ChipRow>
          {TENDER_STATUSES.map((s) => (
            <Chip key={s} label={`${FILTER_LABELS[s]} · ${counts[s]}`} selected={filter === s} onClick={() => setFilter(s)} />
          ))}
        </ChipRow>

        <CategoryCard category="veille" icon={STATUS_ICONS[filter]} title={TENDER_STATUS_LABELS[filter]} count={visible.length}>
          {visible.length > 0 ? (
            <CardList>
              {visible.map((o) => (
                <TenderRow
                  key={o.id}
                  offer={o}
                  today={today}
                  onStatus={(status) => void run(() => setTenderStatus(o.id, status))}
                />
              ))}
            </CardList>
          ) : loading ? null : (
            <CardNote>
              {filter === 'nouveau'
                ? 'Aucun nouvel appel d’offres. Lance une recherche avec « Synchroniser ».'
                : 'Aucun appel d’offres avec ce statut.'}
            </CardNote>
          )}
        </CategoryCard>
      </div>
    </div>
  );
}

function TenderRow({
  offer,
  today,
  onStatus,
}: {
  offer: TenderOffer;
  today: DateKey;
  onStatus: (status: TenderStatus) => void;
}) {
  const urgent = isUrgent(offer, today);
  const meta = [offer.buyer, offer.department && `Dép. ${offer.department}`, offer.procedure].filter(Boolean);
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    if (!offer.url) return;
    try {
      await navigator.clipboard.writeText(offer.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers refusé : le lien reste ouvrable.
    }
  };

  return (
    <li className="tender-row">
      <span className="row__title row__title--strong">{offer.title}</span>
      {meta.length > 0 && <span className="row__subtitle">{meta.join(' · ')}</span>}
      <span className="row__meta">
        <span className={urgent ? 'row__meta-item row__meta-item--danger tender-row__deadline' : 'row__meta-item'}>
          {deadlineLabel(offer, today)}
        </span>
        {urgent && <Badge label="Urgent" color="var(--color-danger)" />}
      </span>
      {offer.categories.length > 0 && <span className="tender-row__categories">{offer.categories.join(' · ')}</span>}
      <span className="tender-row__actions">
        <select
          className="stage-select"
          value={offer.status}
          aria-label={`Statut de l’appel d’offres « ${offer.title} »`}
          title="Statut de l’appel d’offres"
          onChange={(e) => onStatus(e.target.value as TenderStatus)}
        >
          {TENDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TENDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {offer.url && (
          <>
            <ExternalLinkAction href={offer.url} label="Voir l’avis" />
            <TextAction
              label={copied ? 'Lien copié' : 'Copier le lien'}
              icon={Copy}
              category="veille"
              onClick={() => void copyLink()}
            />
          </>
        )}
      </span>
    </li>
  );
}
