import { CalendarDays, ExternalLink, Link2, MapPin, NotebookPen, Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useConfirm } from '../components/Dialog';
import { ContactSelect } from '../components/ContactSelect';
import { CardList, CardNote, CategoryCard, ErrorBanner, FormField, ScreenHeader, TextAction } from '../components/ui';
import {
  addAppointment,
  debriefAt,
  getAppointment,
  softDeleteAppointment,
  updateAppointment,
  type Appointment,
} from '../data/appointments';
import { listContacts, type ContactWithLast } from '../data/crm';
import { listProjects, type ProjectWithProgress } from '../data/projects';
import { formatTimeOfDay } from '../data/reminders';
import { useRemoteQuery } from '../data/useRemoteQuery';
import { useWrite } from '../data/useWrite';
import { changedFields } from '../data/base';
import { canSearchAddress, searchAddress, type AddressSuggestion } from '../lib/addressSearch';
import { formatDueLabel, fromDateKey, toDateKey, type DateKey } from '../lib/dates';
import { useToday } from '../lib/useToday';

/** Heure locale « HH:MM » (valeur d'un <input type="time">). */
type Time = string;

type Form = {
  title: string;
  date: DateKey;
  start: Time;
  /** Heure de fin, le même jour que le début ('' : pas d'heure de fin). */
  end: Time;
  location: string;
  contact_id: string | null;
  project_id: string | null;
  notes: string;
  debrief_reminder_enabled: boolean;
};

const NO_CONTACTS: ContactWithLast[] = [];
const NO_PROJECTS: ProjectWithProgress[] = [];
const isDateKey = (s: string | null): s is DateKey => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

const pad = (n: number) => String(n).padStart(2, '0');
const minutesOf = (t: Time) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMinutes = (m: number): Time => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/** Nouveau RDV : aujourd'hui → l'heure pleine suivante ; autre jour → 9:00 (comme les rappels). */
const defaultStart = (date: DateKey, today: DateKey): Time =>
  date !== today ? '09:00' : `${pad(Math.min(new Date().getHours() + 1, 23))}:00`;

/** Fin proposée quand on en ajoute une : 1 h après le début, bornée à 23:45. */
const defaultEnd = (start: Time): Time => fromMinutes(Math.min(minutesOf(start) + 60, 23 * 60 + 45));

const toInstant = (date: DateKey, t: Time) => {
  const d = fromDateKey(date);
  d.setHours(Number(t.slice(0, 2)), Number(t.slice(3, 5)), 0, 0);
  return d;
};

const toForm = (a: Appointment): Form => ({
  title: a.title,
  date: toDateKey(new Date(a.start_at)),
  start: formatTimeOfDay(a.start_at),
  end: a.end_at ? formatTimeOfDay(a.end_at) : '',
  location: a.location ?? '',
  contact_id: a.contact_id,
  project_id: a.project_id,
  notes: a.notes ?? '',
  debrief_reminder_enabled: a.debrief_reminder_enabled,
});

/**
 * Création (`/appointments/new?date=…&contact=…`) ou modification
 * (`/appointments/:id`) d'un rendez-vous : portage web de
 * mobile-legacy/src/screens/AppointmentFormScreen.tsx.
 */
export function AppointmentFormScreen() {
  const { id } = useParams();
  // Même écran pour les deux routes : la clé repart d'un formulaire vierge (et relu).
  return <AppointmentForm key={id ?? 'new'} id={id} />;
}

