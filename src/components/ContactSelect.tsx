import type { ContactWithLast } from '../data/crm';

/** Libellé d'un contact dans une liste déroulante. */
export const contactOptionLabel = (c: Pick<ContactWithLast, 'name' | 'club'>) =>
  c.club ? `${c.name} · ${c.club}` : c.name;

/**
 * Sélecteur « Contact lié » des formulaires (RDV, rappel, date clé, finance,
 * coffre, compte rendu). Un contact lié supprimé entre-temps n'est plus dans la
 * liste : il s'affiche « Contact supprimé », et « Retirer » efface le lien.
 * Tant que la liste n'est pas chargée, le contact déjà choisi garde une option.
 */
export function ContactSelect({
  id,
  contacts,
  value,
  onChange,
  disabled,
  removable = true,
}: {
  id: string;
  contacts: Pick<ContactWithLast, 'id' | 'name' | 'club'>[];
  value: string | null;
  onChange: (contactId: string | null) => void;
  disabled?: boolean;
  /** Bouton « Retirer » à côté de la liste. */
  removable?: boolean;
}) {
  const known = value === null || contacts.some((c) => c.id === value);
  const loading = contacts.length === 0;
  const missing = !known && !loading;

  const select = (
    <select
      id={id}
      className="select"
      value={missing ? '' : (value ?? '')}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{missing ? 'Contact supprimé' : 'Aucun'}</option>
      {!known && loading && value && <option value={value}>…</option>}
      {contacts.map((c) => (
        <option key={c.id} value={c.id}>
          {contactOptionLabel(c)}
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
