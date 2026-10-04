import { NotebookPen, Pin, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { useConfirm } from '../components/Dialog';
import { NoteRow } from '../components/NoteRow';
import { SearchField } from '../components/SearchField';
import { CardList, CardNote, CategoryCard, ErrorBanner, GradientButton, Panel, ScreenHeader } from '../components/ui';
import {
  getNote,
  insertNote,
  listNotes,
  setNotePinned,
  softDeleteNote,
  updateNote,
  type Note,
  type NoteContent,
} from '../data/notes';
import { useRemoteQuery } from '../data/useRemoteQuery';
import { useWrite } from '../data/useWrite';
import { readStored, removeStored, writeStored } from '../lib/localStore';
import { makeMatcher } from '../lib/search';
import { useToday } from '../lib/useToday';

/** Segment d'URL réservé à « nouvelle note » (`/notes/new`). */
export const NEW_NOTE_ID = 'new';

const NO_NOTES: Note[] = [];

/**
 * Notes : portage web de mobile-legacy/src/screens/NotesScreen.tsx et
 * NoteDetailScreen.tsx réunis. Sur desktop, la liste et l'éditeur sont côte à
 * côte (`/notes`, `/notes/new`, `/notes/:id`) au lieu de deux écrans empilés.
 */
export function NotesScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const today = useToday();
  const [query, setQuery] = useState('');
  const { data: notes, error } = useRemoteQuery(listNotes, NO_NOTES);
  const { run, error: writeError } = useWrite();

  // Les notes arrivent déjà triées (épinglées puis plus récentes).
  const { pinned, others } = useMemo(() => {
    const matches = makeMatcher(query);
    const visible = notes.filter((n) => matches(n.title, n.body));
    return { pinned: visible.filter((n) => n.pinned), others: visible.filter((n) => !n.pinned) };
  }, [notes, query]);

  // Une nouvelle note garde son éditeur quand l'URL passe de /notes/new à
  // /notes/:id après sa création (clé transmise dans l'état de navigation).
  const editorKey = (location.state as { editorKey?: string } | null)?.editorKey ?? (id === NEW_NOTE_ID ? location.key : id);
  const openNote = notes.find((n) => n.id === id);

  const rows = (list: Note[]) => (
    <CardList>
      {list.map((n) => (
        <NoteRow
          key={n.id}
          note={n}
          today={today}
          active={n.id === id}
          onOpen={(note) => navigate(`/notes/${note.id}`)}
          onTogglePin={(note) => void run(() => setNotePinned(note, !note.pinned))}
        />
      ))}
    </CardList>
  );

  return (
    <div className="screen screen--wide">
      <ScreenHeader
        title="Notes"
        action={<GradientButton label="Note" icon={Plus} onClick={() => navigate(`/notes/${NEW_NOTE_ID}`)} />}
      />
      <ErrorBanner message={writeError ?? error} />
      <div className="notes-layout">
        <div className="stack">
          <SearchField value={query} onChange={setQuery} placeholder="Rechercher dans les notes" />
          {pinned.length > 0 && (
            <CategoryCard category="notes" icon={Pin} title="Épinglées" count={pinned.length}>
              {rows(pinned)}
            </CategoryCard>
          )}
          {others.length > 0 && (
            <CategoryCard category="notes" icon={NotebookPen} title="Notes" count={others.length}>
              {rows(others)}
            </CategoryCard>
          )}
          {pinned.length + others.length === 0 && (
            <CategoryCard category="notes" icon={NotebookPen} title="Notes">
              <CardNote>
                {query.trim()
                  ? 'Aucune note ne correspond à la recherche.'
                  : 'Aucune note. Clique sur « Note » pour en créer une.'}
              </CardNote>
            </CategoryCard>
          )}
        </div>

        {id && editorKey ? (
          <NoteEditor
            key={editorKey}
            id={id}
            pinned={openNote?.pinned}
            onCreated={(noteId) =>
              navigate(`/notes/${noteId}`, { replace: true, state: { editorKey } })
            }
            onDeleted={() => navigate('/notes', { replace: true })}
          />
        ) : (
          <Panel className="panel-card--padded">
            <CardNote>Sélectionne une note dans la liste, ou crée-en une nouvelle.</CardNote>
          </Panel>
        )}
      </div>
    </div>
  );
}

