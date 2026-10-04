import { FileText, Phone, TrendingUp, UserRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  CardNote,
  CategoryCard,
  Chip,
  ChipRow,
  ErrorBanner,
  FormField,
  ScreenHeader,
} from '../../components/ui';
import {
  addContact,
  getContact,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGES,
  ROLE_SUGGESTIONS,
  SEGMENT_LABELS,
  SEGMENTS,
  stageFields,
  updateContact,
  type Contact,
  type ContactSegment,
  type PipelineStage,
} from '../../data/crm';
import { useWrite } from '../../data/useWrite';
import { changedFields } from '../../data/base';
import type { DateKey } from '../../lib/dates';
import { amountToInput, parseAmount } from '../../lib/money';

type Form = {
  name: string;
  role: string;
  club: string;
  phone: string;
  email: string;
  notes: string;
  segment: ContactSegment | null;
  /** Section « Prospection » ouverte (contact dans le pipeline). */
  prospect: boolean;
  stage: PipelineStage;
  amount: string;
  followup: DateKey | null;
};

const EMPTY_FORM: Form = {
  name: '',
  role: '',
  club: '',
  phone: '',
  email: '',
  notes: '',
  segment: null,
  prospect: false,
  stage: 'a_demarcher',
  amount: '',
  followup: null,
};

const toForm = (c: Contact): Form => ({
  name: c.name,
  role: c.role,
  club: c.club ?? '',
  phone: c.phone ?? '',
  email: c.email ?? '',
  notes: c.notes ?? '',
  segment: c.segment,
  prospect: c.pipeline_stage !== null,
  stage: c.pipeline_stage ?? 'a_demarcher',
  amount: c.pipeline_amount != null ? amountToInput(c.pipeline_amount) : '',
  followup: c.next_followup_date,
});

/** Champ facultatif : chaîne vide → NULL. */
const orNull = (s: string) => (s.trim() ? s.trim() : null);

/**
 * Création (`/agency/contacts/new`) ou modification (`/agency/contacts/:id/edit`)
 * d'un contact : portage web de mobile-legacy/src/screens/agency/ContactFormScreen.tsx.
 */
export function ContactFormScreen() {
  const { id } = useParams();
  // Les deux routes rendent ce même écran au même endroit : la clé repart d'un
  // formulaire vierge (et relu) quand on passe de l'une à l'autre.
  return <ContactForm key={id ?? 'new'} id={id} />;
}

