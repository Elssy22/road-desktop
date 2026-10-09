import { Hourglass, Link2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { useConfirm } from '../../components/Dialog';
import { ContactSelect } from '../../components/ContactSelect';
import { errorMessage } from '../../lib/errors';
import { CardNote, CategoryCard, Chip, ChipRow, ErrorBanner, FormField, ScreenHeader } from '../../components/ui';
import { listContacts, type ContactWithLast } from '../../data/crm';
import {
  addKeyDate,
  CATEGORY_LABELS,
  getKeyDate,
  KEY_DATE_CATEGORIES,
  softDeleteKeyDate,
  updateKeyDate,
  type KeyDate,
} from '../../data/keyDates';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { useWrite } from '../../data/useWrite';
import { changedFields } from '../../data/base';
import { formatDueLabel, fromDateKey, type DateKey } from '../../lib/dates';
import {
  nextOccurrence,
  RECURRENCE_LABELS,
  RECURRENCES,
  usesRecurrenceDay,
  type Recurrence,
} from '../../lib/keyDateRecurrence';
import { useFormExit } from '../../lib/useFormExit';
import { useToday } from '../../lib/useToday';

type Form = {
  title: string;
  date: DateKey | null;
  category: string;
  contact_id: string | null;
  notes: string;
  recurrence: Recurrence | null;
  /** Saisie brute du jour du mois ; vide = jour de la première échéance. */
  recurrence_day: string;
};
const EMPTY_FORM: Form = {
  title: '',
  date: null,
  category: 'fin_contrat',
  contact_id: null,
  notes: '',
  recurrence: null,
  recurrence_day: '',
};
const NO_CONTACTS: ContactWithLast[] = [];

const toForm = (k: KeyDate): Form => ({
  title: k.title,
  date: k.date,
  category: k.category,
  contact_id: k.contact_id,
  notes: k.notes ?? '',
  recurrence: k.recurrence,
  recurrence_day: k.recurrence_day ? String(k.recurrence_day) : '',
});

/** Jour du mois saisi, ou null si la saisie est vide ou hors de 1-31. */
function typedDay(form: Form): number | null {
  const n = Number(form.recurrence_day);
  return form.recurrence_day.trim() && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

/** Jour du mois enregistré : la saisie, sinon celui de la première échéance. */
function recurrenceDay(form: Form): number | null {
  if (!usesRecurrenceDay(form.recurrence)) return null;
  return typedDay(form) ?? (form.date ? fromDateKey(form.date).getDate() : null);
}

/** Saisie du jour du mois invalide (vide est permis). */
const badRecurrenceDay = (form: Form) =>
  usesRecurrenceDay(form.recurrence) && form.recurrence_day.trim() !== '' && typedDay(form) == null;

/**
 * Création (`/agency/key-dates/new`) ou modification (`/agency/key-dates/:id`)
 * d'une date clé : portage web de mobile-legacy/src/screens/agency/KeyDateFormScreen.tsx.
 */
export function KeyDateFormScreen() {
  const { id } = useParams();
  // Même écran pour les deux routes : la clé repart d'un formulaire vierge (et relu).
  return <KeyDateForm key={id ?? 'new'} id={id} />;
}

function KeyDateForm({ id }: { id?: string }) {
  // Ouvert depuis l'échéancier, la Vue du jour ou le calendrier : retour à l'écran
  // d'origine ; ouvert directement (rechargement), retour à l'échéancier.
  const goBack = useFormExit('/agency/key-dates');
  const today = useToday();
  const { run, error: writeError } = useWrite();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [keyDate, setKeyDate] = useState<KeyDate | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: contacts } = useRemoteQuery(listContacts, NO_CONTACTS);

  // Lu une seule fois à l'ouverture (une écriture ailleurs pendant la saisie ne l'écrase pas).
  useEffect(() => {
    if (!id) return;
    let active = true;
    getKeyDate(id)
      .then((k) => {
        if (!active) return;
        setKeyDate(k);
        if (k) setForm(toForm(k));
      })
      .catch((e: unknown) => active && setLoadError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const dayError = badRecurrenceDay(form) ? 'Un jour entre 1 et 31.' : null;
  const canSave =
    form.title.trim().length > 0 && form.date != null && !dayError && !loading && !saving && (!id || !!keyDate);
  // Aperçu : la prochaine échéance d'une série, telle que l'échéancier l'affichera.
  const shownDate =
    form.date && form.recurrence
      ? nextOccurrence({ date: form.date, recurrence: form.recurrence, recurrence_day: recurrenceDay(form) }, today)
      : form.date;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || !form.date) return;
    const fields = {
      title: form.title.trim(),
      date: form.date,
      category: form.category,
      contact_id: form.contact_id,
      notes: form.notes.trim() || null,
      recurrence: form.recurrence,
      recurrence_day: recurrenceDay(form),
    };
    setSaving(true);
    const ok = await run(async () => {
      if (keyDate) await updateKeyDate(keyDate.id, changedFields(keyDate, fields));
      else await addKeyDate(fields);
    });
    setSaving(false);
    if (ok) goBack();
  };

  const confirmDelete = () => {
    if (!keyDate) return;
    confirm({
      title: 'Supprimer cette date clé ?',
      message: keyDate.title || undefined,
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () => void run(() => softDeleteKeyDate(keyDate.id)).then((ok) => ok && goBack()),
    });
  };

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Échéancier" title={id ? 'Modifier la date clé' : 'Nouvelle date clé'} />
      <ErrorBanner message={loadError ?? writeError} />
      {id && !loading && !keyDate && !loadError ? (
        <CategoryCard category="keyDates" icon={Hourglass} title="Date clé">
          <CardNote>Cette date clé n’existe plus (supprimée sur un autre appareil ?).</CardNote>
        </CategoryCard>
      ) : (
        <form className="stack" onSubmit={(e) => void save(e)}>
          {/* Catégorie Échéances clés : cartes beurre (DECISIONS.md §29). */}
          <CategoryCard category="keyDates" icon={Hourglass} title={id ? 'Date clé' : 'Nouvelle date clé'}>
            <div className="form">
              <FormField label="Intitulé *" htmlFor="key-date-title">
                <input
                  id="key-date-title"
                  className="input"
                  value={form.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  placeholder="Ex. Fin de contrat de X avec Y, déclaration URSSAF…"
                  autoFocus={!id}
                  disabled={loading}
                />
              </FormField>
              <FormField label="Récurrence">
                <ChipRow>
                  <Chip label="Aucune" selected={!form.recurrence} onClick={() => patch({ recurrence: null })} />
                  {RECURRENCES.map((r) => (
                    <Chip
                      key={r}
                      label={RECURRENCE_LABELS[r]}
                      selected={form.recurrence === r}
                      onClick={() => patch({ recurrence: r })}
                    />
                  ))}
                </ChipRow>
              </FormField>
              <FormField label={form.recurrence ? 'Première échéance *' : 'Date *'} htmlFor="key-date-date">
                <span className="inline-field">
                  <input
                    id="key-date-date"
                    className="input"
                    type="date"
                    required
                    value={form.date ?? ''}
                    onChange={(e) => patch({ date: e.target.value || null })}
                  />
                  {shownDate && (
                    <span className="row__meta-item">
                      {form.recurrence ? 'Prochaine : ' : ''}
                      {formatDueLabel(shownDate, today)}
                    </span>
                  )}
                </span>
              </FormField>
              {usesRecurrenceDay(form.recurrence) && (
                <FormField label="Jour du mois" htmlFor="key-date-day" error={dayError}>
                  <input
                    id="key-date-day"
                    className="input input--compact"
                    type="number"
                    min={1}
                    max={31}
                    value={form.recurrence_day}
                    onChange={(e) => patch({ recurrence_day: e.target.value })}
                    placeholder={form.date ? String(fromDateKey(form.date).getDate()) : '15'}
                  />
                  <span className="form-field__hint">
                    {form.recurrence === 'quarterly' ? 'Tous les 3 mois à partir de la première échéance. ' : ''}
                    Vide : jour de la première échéance. Les jours 29 à 31 passent au dernier jour des mois plus courts.
                  </span>
                </FormField>
              )}
              <FormField label="Catégorie">
                <ChipRow>
                  {KEY_DATE_CATEGORIES.map((c) => (
                    <Chip
                      key={c}
                      label={CATEGORY_LABELS[c]}
                      selected={form.category === c}
                      onClick={() => patch({ category: c })}
                    />
                  ))}
                </ChipRow>
              </FormField>
            </div>
          </CategoryCard>

          <CategoryCard category="keyDates" icon={Link2} title="Contact et notes">
            <div className="form">
              <FormField label="Contact lié" htmlFor="key-date-contact">
                <ContactSelect
                  id="key-date-contact"
                  contacts={contacts}
                  value={form.contact_id}
                  onChange={(contact_id) => patch({ contact_id })}
                />
              </FormField>
              <FormField label="Notes" htmlFor="key-date-notes">
                <textarea
                  id="key-date-notes"
                  className="input textarea"
                  rows={4}
                  value={form.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                  placeholder="Clauses, options, interlocuteurs…"
                />
              </FormField>
            </div>
          </CategoryCard>

          <div className="form-actions">
            {keyDate && (
              <button type="button" className="button button--danger" onClick={confirmDelete}>
                Supprimer la date clé
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
