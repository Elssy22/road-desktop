import { Link2, Tags, Wallet } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import { useConfirm } from '../../components/Dialog';
import { ContactSelect } from '../../components/ContactSelect';
import { errorMessage } from '../../lib/errors';
import { CardNote, CategoryCard, Chip, ChipRow, ErrorBanner, FormField, ScreenHeader } from '../../components/ui';
import { listContacts, type ContactWithLast } from '../../data/crm';
import {
  addMoneyItem,
  CURRENCIES,
  getMoneyItem,
  KIND_LABELS,
  MONEY_KINDS,
  MONEY_STATUS_LABELS,
  softDeleteMoneyItem,
  updateMoneyItem,
  type MoneyItem,
} from '../../data/money';
import { listProjects, type ProjectWithProgress } from '../../data/projects';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { useWrite } from '../../data/useWrite';
import { changedFields } from '../../data/base';
import { formatDueLabel, type DateKey } from '../../lib/dates';
import { amountToInput, parseAmount } from '../../lib/money';
import { useFormExit } from '../../lib/useFormExit';
import { useToday } from '../../lib/useToday';

type Form = {
  label: string;
  amount: string;
  currency: string;
  kind: string;
  status: string;
  due_date: DateKey | null;
  contact_id: string | null;
  project_id: string | null;
};
const EMPTY_FORM: Form = {
  label: '',
  amount: '',
  currency: 'EUR',
  kind: 'commission_attendue',
  status: 'en_attente',
  due_date: null,
  contact_id: null,
  project_id: null,
};
/** Ordre de saisie (la liste, elle, montre « En retard » en premier). */
const FORM_STATUSES = ['en_attente', 'payé', 'en_retard'];
const NO_CONTACTS: ContactWithLast[] = [];
const NO_PROJECTS: ProjectWithProgress[] = [];

const toForm = (m: MoneyItem): Form => ({
  label: m.label,
  amount: amountToInput(m.amount),
  currency: m.currency,
  kind: m.kind,
  status: m.status,
  due_date: m.due_date,
  contact_id: m.contact_id,
  project_id: m.project_id,
});

/**
 * Création (`/agency/money/new`) ou modification (`/agency/money/:id`) d'une
 * ligne du suivi financier : portage web de mobile-legacy/src/screens/agency/MoneyFormScreen.tsx.
 */
export function MoneyFormScreen() {
  const { id } = useParams();
  // Même écran pour les deux routes : la clé repart d'un formulaire vierge (et relu).
  return <MoneyForm key={id ?? 'new'} id={id} />;
}

