import { ArrowUp, Plus } from 'lucide-react';
import { useState, type Ref } from 'react';

import type { DateKey } from '../lib/dates';

/**
 * Création rapide : titre + échéance optionnelle (sélecteur de date natif).
 * Avec `fixedDue`, la date est imposée (ex. vue du jour) et le sélecteur n'est
 * pas proposé. Avec `withDue={false}`, simple titre (projet, étape : QuickAddRow
 * du mobile). Portage web de mobile-legacy/src/components/QuickAddTask.tsx.
 */
export function QuickAddTask({
  onAdd,
  placeholder = 'Nouvelle tâche',
  fixedDue,
  withDue = true,
  inputRef,
}: {
  onAdd: (title: string, due: DateKey | null) => void;
  placeholder?: string;
  fixedDue?: DateKey;
  withDue?: boolean;
  /** Pour donner le focus au champ depuis un bouton de l'écran (« Nouvelle tâche »). */
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<DateKey>('');

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onAdd(t, withDue ? (fixedDue ?? (due || null)) : null);
    setTitle('');
    setDue('');
  };

  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Plus size={20} className="quick-add__icon" aria-hidden />
      <input
        ref={inputRef}
        className="quick-add__input"
        placeholder={placeholder}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label={placeholder}
      />
      {withDue && !fixedDue && (
        <input
          type="date"
          className={due ? 'quick-add__date quick-add__date--set' : 'quick-add__date'}
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Échéance"
          title="Échéance (facultative)"
        />
      )}
      {title.trim().length > 0 && (
        // Action principale : pastille en dégradé soleil couchant (DECISIONS.md §26).
        <button type="submit" className="quick-add__submit" aria-label="Ajouter">
          <ArrowUp size={18} />
        </button>
      )}
    </form>
  );
}
