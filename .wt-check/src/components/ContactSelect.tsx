import type { ContactWithLast } from '../data/crm';
import { LinkSelect } from './LinkSelect';

/** Libellé d'un contact dans une liste déroulante. */
export const contactOptionLabel = (c: Pick<ContactWithLast, 'name' | 'club'>) =>
  c.club ? `${c.name} · ${c.club}` : c.name;

/**
 * Sélecteur « Contact lié » des formulaires (RDV, rappel, date clé, finance,
 * coffre, compte rendu). Un contact lié supprimé entre-temps s'affiche
 * « Contact supprimé » (cf. LinkSelect).
 */
export function ContactSelect({
  contacts,
  ...props
}: {
  id: string;
  contacts: Pick<ContactWithLast, 'id' | 'name' | 'club'>[];
  value: string | null;
  onChange: (contactId: string | null) => void;
  disabled?: boolean;
  /** Bouton « Retirer » à côté de la liste. */
  removable?: boolean;
}) {
  return (
    <LinkSelect
      {...props}
      options={contacts.map((c) => ({ id: c.id, label: contactOptionLabel(c) }))}
      missingLabel="Contact supprimé"
    />
  );
}