function MoneyForm({ id }: { id?: string }) {
  const goBack = useFormExit('/agency/money');
  const today = useToday();
  const { run, error: writeError } = useWrite();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [item, setItem] = useState<MoneyItem | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: contacts } = useRemoteQuery(listContacts, NO_CONTACTS);
  const { data: projects } = useRemoteQuery(listProjects, NO_PROJECTS);
  // Projets proposés : en cours, plus celui déjà lié quel que soit son statut.
  const projectChoices = projects.filter((p) => p.status !== 'terminé' || p.id === form.project_id);

  // Lu une seule fois à l'ouverture (une écriture ailleurs pendant la saisie ne l'écrase pas).
  useEffect(() => {
    if (!id) return;
    let active = true;
    getMoneyItem(id)
      .then((m) => {
        if (!active) return;
        setItem(m);
        if (m) setForm(toForm(m));
      })
      .catch((e: unknown) => active && setLoadError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const amount = parseAmount(form.amount);
  const amountInvalid = form.amount.trim() !== '' && amount === null;
  const canSave = form.label.trim().length > 0 && amount !== null && !loading && !saving && (!id || !!item);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || amount === null) return;
    const fields = { ...form, label: form.label.trim(), amount };
    setSaving(true);
    const ok = await run(async () => {
      if (item) await updateMoneyItem(item.id, changedFields(item, fields));
      else await addMoneyItem(fields);
    });
    setSaving(false);
    if (ok) goBack();
  };

  const confirmDelete = () => {
    if (!item) return;
    confirm({
      title: 'Supprimer cette ligne ?',
      message: item.label || undefined,
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () => void run(() => softDeleteMoneyItem(item.id)).then((ok) => ok && goBack()),
    });
  };

  const title = id ? 'Ligne financière' : 'Nouvelle ligne';

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Finances" title={id ? 'Modifier la ligne' : 'Nouvelle ligne'} />
      <ErrorBanner message={loadError ?? writeError} />
      {id && !loading && !item && !loadError ? (
        <CategoryCard category="finance" icon={Wallet} title="Ligne financière">
          <CardNote>Cette ligne n’existe plus (supprimée sur un autre appareil ?).</CardNote>
        </CategoryCard>
      ) : (
        <form className="stack" onSubmit={(e) => void save(e)}>
          {/* Catégorie Finances : cartes lavande (DECISIONS.md §30). */}
          <CategoryCard category="finance" icon={Wallet} title={title}>
            <div className="form">
              <FormField label="Libellé *" htmlFor="money-label">
                <input
                  id="money-label"
                  className="input"
                  value={form.label}
                  onChange={(e) => patch({ label: e.target.value })}
                  placeholder="Ex. Commission partenariat marque"
                  autoFocus={!id}
                  disabled={loading}
                />
              </FormField>
              <FormField
                label="Montant *"
                htmlFor="money-amount"
                error={amountInvalid ? 'Montant invalide (ex. 1200 ou 1200,50).' : null}
              >
                <input
                  id="money-amount"
                  className="input"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => patch({ amount: e.target.value })}
                  placeholder="0,00"
                  disabled={loading}
                />
              </FormField>
              <FormField label="Devise">
                <ChipRow>
                  {[...new Set([...CURRENCIES, form.currency])].map((c) => (
                    <Chip key={c} label={c} selected={form.currency === c} onClick={() => patch({ currency: c })} />
                  ))}
                </ChipRow>
              </FormField>
            </div>
          </CategoryCard>

          <CategoryCard category="finance" icon={Tags} title="Type et statut">
            <div className="form">
              <FormField label="Type">
                <ChipRow>
                  {MONEY_KINDS.map((k) => (
                    <Chip
                      key={k}
                      label={KIND_LABELS[k]}
                      selected={form.kind === k}
                      // Un paiement reçu est, par définition, payé.
                      onClick={() => patch(k === 'paiement_recu' ? { kind: k, status: 'payé' } : { kind: k })}
                    />
                  ))}
                </ChipRow>
              </FormField>
              <FormField label="Statut">
                <ChipRow>
                  {FORM_STATUSES.map((s) => (
                    <Chip
                      key={s}
                      label={MONEY_STATUS_LABELS[s]}
                      selected={form.status === s}
                      onClick={() => patch({ status: s })}
                    />
                  ))}
                </ChipRow>
              </FormField>
              <FormField label="Échéance" htmlFor="money-due">
                <span className="inline-field">
                  <input
                    id="money-due"
                    className="input"
                    type="date"
                    value={form.due_date ?? ''}
                    onChange={(e) => patch({ due_date: e.target.value || null })}
                  />
                  {form.due_date ? (
                    <>
                      <span className="row__meta-item">{formatDueLabel(form.due_date, today)}</span>
                      <button type="button" className="text-action" onClick={() => patch({ due_date: null })}>
                        Retirer
                      </button>
                    </>
                  ) : (
                    <span className="row__meta-item">Sans échéance</span>
                  )}
                </span>
              </FormField>
            </div>
          </CategoryCard>

          <CategoryCard category="finance" icon={Link2} title="Contact et projet">
            <div className="form">
              <FormField label="Contact lié" htmlFor="money-contact">
                <ContactSelect
                  id="money-contact"
                  contacts={contacts}
                  value={form.contact_id}
                  onChange={(contact_id) => patch({ contact_id })}
                />
              </FormField>
              <FormField label="Projet lié">
                <ChipRow>
                  <Chip label="Aucun" selected={form.project_id === null} onClick={() => patch({ project_id: null })} />
                  {projectChoices.map((p) => (
                    <Chip
                      key={p.id}
                      label={p.title || 'Sans titre'}
                      selected={form.project_id === p.id}
                      onClick={() => patch({ project_id: p.id })}
                    />
                  ))}
                </ChipRow>
              </FormField>
            </div>
          </CategoryCard>

          <div className="form-actions">
            {item && (
              <button type="button" className="button button--danger" onClick={confirmDelete}>
                Supprimer la ligne
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
