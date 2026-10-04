import { CircleAlert, FileText, Sparkles, SquareCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ContactSelect } from '../../components/ContactSelect';
import { errorMessage } from '../../lib/errors';
import { useConfirm } from '../../components/Dialog';
import {
  CardList,
  CardNote,
  CategoryCard,
  ErrorBanner,
  FormField,
  Panel,
  ScreenHeader,
  TextAction,
} from '../../components/ui';
import { listContacts, type ContactWithLast } from '../../data/crm';
import { saveMeetingReport } from '../../data/meetingReport';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { formatLongDate, type DateKey } from '../../lib/dates';
import { meetingNoteBody, meetingNoteTitle, summarizeMeeting } from '../../lib/meetingSummary';
import { useToday } from '../../lib/useToday';

/** `key` sert aussi d'id à la tâche créée (cf. `Result`). */
type EditableTask = { key: string; title: string; due_date: DateKey | null; checked: boolean };
/**
 * Ids des lignes à créer, tirés une seule fois à la réception du résumé : un
 * nouvel essai après un échec réseau en cours d'enregistrement ne crée pas de doublon.
 */
type Result = { summary: string; tasks: EditableTask[]; noteId: string; interactionId: string };

const NO_CONTACTS: ContactWithLast[] = [];
/** Longueur max du résumé recopié dans l'historique du contact (le CR complet est dans Notes). */
const INTERACTION_SUMMARY_MAX = 280;
const DRAFT_SAVE_DELAY_MS = 600;

// Brouillon des notes brutes conservé localement (localStorage de la webview,
// à la place du kv-store du mobile) : une saisie longue survit à une erreur IA,
// à un changement d'écran ou à la fermeture de l'app.
const draftKey = (userId: string) => `meeting_draft:${userId}`;

const readDraft = (userId: string) => {
  try {
    return localStorage.getItem(draftKey(userId)) ?? '';
  } catch {
    return '';
  }
};

const writeDraft = (userId: string, text: string) => {
  try {
    if (text) localStorage.setItem(draftKey(userId), text);
    else localStorage.removeItem(draftKey(userId));
  } catch {
    // Stockage indisponible : le brouillon n'est simplement pas conservé.
  }
};

/**
 * Compte-rendu de RDV : notes libres → résumé + tâches suggérées par l'IA →
 * validation explicite avant toute écriture. Portage web de
 * mobile-legacy/src/screens/agency/MeetingReportScreen.tsx.
 */
