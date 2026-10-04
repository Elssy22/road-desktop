import { AlarmClock, Link2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useConfirm } from '../components/Dialog';
import { CardNote, CategoryCard, ErrorBanner, FormField, ScreenHeader } from '../components/ui';
import { listContacts, type ContactWithLast } from '../data/crm';
import {
  addReminder,
  formatTimeOfDay,
  getReminder,
  softDeleteReminder,
  updateReminder,
  type Reminder,
} from '../data/reminders';
import { listTasks, type Task } from '../data/tasks';
import { useRemoteQuery } from '../data/useRemoteQuery';
import { useWrite } from '../data/useWrite';
import { changedFields } from '../data/base';
import { formatDueLabel, fromDateKey, toDateKey, type DateKey } from '../lib/dates';
import { useToday } from '../lib/useToday';

type Form = {
  title: string;
  date: DateKey;
  /** Heure locale « HH:MM ». */
  time: string;
  task_id: string | null;
  contact_id: string | null;
};

const NO_CONTACTS: ContactWithLast[] = [];
const NO_TASKS: Task[] = [];
const isDateKey = (s: string | null): s is DateKey => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const pad = (n: number) => String(n).padStart(2, '0');

/** Nouveau rappel : aujourd'hui → l'heure pleine suivante ; autre jour → 9:00. */
const defaultTime = (date: DateKey, today: DateKey) =>
  date !== today ? '09:00' : `${pad(Math.min(new Date().getHours() + 1, 23))}:00`;

const toInstant = (f: Pick<Form, 'date' | 'time'>) => {
  const d = fromDateKey(f.date);
  d.setHours(Number(f.time.slice(0, 2)), Number(f.time.slice(3, 5)), 0, 0);
  return d;
};

/**
 * Création (`/reminders/new?date=…&task=…&contact=…`) ou modification
 * (`/reminders/:id`) d'un rappel : portage web de
 * mobile-legacy/src/screens/ReminderFormScreen.tsx. Les notifications restent
 * envoyées par le mobile ; le desktop ne les programme pas.
 */
export function ReminderFormScreen() {
  const { id } = useParams();
  // Même écran pour les deux routes : la clé repart d'un formulaire vierge (et relu).
  return <ReminderForm key={id ?? 'new'} id={id} />;
}

