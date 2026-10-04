import { supabase } from '../lib/supabase';
import { fetchAll, insertRow, softDeleteRow, unwrap, updateRow, type BaseRow, type Fields } from './base';

// Notes : type et requêtes repris de mobile-legacy/src/db/notesDb.ts.
// Un titre, un corps en texte libre, épinglage facultatif.

export type Note = BaseRow & {
  title: string;
  body: string;
  pinned: boolean;
};

/** Contenu éditable d'une note. */
export type NoteContent = Fields<Note>;

const NOTES = 'notes';

/** Épinglées d'abord, puis les plus récemment modifiées. */
export const listNotes = (): Promise<Note[]> =>
  fetchAll<Note>((from, to) =>
    supabase
      .from(NOTES)
      .select('*')
      .is('deleted_at', null)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .order('id')
      .range(from, to)
  );

/** Note vivante, ou null si elle n'existe pas ou a été supprimée. */
export async function getNote(id: string): Promise<Note | null> {
  return unwrap(await supabase.from(NOTES).select('*').eq('id', id).is('deleted_at', null).maybeSingle());
}

/**
 * Première écriture d'une nouvelle note : l'id est choisi par l'éditeur dès
 * l'ouverture, mais la ligne n'est créée qu'à la première saisie.
 */
export const addNote = (id: string, content: NoteContent) => insertRow(NOTES, content, id);

export const updateNote = (id: string, patch: Partial<NoteContent>) => updateRow(NOTES, id, patch);

export const setNotePinned = (note: Note, pinned: boolean) => updateRow(NOTES, note.id, { pinned });

export const softDeleteNote = (id: string) => softDeleteRow(NOTES, id);

/** Première ligne non vide du corps, pour l'aperçu (et comme titre de secours). */
export const firstLine = (body: string) => body.split('\n').find((l) => l.trim() !== '')?.trim() ?? '';

/** Titre affiché : le titre, sinon la première ligne du corps. */
export const noteTitle = (n: Pick<Note, 'title' | 'body'>) => n.title.trim() || firstLine(n.body) || 'Sans titre';