function AppointmentForm({ id }: { id?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  // Ouvert depuis la Vue du jour ou le calendrier : retour à l'écran d'origine ;
  // ouvert directement (rechargement), retour au calendrier.
  const goBack = () => (location.key === 'default' ? navigate('/calendar', { replace: true }) : navigate(-1));
  const today = useToday();
  const { run, error: writeError } = useWrite();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState<Form>(() => {
    const date = params.get('date');
    const day = isDateKey(date) ? date : today;
    return {
      title: '',
      date: day,
      start: defaultStart(day, today),
      end: '',
      location: '',
      contact_id: params.get('contact'),
      project_id: null,
      notes: '',
      debrief_reminder_enabled: true,
    };
  });
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Suggestions d'adresses (Nominatim) : null = liste fermée, [] = aucun résultat.
  const [suggestions, setSuggestions] = useState<AddressSuggestion[] | null>(null);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const addressSearch = useRef<AbortController | null>(null);
  useEffect(() => () => addressSearch.current?.abort(), []);

  const { data: contacts } = useRemoteQuery(listContacts, NO_CONTACTS);
  const { data: projects } = useRemoteQuery(listProjects, NO_PROJECTS);
  // Élément lié supprimé entre-temps : il n'est plus dans la liste, le lien est proposé au retrait.
  const projectMissing = form.project_id != null && projects.length > 0 && !projects.some((p) => p.id === form.project_id);

  // Lu une seule fois à l'ouverture (une écriture ailleurs pendant la saisie ne l'écrase pas).
  useEffect(() => {
    if (!id) return;
    let active = true;
    getAppointment(id)
      .then((a) => {
        if (!active) return;
        setAppointment(a);
        if (a) setForm(toForm(a));
      })
      .catch((e: unknown) => active && setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const endBeforeStart = form.end !== '' && minutesOf(form.end) <= minutesOf(form.start);
  const canSave =
    form.title.trim().length > 0 && form.start !== '' && !endBeforeStart && !loading && !saving && (!id || !!appointment);

  const startAt = form.start ? toInstant(form.date, form.start).toISOString() : null;
  const endAt = form.end ? toInstant(form.date, form.end).toISOString() : null;
  const debrief = startAt
    ? debriefAt({ start_at: startAt, end_at: endAt, debrief_reminder_enabled: form.debrief_reminder_enabled })
    : null;
  const debriefInFuture = !!debrief && debrief > new Date();

  // La fin suit le début quand on le décale (même durée), tant qu'elle tient dans la journée.
  const changeStart = (start: Time) =>
    setForm((f) => {
      if (!f.end || !start || !f.start) return { ...f, start };
      const m = minutesOf(f.end) + minutesOf(start) - minutesOf(f.start);
      return { ...f, start, end: m > minutesOf(start) && m < 24 * 60 ? fromMinutes(m) : f.end };
    });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || !startAt) return;
    const fields = {
      title: form.title.trim(),
      start_at: startAt,
      end_at: endAt,
      location: form.location.trim() || null,
      contact_id: form.contact_id,
      project_id: form.project_id,
      notes: form.notes.trim() || null,
      debrief_reminder_enabled: form.debrief_reminder_enabled,
    };
    setSaving(true);
    const ok = await run(async () => {
      if (appointment) await updateAppointment(appointment.id, changedFields(appointment, fields));
      else await addAppointment(fields);
    });
    setSaving(false);
    if (ok) goBack();
  };

  const closeSuggestions = () => {
    addressSearch.current?.abort();
    addressSearch.current = null;
    setSearchingAddress(false);
    setSuggestions(null);
  };

  // Recherche sur action explicite uniquement : la politique Nominatim interdit
  // l'autocomplétion à la frappe (voir DECISIONS.md §24).
  const findAddress = () => {
    if (!canSearchAddress(form.location)) return;
    closeSuggestions();
    const controller = new AbortController();
    addressSearch.current = controller;
    setSearchingAddress(true);
    searchAddress(form.location, controller.signal)
      .then((results) => {
        if (addressSearch.current === controller) setSuggestions(results);
      })
      .catch(() => undefined) // Échec silencieux : le texte saisi reste tel quel.
      .finally(() => {
        if (addressSearch.current === controller) setSearchingAddress(false);
      });
  };

  const confirmDelete = () => {
    if (!appointment) return;
    confirm({
      title: 'Supprimer ce rendez-vous ?',
      message: appointment.title || undefined,
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () => void run(() => softDeleteAppointment(appointment.id)).then((ok) => ok && goBack()),
    });
  };

  const openDebrief = () =>
    navigate(form.contact_id ? `/agency/meeting-report?contact=${form.contact_id}` : '/agency/meeting-report');

  const debriefHint = !form.debrief_reminder_enabled
    ? null
    : debriefInFuture && debrief
      ? `Notification sur le mobile ${formatDueLabel(toDateKey(debrief), today).toLowerCase()} à ${formatTimeOfDay(debrief.toISOString())} (${form.end ? '1 h après la fin' : '2 h après le début, faute d’heure de fin'}).`
      : 'Ce RDV est déjà passé : aucune notification ne sera envoyée.';

  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.location.trim())}`;

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Agenda" title={id ? 'Rendez-vous' : 'Nouveau rendez-vous'} />
      <ErrorBanner message={loadError ?? writeError} />
      {id && !loading && !appointment && !loadError ? (
        <CategoryCard category="agenda" icon={CalendarDays} title="Rendez-vous">
          <CardNote>Ce rendez-vous n’existe plus (supprimé sur un autre appareil ?).</CardNote>
        </CategoryCard>
      ) : (
        <form className="stack" onSubmit={(e) => void save(e)}>
          {/* Catégorie Agenda : cartes bleu ciel (DECISIONS.md §26). */}
          <CategoryCard category="agenda" icon={CalendarDays} title={id ? 'Rendez-vous' : 'Nouveau rendez-vous'}>
            <div className="form">
              <FormField label="Titre *" htmlFor="appointment-title">
                <input
                  id="appointment-title"
                  className="input"
                  value={form.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  placeholder="Ex. Déjeuner avec le directeur sportif"
                  autoFocus={!id}
                  disabled={loading}
                />
              </FormField>
              <FormField label="Date" htmlFor="appointment-date">
                <span className="inline-field">
                  <input
                    id="appointment-date"
                    className="input"
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => e.target.value && patch({ date: e.target.value })}
                  />
                  <span className="row__meta-item">{formatDueLabel(form.date, today)}</span>
                </span>
              </FormField>
              <div className="form form--grid">
                <FormField label="Début" htmlFor="appointment-start">
                  <input
                    id="appointment-start"
                    className="input"
                    type="time"
                    required
                    value={form.start}
                    onChange={(e) => changeStart(e.target.value)}
                  />
                </FormField>
                <FormField
                  label="Fin (facultative)"
                  htmlFor="appointment-end"
                  error={endBeforeStart ? 'L’heure de fin doit être après l’heure de début.' : null}
                >
                  {form.end ? (
                    <span className="inline-field">
                      <input
                        id="appointment-end"
                        className="input"
                        type="time"
                        value={form.end}
                        onChange={(e) => patch({ end: e.target.value })}
                      />
                      <button type="button" className="text-action" onClick={() => patch({ end: '' })}>
                        Retirer
                      </button>
                    </span>
                  ) : (
                    <button
                      id="appointment-end"
                      type="button"
                      className="text-action"
                      onClick={() => patch({ end: defaultEnd(form.start || '09:00') })}
                    >
                      Ajouter une heure de fin
                    </button>
                  )}
                </FormField>
              </div>
            </div>
          </CategoryCard>

          <CategoryCard category="agenda" icon={MapPin} title="Lieu">
            <div className="form">
              <input
                className="input"
                value={form.location}
                aria-label="Lieu"
                onChange={(e) => {
                  // Les suggestions affichées ne correspondent plus au texte : on les ferme.
                  if (suggestions || searchingAddress) closeSuggestions();
                  patch({ location: e.target.value });
                }}
                onKeyDown={(e) => {
                  // Entrée lance la recherche d'adresse au lieu d'envoyer le formulaire.
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    findAddress();
                  }
                }}
                placeholder="Adresse, salle, visio…"
              />
              {suggestions && (
                <CardList>
                  {suggestions.length === 0 ? (
                    <li className="row">
                      <span className="row__subtitle">Aucune adresse trouvée. Le texte saisi est conservé tel quel.</span>
                    </li>
                  ) : (
                    suggestions.map((s) => (
                      <li key={s.id} className="row">
                        <MapPin size={16} className="tint-icon" />
                        <button
                          type="button"
                          className="row__main row__button"
                          onClick={() => {
                            patch({ location: s.label });
                            closeSuggestions();
                          }}
                        >
                          <span className="row__title">{s.label}</span>
                        </button>
                      </li>
                    ))
                  )}
                  <li className="row">
                    <span className="row__subtitle address-attribution">© contributeurs OpenStreetMap</span>
                    <button type="button" className="text-action" onClick={closeSuggestions}>
                      Fermer
                    </button>
                  </li>
                </CardList>
              )}
              {form.location.trim().length > 0 && (
                <div className="toolbar">
                  {canSearchAddress(form.location) && (
                    <TextAction
                      label={searchingAddress ? 'Recherche…' : 'Chercher l’adresse'}
                      icon={Search}
                      category="agenda"
                      onClick={findAddress}
                      disabled={searchingAddress}
                    />
                  )}
                  <a className="text-action text-action--tinted" href={directionsUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={16} />
                    Itinéraire
                  </a>
                </div>
              )}
            </div>
          </CategoryCard>

          <CategoryCard category="agenda" icon={Link2} title="Liens">
            <div className="form">
              <FormField label="Contact lié" htmlFor="appointment-contact">
                <ContactSelect
                  id="appointment-contact"
                  contacts={contacts}
                  value={form.contact_id}
                  onChange={(contact_id) => patch({ contact_id })}
                />
              </FormField>
              <FormField label="Projet lié" htmlFor="appointment-project">
                <span className="inline-field">
                  <select
                    id="appointment-project"
                    className="select"
                    value={projectMissing ? '' : (form.project_id ?? '')}
                    onChange={(e) => patch({ project_id: e.target.value || null })}
                  >
                    <option value="">{projectMissing ? 'Projet supprimé' : 'Aucun'}</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title || 'Sans titre'}
                      </option>
                    ))}
                  </select>
                  {form.project_id && (
                    <button type="button" className="text-action" onClick={() => patch({ project_id: null })}>
                      Retirer
                    </button>
                  )}
                </span>
              </FormField>
            </div>
          </CategoryCard>

          <CategoryCard category="agenda" icon={NotebookPen} title="Notes et debrief">
            <div className="form">
              <textarea
                className="input textarea"
                rows={4}
                value={form.notes}
                onChange={(e) => patch({ notes: e.target.value })}
                placeholder="Ordre du jour, documents à apporter…"
                aria-label="Notes"
              />
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={form.debrief_reminder_enabled}
                  onChange={(e) => patch({ debrief_reminder_enabled: e.target.checked })}
                />
                Rappel de debrief automatique
              </label>
              {debriefHint && <CardNote tone={debriefInFuture ? 'muted' : 'danger'}>{debriefHint}</CardNote>}
            </div>
          </CategoryCard>

          <div className="form-actions">
            {appointment && (
              <button type="button" className="button button--danger" onClick={confirmDelete}>
                Supprimer le rendez-vous
              </button>
            )}
            {appointment && (
              <button type="button" className="button button--secondary" onClick={openDebrief}>
                Faire le compte-rendu
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
