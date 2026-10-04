import { Pin } from 'lucide-react';

import { firstLine, noteTitle, type Note } from '../data/notes';
import { formatEditedLabel, type DateKey } from '../lib/dates';

/**
 * Ligne d'une note : titre (ou première ligne du corps), date de modification,
 * aperçu, et bouton d'épinglage. Portage web de mobile-legacy/src/components/NoteRow.tsx.
 */
export function NoteRow({
  note,
  today,
  active,
  onOpen,
  onTogglePin,
}: {
  note: Note;
  today: DateKey;
  /** Note ouverte dans l'éditeur à côté de la liste. */
  active?: boolean;
  onOpen: (note: Note) => void;
  onTogglePin: (note: Note) => void;
}) {
  const title = note.title.trim();
  const preview = title ? note.body.trim() : note.body.trim().slice(firstLine(note.body).length).trim();
  const empty = !title && !note.body.trim();

  return (
    <li className={active ? 'row row--active' : 'row'}>
      <button
        type="button"
        className="row__main row__button"
        onClick={() => onOpen(note)}
        aria-current={active ? 'page' : undefined}
      >
        <span className={empty ? 'row__title row__title--faint' : 'row__title row__title--strong'}>
          {noteTitle(note)}
        </span>
        <span className="row__subtitle note-row__preview">
          <span className="note-row__date">{formatEditedLabel(note.updated_at, today)}</span>
          {preview ? `  ${preview.replace(/\s+/g, ' ')}` : ''}
        </span>
      </button>
      <button
        type="button"
        className={note.pinned ? 'icon-button note-pin note-pin--on' : 'icon-button note-pin'}
        onClick={() => onTogglePin(note)}
        aria-label={note.pinned ? 'Désépingler' : 'Épingler'}
        title={note.pinned ? 'Désépingler' : 'Épingler'}
      >
        <Pin size={16} fill={note.pinned ? 'currentColor' : 'none'} />
      </button>
    </li>
  );
}
