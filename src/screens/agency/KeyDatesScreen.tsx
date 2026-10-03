import { Archive, Hourglass, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { KeyDateRow } from '../../components/KeyDateRow';
import {
  CardList,
  CardNote,
  CategoryCard,
  ErrorBanner,
  GradientButton,
  ScreenHeader,
  SegmentedControl,
} from '../../components/ui';
import { listKeyDates, type KeyDateWithContact } from '../../data/keyDates';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { useToday } from '../../lib/useToday';

const EMPTY: KeyDateWithContact[] = [];

type Filter = 'upcoming' | 'past';

/** Échéancier : portage web de mobile-legacy/src/screens/agency/KeyDatesScreen.tsx. */
export function KeyDatesScreen() {
  const navigate = useNavigate();
  const today = useToday();
  const { data: all, error, loading } = useRemoteQuery(listKeyDates, EMPTY);
  const [filter, setFilter] = useState<Filter>('upcoming');

  // À venir : de la plus proche à la plus lointaine ; passées : la plus récente d'abord.
  const { upcoming, past } = useMemo(
    () => ({
      upcoming: all.filter((k) => k.date >= today),
      past: all.filter((k) => k.date < today).reverse(),
    }),
    [all, today]
  );
  const visible = filter === 'upcoming' ? upcoming : past;

  return (
    <div className="screen">
      <ScreenHeader
        eyebrow="Agence"
        title="Échéancier"
        action={<GradientButton label="Date clé" icon={Plus} onClick={() => navigate('/agency/key-dates/new')} />}
      />
      <ErrorBanner message={error} />
      <div className="stack">
        <SegmentedControl<Filter>
          options={[
            { value: 'upcoming', label: `À venir · ${upcoming.length}` },
            { value: 'past', label: `Passées · ${past.length}` },
          ]}
          value={filter}
          onChange={setFilter}
        />

        {/* Catégorie Échéances clés : la liste est une carte beurre (DECISIONS.md §29). */}
        <CategoryCard
          category="keyDates"
          icon={filter === 'upcoming' ? Hourglass : Archive}
          title={filter === 'upcoming' ? 'À venir' : 'Passées'}
          count={visible.length}
        >
          {visible.length > 0 ? (
            <CardList>
              {visible.map((k) => (
                <KeyDateRow key={k.id} keyDate={k} today={today} />
              ))}
            </CardList>
          ) : loading ? null : (
            <CardNote>
              {filter === 'upcoming'
                ? 'Aucune échéance à venir. Clique sur « Date clé » pour en ajouter une.'
                : 'Aucune échéance passée.'}
            </CardNote>
          )}
        </CategoryCard>
      </div>
    </div>
  );
}