// Sauvegarde auto après une courte pause de frappe (et à la sortie de l'éditeur) :
// pas de bouton « Enregistrer », et pas une requête par caractère.
const SAVE_DEBOUNCE_MS = 700;

const EMPTY: NoteContent = { title: '', body: '', pinned: false };
const isEmpty = (c: NoteContent) => !c.title.trim() && !c.body.trim() && !c.pinned;
const sameContent = (a: NoteContent, b: NoteContent) => a.title === b.title && a.body === b.body && a.pinned === b.pinned;

/**
 * Copie locale de la saisie, effacée dès que Supabase a confirmé ce contenu :
 * un échec d'enregistrement en quittant l'éditeur, ou la fenêtre fermée pendant
 * le délai de sauvegarde, ne perd plus le texte (restauré à la réouverture).
 */
const draftKey = (noteId: string) => `notes:draft:${noteId}`;

/** Champs modifiés depuis la dernière version enregistrée. */
function changes(from: NoteContent, to: NoteContent): Partial<NoteContent> {
  const patch: Partial<NoteContent> = {};
  if (from.title !== to.title) patch.title = to.title;
  if (from.body !== to.body) patch.body = to.body;
  if (from.pinned !== to.pinned) patch.pinned = to.pinned;
  return patch;
}

/**
 * Éditeur d'une note (portage de NoteDetailScreen). Une nouvelle note reçoit
 * son id tout de suite mais n'est écrite qu'à la première saisie : ouvrir puis
 * quitter ne crée pas de note vide.
 */
