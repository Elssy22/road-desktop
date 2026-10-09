/** Élément proposé par un sélecteur de lien. */
export type LinkOption = { id: string; label: string };

/**
 * Liste déroulante d'un lien facultatif vers une autre fiche (contact, projet).
 * Une fiche liée supprimée entre-temps n'est plus dans la liste : elle s'affiche
 * avec `missingLabel`, et « Retirer » efface le lien. Tant que la liste n'est pas
 * chargée, la fiche déjà choisie garde une option.
 */
export function LinkSelect({
  id,
  options,
  value,
  onChange,
  missingLabel,
  disabled,
  removable = true,
}: {
  id: string;
  options: LinkOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Libellé de l'option vide quand la fiche liée n'existe plus. */
  missingLabel: string;
  disabled?: boolean;
  /** Bouton « Retirer » à côté de la liste. */
  removable?: boolean;
}) {
  const known = value === null || options.some((o) => o.id === value);
  const loading = options.length === 0;
  const missing = !known && !loading;

  const select = (
    <select
      id={id}
      className="select"
      value={missing ? '' : (value ?? '')}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{missing ? missingLabel : 'Aucun'}</option>
      {!known && loading && value && <option value={value}>…</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );

  if (!removable) return select;
  return (
    <span className="inline-field">
      {select}
      {value && (
        <button type="button" className="text-action" disabled={disabled} onClick={() => onChange(null)}>
          Retirer
        </button>
      )}
    </span>
  );
}