export function MeetingReportScreen({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = useToday();
  const { confirm, dialog } = useConfirm();

  const [notes, setNotes] = useState(() => readDraft(userId));
  const [selectedContact, setSelectedContact] = useState<string | null>(params.get('contact'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [addToHistory, setAddToHistory] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ tasks: number; contactId: string | null } | null>(null);

  const { data: contacts, error: contactsError } = useRemoteQuery(listContacts, NO_CONTACTS);
  const contact = contacts.find((c) => c.id === selectedContact) ?? null;

  // Sauvegarde du brouillon après la frappe (et à la sortie de l'écran).
  const notesRef = useRef(notes);
  const changeNotes = (text: string) => {
    notesRef.current = text;
    setNotes(text);
  };
  useEffect(() => {
    const t = setTimeout(() => writeDraft(userId, notes), DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [notes, userId]);
  useEffect(() => () => writeDraft(userId, notesRef.current), [userId]);

  const summarize = async () => {
    const text = notes.trim();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await summarizeMeeting(text, today);
      setResult({
        summary: r.summary,
        tasks: r.suggested_tasks.map((t) => ({ key: crypto.randomUUID(), ...t, checked: true })),
        noteId: crypto.randomUUID(),
        interactionId: crypto.randomUUID(),
      });
    } catch (e) {
      // Les notes restent dans le champ (et dans le brouillon) : rien n'est perdu.
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const patchTask = (key: string, p: Partial<EditableTask>) =>
    setResult((r) => r && { ...r, tasks: r.tasks.map((t) => (t.key === key ? { ...t, ...p } : t)) });

  const checkedTasks = result?.tasks.filter((t) => t.checked && t.title.trim()) ?? [];
  const canSave = !!result && result.summary.trim().length > 0 && !saving && !loading;

  const save = async () => {
    if (!result || !canSave) return;
    setSaving(true);
    setSaveError(null);
    const summary = result.summary.trim();
    try {
      await saveMeetingReport({
        noteId: result.noteId,
        noteTitle: meetingNoteTitle(formatLongDate(today), contact?.name ?? null),
        noteBody: meetingNoteBody(summary, notes),
        tasks: checkedTasks.map((t) => ({ id: t.key, title: t.title.trim(), due_date: t.due_date })),
        interaction:
          contact && addToHistory
            ? {
                id: result.interactionId,
                contact_id: contact.id,
                summary:
                  summary.length > INTERACTION_SUMMARY_MAX
                    ? `${summary.slice(0, INTERACTION_SUMMARY_MAX - 1).trimEnd()}…`
                    : summary,
              }
            : null,
      });
    } catch (e) {
      setSaving(false);
      setSaveError(`Enregistrement impossible : ${errorMessage(e)}`);
      return;
    }
    changeNotes('');
    writeDraft(userId, '');
    setResult(null);
    setSaving(false);
    setSaved({ tasks: checkedTasks.length, contactId: contact?.id ?? null });
  };

  const confirmClear = () =>
    confirm({
      title: 'Effacer les notes ?',
      message: 'Le texte saisi et le résumé seront perdus.',
      confirmLabel: 'Effacer',
      danger: true,
      onConfirm: () => {
        changeNotes('');
        setResult(null);
        setError(null);
      },
    });

  if (saved) {
    const n = saved.tasks;
    return (
      <div className="screen">
        <ScreenHeader eyebrow="Agence" title="Compte-rendu de RDV" />
        <CategoryCard category="tasks" icon={SquareCheck} title="Compte-rendu enregistré">
          <CardNote>
            Note créée dans Notes{n > 0 ? ` · ${n} tâche${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}` : ''}.
          </CardNote>
          <div className="form-actions form-actions--start">
            {saved.contactId && (
              <button type="button" className="button button--ghost" onClick={() => navigate(`/agency/contacts/${saved.contactId}`)}>
                Retour à la fiche
              </button>
            )}
            {n > 0 && (
              <button type="button" className="button button--ghost" onClick={() => navigate('/tasks')}>
                Voir les tâches
              </button>
            )}
            <button type="button" className="button button--primary" onClick={() => setSaved(null)}>
              Nouveau compte-rendu
            </button>
          </div>
        </CategoryCard>
      </div>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Agence" title="Compte-rendu de RDV" />
      <ErrorBanner message={saveError ?? contactsError} />
      <div className="stack">
        {/* Produit des tâches : cartes pêche, comme sa carte du menu Agence (DECISIONS.md §29-30). */}
        <CategoryCard
          category="tasks"
          icon={FileText}
          title="Notes du RDV"
          action={
            notes.length > 0 && !loading ? <TextAction label="Effacer" category="tasks" onClick={confirmClear} /> : undefined
          }
        >
          <div className="form">
            <FormField label="Contact (facultatif)" htmlFor="meeting-contact">
              <ContactSelect
                id="meeting-contact"
                contacts={contacts}
                value={selectedContact}
                removable={false}
                onChange={setSelectedContact}
              />
            </FormField>
            <FormField label="Notes du RDV" htmlFor="meeting-notes">
              <textarea
                id="meeting-notes"
                className="input textarea textarea--tall"
                value={notes}
                onChange={(e) => changeNotes(e.target.value)}
                disabled={loading}
                placeholder="Tape ou dicte (Dictée macOS) : qui, quoi, décisions, prochaines étapes…"
                autoFocus={!notes}
              />
            </FormField>
            <CardNote>
              Brouillon conservé sur ce Mac. Le texte est envoyé à un service d’IA externe (OpenRouter) pour le résumé ;
              rien n’est enregistré sans ta validation.
            </CardNote>
          </div>
        </CategoryCard>

        {loading ? (
          <p className="loading-note">Résumé en cours…</p>
        ) : (
          <button
            type="button"
            className={result ? 'button button--secondary' : 'button button--primary'}
            onClick={() => void summarize()}
            disabled={!notes.trim()}
          >
            {result ? 'Relancer le résumé' : 'Résumer et extraire les tâches'}
          </button>
        )}

        {error && (
          <Panel className="panel-card--padded panel-card--danger">
            <p className="danger-title">
              <CircleAlert size={18} />
              Le résumé a échoué
            </p>
            <p className="notice">{error}</p>
            <CardNote>Tes notes sont intactes. Tu peux réessayer, ou les garder et revenir plus tard.</CardNote>
          </Panel>
        )}

        {result && (
          <>
            <CategoryCard category="tasks" icon={Sparkles} title="Résumé">
              <textarea
                className="input textarea textarea--summary"
                aria-label="Résumé"
                value={result.summary}
                onChange={(e) => setResult((r) => r && { ...r, summary: e.target.value })}
              />
            </CategoryCard>

            <CategoryCard
              category="tasks"
              icon={SquareCheck}
              title={result.tasks.length ? `Tâches suggérées · ${checkedTasks.length}/${result.tasks.length}` : 'Tâches suggérées'}
            >
              {result.tasks.length === 0 ? (
                <CardNote>Aucune action identifiée dans les notes.</CardNote>
              ) : (
                <CardList>
                  {result.tasks.map((t) => (
                    <li key={t.key} className="row">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={t.checked}
                        onChange={() => patchTask(t.key, { checked: !t.checked })}
                        aria-label={`Créer la tâche ${t.title}`}
                      />
                      <div className="row__main">
                        <input
                          className={t.checked ? 'inline-input' : 'inline-input inline-input--off'}
                          value={t.title}
                          onChange={(e) => patchTask(t.key, { title: e.target.value })}
                          aria-label="Titre de la tâche"
                        />
                      </div>
                      <input
                        type="date"
                        className="input input--compact"
                        value={t.due_date ?? ''}
                        onChange={(e) => patchTask(t.key, { due_date: e.target.value || null })}
                        aria-label="Échéance"
                        title="Échéance (facultative)"
                      />
                    </li>
                  ))}
                </CardList>
              )}
            </CategoryCard>

            {contact && (
              <label className="toggle">
                <input type="checkbox" checked={addToHistory} onChange={(e) => setAddToHistory(e.target.checked)} />
                Ajouter aussi à l’historique de {contact.name} (interaction « RDV »)
              </label>
            )}

            <button type="button" className="button button--primary" onClick={() => void save()} disabled={!canSave}>
              {saving
                ? 'Enregistrement…'
                : checkedTasks.length > 0
                  ? `Enregistrer (note + ${checkedTasks.length} tâche${checkedTasks.length > 1 ? 's' : ''})`
                  : 'Enregistrer la note'}
            </button>
          </>
        )}
      </div>
      {dialog}
    </div>
  );
}
