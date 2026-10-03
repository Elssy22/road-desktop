import { Megaphone, Plus, Volleyball, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { CardNote, CategoryCard, ChipRow, ErrorBanner, ScreenHeader, TextAction } from '../../components/ui';
import {
  fetchVeilleSettings,
  MAX_KEYWORDS,
  normalizeKeyword,
  saveKeywords,
  type KeywordList,
  type VeilleSettings,
} from '../../lib/veille';

const LISTS: { key: KeywordList; title: string; icon: LucideIcon; help: string; placeholder: string }[] = [
  {
    key: 'sport_keywords',
    title: 'Sport',
    icon: Volleyball,
    help: 'L’objet de l’avis doit contenir au moins un de ces mots.',
    placeholder: 'Ex. rugby, handball…',
  },
  {
    key: 'activity_keywords',
    title: 'Activité',
    icon: Megaphone,
    help: 'Et au moins un de ces mots, sauf si l’avis est classé « Publicité, Communication » par l’acheteur.',
    placeholder: 'Ex. vidéo, sponsoring…',
  },
];

/**
 * Mots-clés de la veille BOAMP (`/agency/veille/settings`) : portage web de
 * mobile-legacy/src/screens/agency/VeilleSettingsScreen.tsx. Enregistrés en
 * ligne dans veille_settings, lus par l'Edge Function boamp-sync à chaque recherche.
 */
export function VeilleSettingsScreen({ userId }: { userId: string }) {
  const [settings, setSettings] = useState<VeilleSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchVeilleSettings(userId)
      .then((s) => active && setSettings(s))
      .catch((e: Error) => active && setLoadError(`Réglages indisponibles : ${e.message}`));
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Veille appels d’offres" title="Mots-clés" />
      <ErrorBanner message={loadError} />
      <div className="stack">
        {settings &&
          LISTS.map((list) => (
            <KeywordCard
              key={list.key}
              userId={userId}
              list={list}
              keywords={settings[list.key]}
              onSaved={(keywords) => setSettings((s) => s && { ...s, [list.key]: keywords })}
            />
          ))}
      </div>
    </div>
  );
}

function KeywordCard({
  userId,
  list,
  keywords,
  onSaved,
}: {
  userId: string;
  list: (typeof LISTS)[number];
  keywords: string[];
  onSaved: (keywords: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: string[]) => {
    setSaving(true);
    setError(null);
    try {
      await saveKeywords(userId, list.key, next);
      onSaved(next);
      return true;
    } catch (e) {
      setError(`Enregistrement impossible : ${(e as Error).message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const add = async (e?: FormEvent) => {
    e?.preventDefault();
    const word = normalizeKeyword(draft);
    if (!word || saving) return;
    if (keywords.includes(word)) {
      setDraft('');
      return;
    }
    if (keywords.length >= MAX_KEYWORDS) {
      setError(`${MAX_KEYWORDS} mots-clés au maximum.`);
      return;
    }
    if (await save([...keywords, word])) setDraft('');
  };

  const remove = (word: string) => {
    // Sans mot « sport », la recherche ramènerait toute la communication publique.
    if (list.key === 'sport_keywords' && keywords.length === 1) {
      setError('Garde au moins un mot-clé sport.');
      return;
    }
    void save(keywords.filter((k) => k !== word));
  };

  const inputId = `veille-${list.key}`;

  return (
    // Catégorie Veille : cartes lavande (DECISIONS.md §33).
    <CategoryCard
      category="veille"
      icon={list.icon}
      title={list.title}
      count={keywords.length}
      action={saving ? <span className="card-note">Enregistrement…</span> : undefined}
    >
      <CardNote>{list.help}</CardNote>
      {keywords.length > 0 ? (
        <ChipRow>
          {keywords.map((word) => (
            <button
              key={word}
              type="button"
              className="chip keyword-chip"
              onClick={() => remove(word)}
              disabled={saving}
              aria-label={`Retirer ${word}`}
              title={`Retirer ${word}`}
            >
              {word}
              <X size={14} />
            </button>
          ))}
        </ChipRow>
      ) : (
        <CardNote>Aucun mot-clé : seule la catégorie « Publicité, Communication » compte.</CardNote>
      )}
      <form className="inline-field" onSubmit={(e) => void add(e)}>
        <input
          id={inputId}
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={list.placeholder}
          autoCapitalize="none"
          autoCorrect="off"
          disabled={saving}
          aria-label={`Nouveau mot-clé ${list.title.toLowerCase()}`}
        />
        <TextAction label="Ajouter" icon={Plus} category="veille" onClick={() => void add()} disabled={saving || !draft.trim()} />
      </form>
      {error && <CardNote tone="danger">{error}</CardNote>}
    </CategoryCard>
  );
}
