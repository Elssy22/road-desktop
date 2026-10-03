import { Search, X } from 'lucide-react';
import type { Ref } from 'react';

/** Champ de recherche d'une liste (portage web de la barre de ListToolbar du mobile). */
export function SearchField({
  value,
  onChange,
  placeholder,
  inputRef,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Pour donner le focus au champ depuis un raccourci clavier (recherche globale). */
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}) {
  return (
    <div className={className ? `search-field ${className}` : 'search-field'}>
      <Search size={18} className="search-field__icon" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        className="search-field__input"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
        }}
      />
      {value && (
        <button type="button" className="icon-button" onClick={() => onChange('')} aria-label="Effacer la recherche">
          <X size={16} />
        </button>
      )}
    </div>
  );
}
