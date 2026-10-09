import { AlarmClock, FileUp, Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { SearchField } from '../../components/SearchField';
import {
  Badge,
  CardList,
  CardNote,
  CategoryCard,
  ErrorBanner,
  GradientButton,
  ListRow,
  ScreenHeader,
  SegmentedControl,
  TextAction,
} from '../../components/ui';
import {
  listContacts,
  SEGMENT_LABELS,
  SEGMENTS,
  segmentLabel,
  type ContactSegment,
  type ContactWithLast,
} from '../../data/crm';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { daysSinceContact, FOLLOW_UP_DAYS } from '../../lib/followUp';
import { makeMatcher } from '../../lib/search';
import { useToday } from '../../lib/useToday';

const EMPTY: ContactWithLast[] = [];

type Mode = 'all' | 'followUp';

/**
 * Liste des contacts : portage web de mobile-legacy/src/screens/agency/ContactsScreen.tsx.
 * Le filtre « Prospects » du mobile devient l'écran Pipeline (entrée à part de
 * la barre latérale) ; un filtre par segment (« Joueurs », « Club pro »…)
 * apparaît dès qu'un contact a un segment.
 */
export function ContactsScreen() {
  const navigate = useNavigate();
  const today = useToday();
  const { data: contacts, error, loading } = useRemoteQuery(listContacts, EMPTY);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('all');
  const [segment, setSegment] = useState<ContactSegment | ''>('');
  const onlyFollowUp = mode === 'followUp';

  // Seuls les segments réellement utilisés sont proposés, dans l'ordre de SEGMENTS.
  const usedSegments = useMemo(() => {
    const used = new Set(contacts.map((c) => c.segment));
    return SEGMENTS.filter((s) => used.has(s));
  }, [contacts]);
  // Segment choisi puis disparu (dernier contact du segment supprimé) : filtre ignoré.
  const activeSegment = segment && usedSegments.includes(segment) ? segment : '';

  const rows = useMemo(() => {
    const matches = makeMatcher(query);
    return contacts
      .filter((c) => !activeSegment || c.segment === activeSegment)
      .filter((c) => matches(c.name, c.role, c.club ?? '', c.notes ?? '', segmentLabel(c.segment) ?? ''))
      .map((c) => ({ contact: c, days: daysSinceContact(c, today) }))
      .filter(({ days }) => !onlyFollowUp || days >= FOLLOW_UP_DAYS);
  }, [contacts, query, activeSegment, onlyFollowUp, today]);

  const followUpCount = useMemo(
    () => contacts.filter((c) => daysSinceContact(c, today) >= FOLLOW_UP_DAYS).length,
    [contacts, today]
  );

  const filtered = query.trim().length > 0 || onlyFollowUp || activeSegment !== '';

  return (
    <div className="screen">
      <ScreenHeader
        eyebrow="Agence"
        title="Contacts"
        action={
          <div className="header-actions">
            <TextAction label="Importer un fichier" icon={FileUp} onClick={() => navigate('/agency/contacts/import')} />
            <GradientButton label="Contact" icon={Plus} onClick={() => navigate('/agency/contacts/new')} />
          </div>
        }
      />
      <ErrorBanner message={error} />
      <div className="stack">
        <div className="toolbar toolbar--wrap">
          <SearchField value={query} onChange={setQuery} placeholder="Rechercher un contact, un club…" />
          {usedSegments.length > 0 && (
            <select
              className="select"
              value={activeSegment}
              onChange={(e) => setSegment(e.target.value as ContactSegment | '')}
              aria-label="Filtrer par segment"
            >
              <option value="">Tous les segments</option>
              {usedSegments.map((s) => (
                <option key={s} value={s}>
                  {SEGMENT_LABELS[s]}
                </option>
              ))}
            </select>
          )}
        </div>
        {contacts.length > 0 && (
          <SegmentedControl<Mode>
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'followUp', label: `À relancer · ${followUpCount}` },
            ]}
            value={mode}
            onChange={setMode}
          />
        )}

        {/* Catégorie Contacts : la liste est une carte rose (DECISIONS.md §29). */}
        <CategoryCard
          category="contacts"
          icon={onlyFollowUp ? AlarmClock : Users}
          title={onlyFollowUp ? 'À relancer' : activeSegment ? SEGMENT_LABELS[activeSegment] : 'Contacts'}
          count={rows.length}
        >
          {rows.length > 0 ? (
            <CardList>
              {rows.map(({ contact: c, days }) => (
                <ListRow
                  key={c.id}
                  title={c.name || 'Sans nom'}
                  subtitle={[c.role, c.club, segmentLabel(c.segment)].filter(Boolean).join(' · ') || null}
                  right={
                    days >= FOLLOW_UP_DAYS ? <Badge label={`Relance · ${days} j`} color="var(--color-warning)" /> : null
                  }
                  onClick={() => navigate(`/agency/contacts/${c.id}`)}
                />
              ))}
            </CardList>
          ) : loading ? null : (
            <CardNote>
              {filtered
                ? 'Aucun contact ne correspond.'
                : 'Aucun contact. Clique sur « Contact » pour ajouter un client : créateur, club, coach, société…'}
            </CardNote>
          )}
        </CategoryCard>
      </div>
    </div>
  );
}