function ReminderForm({ id }: { id?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  // Ouvert depuis une tâche, une fiche contact ou le calendrier : retour à l'écran
  // d'origine ; ouvert directement (rechargement), retour à la Vue du jour.
  const goBack = () => (location.key === 'default' ? navigate('/today', { replace: true }) : navigate(-1));
  const today = useToday();
  const { run, error: writeError } = useWrite();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState<Form>(() => {
    const date = params.get('date');
    const day = isDateKey(date) ? date : today;
    return {
      title: '',
      date: day,
      time: defaultTime(day, today),
      task_id: params.get('task'),
      contact_id: params.get('contact'),
    };
  });
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: contacts } = useRemoteQuery(listContacts, NO_CONTACTS);
  const { data: tasks } = useRemoteQuery(listTasks, NO_TASKS);
  const openTasks = tasks.filter((t) => !t.done || t.id === form.task_id);
  // Élément lié supprimé entre-temps : il n'est plus dans la liste, le lien est proposé au retrait.
  const contactMissing = form.contact_id != null && contacts.length > 0 && !contacts.some((c) => c.id === form.contact_id);
  const taskMissing = form.task_id != null && tasks.length > 0 && !tasks.some((t) => t.id === form.task_id);

  // Lu une seule fois à l'ouverture (une écriture ailleurs pendant la saisie ne l'écrase pas).
  useEffect(() => {
    if (!id) return;
    let active = true;
    getReminder(id)
      .then((r) => {
        if (!active) return;
        setReminder(r);
        if (r)
          setForm({
            title: r.title,
            date: toDateKey(new Date(r.remind_at)),
            time: formatTimeOfDay(r.remind_at),
            task_id: r.task_id,
            contact_id: r.contact_id,
          });
      })
      .catch((e: unknown) => active && setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const canSave = form.title.trim().length > 0 && form.time !== '' && !loading && !saving && (!id || !!reminder);
  const inPast = form.time !== '' && toInstant(form) <= new Date();

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const fields = {
      title: form.title.trim(),
      remind_at: toInstant(form).toISOString(),
      task_id: form.task_id,
      contact_id: form.contact_id,
    };
    setSaving(true);
    const ok = await run(async () => {
      // Heure modifiée vers le futur : le rappel redevient « à faire ».
      if (reminder) await updateReminder(reminder.id, changedFields(reminder, inPast ? fields : { ...fields, done: false }));
      else await addReminder({ ...fields, done: false });
    });
    setSaving(false);
    if (ok) goBack();
  };

  const toggleDone = () => {
    if (!reminder) return;
    void run(() => updateReminder(reminder.id, { done: !reminder.done })).then((ok) => ok && goBack());
  };

  const confirmDelete = () => {
    if (!reminder) return;
    confirm({
      title: 'Supprimer ce rappel ?',
      message: reminder.title || undefined,
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () => void run(() => softDeleteReminder(reminder.id)).then((ok) => ok && goBack()),
    });
  };

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Rappels" title={id ? 'Rappel' : 'Nouveau rappel'} />
      <ErrorBanner message={loadError ?? writeError} />
      {id && !loading && !reminder && !loadError ? (
        <CategoryCard category="reminders" icon={AlarmClock} title="Rappel">
          <CardNote>Ce rappel n’existe plus (supprimé sur un autre appareil ?).</CardNote>
        </CategoryCard>
      ) : (
        <form className="stack" onSubmit={(e) => void save(e)}>
          {/* Catégorie Rappels : cartes menthe (DECISIONS.md §26). */}
          <CategoryCard category="reminders" icon={AlarmClock} title={id ? 'Rappel' : 'Nouveau rappel'}>
            <div className="form">
              <FormField label="Titre *" htmlFor="reminder-title">
                <input
                  id="reminder-title"
                  className="input"
                  value={form.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  placeholder="Ex. Rappeler le club pour le contrat"
                  autoFocus={!id}
                  disabled={loading}
                />
              </FormField>
              <div className="form form--grid">
                <FormField label="Date" htmlFor="reminder-date">
                  <span className="inline-field">
                    <input
                      id="reminder-date"
                      className="input"
                      type="date"
                      required
                      value={form.date}
                      onChange={(e) => e.target.value && patch({ date: e.target.value })}
                    />
                    <span className="row__meta-item">{formatDueLabel(form.date, today)}</span>
                  </span>
                </FormField>
                <FormField label="Heure" htmlFor="reminder-time">
                  <input
                    id="reminder-time"
                    className="input"
                    type="time"
                    required
                    value={form.time}
                    onChange={(e) => patch({ time: e.target.value })}
                  />
                </FormField>
              </div>
              {inPast && <CardNote tone="danger">Cette heure est déjà passée : aucune notification ne sera envoyée.</CardNote>}
            </div>
          </CategoryCard>

          <CategoryCard category="reminders" icon={Link2} title="Liens">
            <div className="form">
              <FormField label="Tâche liée" htmlFor="reminder-task">
                <span className="inline-field">
                  <select
                    id="reminder-task"
                    className="select"
                    value={taskMissing ? '' : (form.task_id ?? '')}
                    onChange={(e) => patch({ task_id: e.target.value || null })}
                  >
                    <option value="">{taskMissing ? 'Tâche supprimée' : 'Aucune'}</option>
                    {openTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                  {form.task_id && (
                    <button type="button" className="text-action" onClick={() => patch({ task_id: null })}>
                      Retirer
                    </button>
                  )}
                </span>
              </FormField>
              <FormField label="Contact lié" htmlFor="reminder-contact">
                <span className="inline-field">
                  <select
                    id="reminder-contact"
                    className="select"
                    value={contactMissing ? '' : (form.contact_id ?? '')}
                    onChange={(e) => patch({ contact_id: e.target.value || null })}
                  >
                    <option value="">{contactMissing ? 'Contact supprimé' : 'Aucun'}</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.club ? `${c.name} · ${c.club}` : c.name}
                      </option>
                    ))}
                  </select>
                  {form.contact_id && (
                    <button type="button" className="text-action" onClick={() => patch({ contact_id: null })}>
                      Retirer
                    </button>
                  )}
                </span>
              </FormField>
            </div>
          </CategoryCard>

          <div className="form-actions">
            {reminder && (
              <button type="button" className="button button--danger" onClick={confirmDelete}>
                Supprimer le rappel
              </button>
            )}
            {reminder && (
              <button type="button" className="button button--secondary" onClick={toggleDone}>
                {reminder.done ? 'Marquer comme à faire' : 'Marquer comme fait'}
              </button>
            )}
            <button type="button" className="button button--ghost" onClick={goBack}>
              Annuler
            </button>
            <button type="submit" className="button button--primary" disabled={!canSave}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}
      {dialog}
    </div>
  );
}