function NoteEditor({
  id,
  pinned,
  onCreated,
  onDeleted,
}: {
  id: string;
  /** Épinglage tel que lu par la liste (bouton de la liste pendant l'édition). */
  pinned: boolean | undefined;
  onCreated: (noteId: string) => void;
  onDeleted: () => void;
}) {
  // Figé à l'ouverture : l'URL passe ensuite à /notes/:id sans changer d'éditeur.
  const [isNew] = useState(id === NEW_NOTE_ID);
  const [noteId] = useState(() => (isNew ? crypto.randomUUID() : id));
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>(isNew ? 'ready' : 'loading');
  const [draft, setDraft] = useState<NoteContent>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const { confirm, dialog } = useConfirm();

  // Source de vérité des sauvegardes différées (lues hors du rendu).
  const draftRef = useRef<NoteContent>(EMPTY);
  /** Dernier contenu envoyé ; null tant que rien n'est à enregistrer. */
  const savedRef = useRef<NoteContent | null>(null);
  /** Dernier contenu confirmé par Supabase ; null tant que la ligne n'existe pas. */
  const confirmedRef = useRef<NoteContent | null>(null);
  const deletedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Les écritures partent l'une après l'autre : la mise à jour ne doit pas
  // devancer l'insertion de la note.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Lecture unique : une écriture ailleurs pendant l'édition n'écrase pas la saisie.
  useEffect(() => {
    if (isNew) return;
    let active = true;
    getNote(noteId)
      .then((note) => {
        if (!active) return;
        if (!note) {
          setStatus('missing');
          return;
        }
        const content = { title: note.title, body: note.body, pinned: note.pinned };
        savedRef.current = content;
        confirmedRef.current = content;
        // Saisie restée non enregistrée lors d'une ouverture précédente : elle est
        // reprise, et sera enregistrée au prochain délai de sauvegarde.
        const local = readStored<NoteContent>(draftKey(noteId));
        const pending = local && !sameContent(local, content) ? local : null;
        if (!pending) removeStored(draftKey(noteId));
        draftRef.current = pending ?? content;
        setDraft(draftRef.current);
        setRestored(!!pending);
        setStatus('ready');
        if (pending) timerRef.current = setTimeout(() => flushRef.current(), SAVE_DEBOUNCE_MS);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('missing');
      });
    return () => {
      active = false;
    };
  }, [noteId, isNew]);

  // Épinglage changé depuis la liste : on l'adopte sans le réécrire.
  useEffect(() => {
    if (pinned === undefined || status !== 'ready' || pinned === draftRef.current.pinned) return;
    draftRef.current = { ...draftRef.current, pinned };
    if (savedRef.current) savedRef.current = { ...savedRef.current, pinned };
    if (confirmedRef.current) confirmedRef.current = { ...confirmedRef.current, pinned };
    setDraft(draftRef.current);
  }, [pinned, status]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const content = draftRef.current;
    const saved = savedRef.current;
    if (deletedRef.current) return;
    if (saved ? sameContent(saved, content) : isEmpty(content)) return;
    savedRef.current = content;
    queueRef.current = queueRef.current.then(async () => {
      const confirmed = confirmedRef.current;
      try {
        if (confirmed) await updateNote(noteId, changes(confirmed, content));
        else await insertNote(noteId, content);
        confirmedRef.current = content;
        if (sameContent(draftRef.current, content)) removeStored(draftKey(noteId));
        if (mountedRef.current) setError(null);
        if (!confirmed && mountedRef.current) onCreatedRef.current(noteId);
      } catch (e) {
        // La prochaine saisie retentera l'écriture.
        savedRef.current = confirmedRef.current;
        if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
      }
    });
  }, [noteId]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Sortie de l'éditeur (autre note, autre section) ou fermeture de la fenêtre :
  // on écrit ce qui reste (la copie locale couvre un envoi qui n'aboutit pas).
  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [flush]);

  const update = (patch: Partial<NoteContent>, immediate = false) => {
    draftRef.current = { ...draftRef.current, ...patch };
    setDraft(draftRef.current);
    writeStored(draftKey(noteId), draftRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (immediate) flush();
    else timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  };

  const remove = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    deletedRef.current = true;
    await queueRef.current;
    if (confirmedRef.current) {
      try {
        await softDeleteNote(noteId);
      } catch (e) {
        deletedRef.current = false;
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    removeStored(draftKey(noteId));
    onDeleted();
  };

  const confirmDelete = () => {
    // Rien d'écrit sur le serveur : pas besoin de confirmation.
    if (!savedRef.current) {
      void remove();
      return;
    }
    confirm({
      title: 'Supprimer la note ?',
      message: 'Elle sera supprimée sur tous tes appareils.',
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () => void remove(),
    });
  };

  if (status === 'missing') {
    return (
      <div className="stack">
        <ErrorBanner message={error} />
        <CategoryCard category="notes" icon={NotebookPen} title="Note introuvable">
          <CardNote>Cette note n’existe plus (supprimée, peut-être sur un autre appareil).</CardNote>
        </CategoryCard>
      </div>
    );
  }

  return (
    <div className="stack">
      <ErrorBanner message={error} />
      {restored && (
        <p className="notice notice--info" role="status">
          Saisie non enregistrée la dernière fois : elle a été reprise et va être enregistrée.
        </p>
      )}
      {/* Feuille blanche, liseré lavande de la catégorie Notes. */}
      <Panel className="note-editor">
        <div className="note-editor__toolbar">
          <span className="note-editor__status">Enregistrement automatique</span>
          <button
            type="button"
            className={draft.pinned ? 'icon-button note-pin note-pin--on' : 'icon-button note-pin'}
            onClick={() => update({ pinned: !draftRef.current.pinned }, true)}
            disabled={status !== 'ready'}
            aria-label={draft.pinned ? 'Désépingler' : 'Épingler'}
            title={draft.pinned ? 'Désépingler' : 'Épingler'}
          >
            <Pin size={18} fill={draft.pinned ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className="icon-button icon-button--danger"
            onClick={confirmDelete}
            disabled={status !== 'ready'}
            aria-label="Supprimer la note"
            title="Supprimer la note"
          >
            <Trash2 size={18} />
          </button>
        </div>
        <input
          className="note-editor__title"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          onBlur={flush}
          placeholder={status === 'loading' ? 'Chargement…' : 'Titre'}
          aria-label="Titre"
          autoFocus={isNew}
          disabled={status !== 'ready'}
        />
        <textarea
          className="note-editor__body"
          value={draft.body}
          onChange={(e) => update({ body: e.target.value })}
          onBlur={flush}
          placeholder="Écris ta note…"
          aria-label="Contenu de la note"
          disabled={status !== 'ready'}
        />
      </Panel>
      {dialog}
    </div>
  );
}