function ContactForm({ id }: { id?: string }) {
  const navigate = useNavigate();
  const { run, error: writeError } = useWrite();
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Lu une seule fois à l'ouverture (une écriture ailleurs pendant la saisie ne l'écrase pas).
  useEffect(() => {
    if (!id) return;
    let active = true;
    getContact(id)
      .then((c) => {
        if (!active) return;
        setContact(c);
        if (c) setForm(toForm(c));
      })
      .catch((e: unknown) => active && setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));

  const amount = form.amount.trim() ? parseAmount(form.amount) : null;
  const amountInvalid = form.prospect && form.amount.trim().length > 0 && amount === null;

  // En modification, rien à enregistrer si le contact a disparu entre-temps.
  const canSave = form.name.trim().length > 0 && !amountInvalid && !loading && !saving && (!id || !!contact);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const fields = {
      name: form.name.trim(),
      role: form.role.trim(),
      club: orNull(form.club),
      phone: orNull(form.phone),
      email: orNull(form.email),
      notes: orNull(form.notes),
      segment: form.segment,
      // Section fermée = hors pipeline. Montant et relance sont conservés : ils
      // réapparaissent si le contact redevient un prospect.
      ...stageFields(contact, form.prospect ? form.stage : null),
      pipeline_amount: form.prospect ? amount : (contact?.pipeline_amount ?? null),
      next_followup_date: form.prospect ? form.followup : (contact?.next_followup_date ?? null),
    };
    setSaving(true);
    let savedId = contact?.id ?? null;
    const ok = await run(async () => {
      if (contact) await updateContact(contact.id, changedFields(contact, fields));
      else savedId = await addContact(fields);
    });
    setSaving(false);
    if (ok && savedId) navigate(`/agency/contacts/${savedId}`, { replace: true });
  };

  const cancel = () => (id ? navigate(`/agency/contacts/${id}`) : navigate('/agency/contacts'));

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Contacts" title={id ? 'Modifier le contact' : 'Nouveau contact'} />
      <ErrorBanner message={loadError ?? writeError} />
      {id && !loading && !contact && !loadError ? (
        <CategoryCard category="contacts" icon={UserRound} title="Contact">
          <CardNote>Ce contact n’existe plus (supprimé sur un autre appareil ?).</CardNote>
        </CategoryCard>
      ) : (
        <form className="stack" onSubmit={(e) => void save(e)}>
          {/* Catégorie Contacts : cartes roses (DECISIONS.md §29). */}
          <CategoryCard category="contacts" icon={UserRound} title={id ? 'Contact' : 'Nouveau contact'}>
            <div className="form">
              <FormField label="Nom *" htmlFor="contact-name">
                <input
                  id="contact-name"
                  className="input"
                  value={form.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="Prénom Nom ou nom du club"
                  autoFocus={!id}
                  disabled={loading}
                />
              </FormField>
              <FormField label="Rôle" htmlFor="contact-role">
                <input
                  id="contact-role"
                  className="input"
                  value={form.role}
                  onChange={(e) => patch({ role: e.target.value })}
                  placeholder="Créateur, Club, Coach…"
                  disabled={loading}
                />
                <ChipRow>
                  {ROLE_SUGGESTIONS.map((r) => (
                    <Chip key={r} label={r} selected={form.role === r} onClick={() => patch({ role: r })} />
                  ))}
                </ChipRow>
              </FormField>
              <FormField label="Segment">
                <ChipRow>
                  <Chip label="Aucun" selected={form.segment === null} onClick={() => patch({ segment: null })} />
                  {SEGMENTS.map((s) => (
                    <Chip key={s} label={SEGMENT_LABELS[s]} selected={form.segment === s} onClick={() => patch({ segment: s })} />
                  ))}
                </ChipRow>
              </FormField>
            </div>
          </CategoryCard>

          <CategoryCard category="contacts" icon={Phone} title="Coordonnées">
            <div className="form form--grid">
              <FormField label="Club" htmlFor="contact-club">
                <input
                  id="contact-club"
                  className="input"
                  value={form.club}
                  onChange={(e) => patch({ club: e.target.value })}
                  placeholder="Club actuel"
                />
              </FormField>
              <FormField label="Téléphone" htmlFor="contact-phone">
                <input
                  id="contact-phone"
                  className="input"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => patch({ phone: e.target.value })}
                  placeholder="+33…"
                />
              </FormField>
              <FormField label="E-mail" htmlFor="contact-email">
                <input
                  id="contact-email"
                  className="input"
                  type="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={form.email}
                  onChange={(e) => patch({ email: e.target.value })}
                  placeholder="nom@exemple.com"
                />
              </FormField>
            </div>
          </CategoryCard>

          <CategoryCard category="contacts" icon={TrendingUp} title="Prospection">
            <div className="form">
              <label className="toggle">
                <input type="checkbox" checked={form.prospect} onChange={(e) => patch({ prospect: e.target.checked })} />
                Ce contact est un prospect en cours de démarchage
              </label>
              {form.prospect && (
                <>
                  <FormField label="Étape">
                    <ChipRow>
                      {PIPELINE_STAGES.map((s) => (
                        <Chip key={s} label={PIPELINE_STAGE_LABELS[s]} selected={form.stage === s} onClick={() => patch({ stage: s })} />
                      ))}
                    </ChipRow>
                  </FormField>
                  <div className="form form--grid">
                    <FormField
                      label="Montant potentiel (€)"
                      htmlFor="contact-amount"
                      error={amountInvalid ? 'Montant invalide (ex. 1200 ou 1200,50).' : null}
                    >
                      <input
                        id="contact-amount"
                        className="input"
                        inputMode="decimal"
                        value={form.amount}
                        onChange={(e) => patch({ amount: e.target.value })}
                        placeholder="0,00"
                      />
                    </FormField>
                    <FormField label="Prochaine relance" htmlFor="contact-followup">
                      <span className="inline-field">
                        <input
                          id="contact-followup"
                          className="input"
                          type="date"
                          value={form.followup ?? ''}
                          onChange={(e) => patch({ followup: e.target.value || null })}
                        />
                        {form.followup && (
                          <button type="button" className="text-action" onClick={() => patch({ followup: null })}>
                            Retirer
                          </button>
                        )}
                      </span>
                    </FormField>
                  </div>
                </>
              )}
            </div>
          </CategoryCard>

          <CategoryCard category="contacts" icon={FileText} title="Notes">
            <textarea
              className="input textarea"
              aria-label="Notes"
              value={form.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Poste, situation contractuelle, contexte…"
              rows={5}
            />
          </CategoryCard>

          <div className="form-actions">
            <button type="button" className="button button--ghost" onClick={cancel}>
              Annuler
            </button>
            <button type="submit" className="button button--primary" disabled={!canSave}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
