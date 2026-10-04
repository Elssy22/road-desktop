import { Hourglass, Link2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { useConfirm } from '../../components/Dialog';
import { ContactSelect } from '../../components/ContactSelect';
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
import { formatDueLabel, type DateKey } from '../../lib/dates';
import { useToday } from '../../lib/useToday';

type Form = { title: string; date: DateKey | null; category: string; contact_id: string | null; notes: string };
const EMPTY_FORM: Form = { title: '', date: null, category: 'fin_contrat', contact_id: null, notes: '' };
const NO_CONTACTS: ContactWithLast[] = [];

const toForm = (k: KeyDate): Form => ({
  title: k.title,
  date: k.date,
  category: k.category,
  contact_id: k.contact_id,
  notes: k.notes ?? '',
});

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
  const navigate = useNavigate();
  const location = useLocation();
  // Ouvert depuis l'échéancier, la Vue du jour ou le calendrier : retour à l'écran
  // d'origine ; ouvert directement (rechargement), retour à l'échéancier.
  const goBack = () => (location.key === 'default' ? navigate('/agency/key-dates', { replace: true }) : navigate(-1));
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
      .catch((e: unknown) => active && setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const canSave = form.title.trim().length > 0 && form.date != null && !loading && !saving && (!id || !!keyDate);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || !form.date) return;
    const fields = {
      title: form.title.trim(),
      date: form.date,
      category: form.category,
      contact_id: form.contact_id,
      notes: form.notes.trim() || null,
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
                  placeholder="Ex. Fin de contrat de X avec Y"
                  autoFocus={!id}
                  disabled={loading}
                />
              </FormField>
              <FormField label="Date *" htmlFor="key-date-date">
                <span className="inline-field">
                  <input
                    id="key-date-date"
                    className="input"
                    type="date"
                    required
                    value={form.date ?? ''}
                    onChange={(e) => patch({ date: e.target.value || null })}
                  />
                  {form.date && <span className="row__meta-item">{formatDueLabel(form.date, today)}</span>}
                </span>
              </FormField>
              <FormField label="Catégorie">
                <ChipRow>
                  {KEY_DATE_CATEGORIES.map((c) => (
                    <Chip key={c} label={CATEGORY_LABELS[c]} selected={form.category === c} onClick={() => patch({ category: c })} />
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
