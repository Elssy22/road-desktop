import {
  AlarmClock,
  Banknote,
  CalendarDays,
  Check,
  Copy,
  Mail,
  MessageCircle,
  MessagesSquare,
  Pencil,
  Phone,
  Plus,
  Presentation,
  Repeat,
  Shirt,
  Sparkles,
  Trash2,
  TrendingUp,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useConfirm } from '../../components/Dialog';
import { askMarkAsActiveClient, STAGE_ICONS, StageSelect } from '../../components/PipelineStage';
import { ReminderRow } from '../../components/ReminderRow';
import {
  Badge,
  CardList,
  CardNote,
  CategoryCard,
  Chip,
  ChipRow,
  ErrorBanner,
  GradientButton,
  ListRow,
  ScreenHeader,
  TextAction,
} from '../../components/ui';
import {
  addInteraction,
  getContact,
  getOpenAutoTask,
  INTERACTION_TYPES,
  listInteractions,
  PIPELINE_STAGE_LABELS,
  segmentLabel,
  setPipelineStage,
  softDeleteContact,
  softDeleteInteraction,
  updateContact,
  type AutoTask,
  type Contact,
  type Interaction,
  type PipelineStage,
} from '../../data/crm';
import { listOpenRemindersForContact, setReminderDone, type ReminderWithLinks } from '../../data/reminders';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { useWrite } from '../../data/useWrite';
import { formatDueLabel, fromDateKey, toDateKey, type DateKey } from '../../lib/dates';
import { daysSinceContact, FOLLOW_UP_DAYS } from '../../lib/followUp';
import { formatMoney } from '../../lib/money';
import { useToday } from '../../lib/useToday';

type Detail = {
  contact: Contact | null;
  interactions: Interaction[];
  reminders: ReminderWithLinks[];
  autoTask: AutoTask | null;
};
const EMPTY: Detail = { contact: null, interactions: [], reminders: [], autoTask: null };

const TYPE_LABELS: Record<string, string> = { appel: 'Appel', rdv: 'RDV', mail: 'Mail', deck: 'Deck', autre: 'Autre' };
const TYPE_ICONS: Record<string, LucideIcon> = {
  appel: Phone,
  rdv: Users,
  mail: Mail,
  deck: Presentation,
};

/** Fiche d'un contact : portage web de mobile-legacy/src/screens/agency/ContactDetailScreen.tsx. */
export function ContactDetailScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const { run, error: writeError } = useWrite();
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async (): Promise<Detail> => {
    const [contact, interactions, reminders, autoTask] = await Promise.all([
      getContact(id),
      listInteractions(id),
      listOpenRemindersForContact(id),
      getOpenAutoTask(id),
    ]);
    return { contact, interactions, reminders, autoTask };
  }, [id]);
  const { data, error, loading } = useRemoteQuery(load, EMPTY);
  const { contact, interactions, reminders, autoTask } = data;

  // Premier chargement, ou fiche précédente encore affichée après un changement
  // d'URL : rien plutôt qu'un faux « contact introuvable » ou le mauvais contact.
  if (loading || (contact && contact.id !== id)) {
    return (
      <div className="screen">
        <ErrorBanner message={error} />
      </div>
    );
  }
  if (!contact) {
    return (
      <div className="screen">
        <ScreenHeader eyebrow="Contacts" title="Contact" />
        <ErrorBanner message={error} />
        <CategoryCard category="contacts" icon={UserRound} title="Contact">
          <CardNote>Ce contact n’existe plus (supprimé sur un autre appareil ?).</CardNote>
        </CategoryCard>
      </div>
    );
  }

  /** Sortie du pipeline : le contact devient un client actif (même ligne, sans étape). */
  const markAsActiveClient = (c: Contact) => void run(() => setPipelineStage(c, null));

  const changeStage = (stage: PipelineStage) => {
    if (stage === contact.pipeline_stage) return;
    void run(() => setPipelineStage(contact, stage));
    if (stage === 'signe') {
      askMarkAsActiveClient(confirm, contact.name, () => markAsActiveClient({ ...contact, pipeline_stage: stage }));
    }
  };

  const confirmDelete = () =>
    confirm({
      title: 'Supprimer ce contact ?',
      message: 'Son historique d’interactions et ses relances automatiques seront aussi supprimés.',
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () =>
        void run(() => softDeleteContact(contact.id)).then((ok) => ok && navigate('/agency/contacts', { replace: true })),
    });

  const confirmDeleteInteraction = (i: Interaction) =>
    confirm({
      title: 'Supprimer cette interaction ?',
      message: i.summary || undefined,
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () => void run(() => softDeleteInteraction(i.id)),
    });

  // Interactions triées de la plus récente à la plus ancienne.
  const days = daysSinceContact({ ...contact, last_interaction_at: interactions[0]?.happened_at ?? null }, today);

  const infoRows: { icon: LucideIcon; text: string; copy?: boolean }[] = [];
  if (contact.club) infoRows.push({ icon: Shirt, text: contact.club });
  if (contact.phone) infoRows.push({ icon: Phone, text: contact.phone, copy: true });
  if (contact.email) infoRows.push({ icon: Mail, text: contact.email, copy: true });

  return (
    <div className="screen screen--wide">
      <ScreenHeader
        eyebrow={[contact.role || 'Rôle non précisé', segmentLabel(contact.segment)].filter(Boolean).join(' · ')}
        title={contact.name || 'Sans nom'}
        action={
          <div className="header-actions">
            {days >= FOLLOW_UP_DAYS && <Badge label={`À relancer · ${days} j`} color="var(--color-warning)" />}
            <TextAction label="Modifier" icon={Pencil} onClick={() => navigate(`/agency/contacts/${contact.id}/edit`)} />
            <TextAction label="Supprimer" icon={Trash2} onClick={confirmDelete} />
            <GradientButton
              label="Compte-rendu"
              icon={Sparkles}
              onClick={() => navigate(`/agency/meeting-report?contact=${contact.id}`)}
            />
          </div>
        }
      />
      <ErrorBanner message={writeError ?? error} />

      {/* Fiche : cartes roses (Contacts), rappels en menthe (DECISIONS.md §29). */}
      <div className="columns">
        <div className="columns__main">
          {(infoRows.length > 0 || contact.notes) && (
            <CategoryCard category="contacts" icon={UserRound} title="Infos">
              <CardList>
                {infoRows.map((r) => (
                  <ListRow
                    key={r.text}
                    title={r.text}
                    left={<r.icon size={18} className="tint-icon" />}
                    right={r.copy ? <CopyButton text={r.text} /> : null}
                  />
                ))}
                {contact.notes ? <li className="row row--text">{contact.notes}</li> : null}
              </CardList>
            </CategoryCard>
          )}

          {contact.pipeline_stage && (
            <ProspectionCard
              contact={contact}
              stage={contact.pipeline_stage}
              autoTask={autoTask}
              today={today}
              onChangeStage={changeStage}
              onChangeFollowup={(d) => void run(() => updateContact(contact.id, { next_followup_date: d }))}
              onMarkAsActiveClient={() => markAsActiveClient(contact)}
            />
          )}

          <CategoryCard category="contacts" icon={MessagesSquare} title="Interactions" count={interactions.length}>
            <QuickAddInteraction
              today={today}
              onAdd={(type, summary, day) =>
                run(() =>
                  addInteraction({ contact_id: contact.id, type, summary, happened_at: atCurrentTime(day, today) })
                )
              }
            />
            {interactions.length > 0 ? (
              <CardList>
                {interactions.map((i) => {
                  const Icon = TYPE_ICONS[i.type] ?? MessageCircle;
                  return (
                    <ListRow
                      key={i.id}
                      title={i.summary || TYPE_LABELS[i.type] || i.type}
                      subtitle={`${TYPE_LABELS[i.type] ?? i.type} · ${formatDueLabel(toDateKey(new Date(i.happened_at)), today)}`}
                      left={<Icon size={18} className="tint-icon" />}
                      right={
                        <button
                          type="button"
                          className="icon-button row__hover-action"
                          onClick={() => confirmDeleteInteraction(i)}
                          aria-label="Supprimer l’interaction"
                          title="Supprimer l’interaction"
                        >
                          <Trash2 size={16} />
                        </button>
                      }
                    />
                  );
                })}
              </CardList>
            ) : (
              <CardNote>Aucune interaction enregistrée.</CardNote>
            )}
          </CategoryCard>
        </div>

        <div className="columns__side">
          <CategoryCard
            category="reminders"
            icon={AlarmClock}
            title="Rappels"
            count={reminders.length}
            action={
              <TextAction
                label="Rappel"
                icon={Plus}
                category="reminders"
                title="Nouveau rappel pour ce contact"
                onClick={() => navigate(`/reminders/new?contact=${contact.id}`)}
              />
            }
          >
            {reminders.length > 0 ? (
              <CardList>
                {reminders.map((r) => (
                  <ReminderRow
                    key={r.id}
                    reminder={r}
                    today={today}
                    day=""
                    onToggle={(rem) => void run(() => setReminderDone(rem, !rem.done))}
                  />
                ))}
              </CardList>
            ) : (
              <CardNote>Aucun rappel prévu.</CardNote>
            )}
          </CategoryCard>
        </div>
      </div>
      {dialog}
    </div>
  );
}

/** Copie un téléphone ou un e-mail (les liens tel:/mailto: ne s'ouvrent pas depuis la webview Tauri). */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <button type="button" className="row__side-action" onClick={copy} title={`Copier ${text}`}>
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {copied ? 'Copié' : 'Copier'}
    </button>
  );
}

/** Carte rose « Prospection » : étape (modifiable), montant potentiel, prochaine relance. */
function ProspectionCard({
  contact,
  stage,
  autoTask,
  today,
  onChangeStage,
  onChangeFollowup,
  onMarkAsActiveClient,
}: {
  contact: Contact;
  stage: PipelineStage;
  /** Relance automatique en cours (DECISIONS.md §32). */
  autoTask: AutoTask | null;
  today: DateKey;
  onChangeStage: (stage: PipelineStage) => void;
  onChangeFollowup: (date: DateKey | null) => void;
  onMarkAsActiveClient: () => void;
}) {
  const navigate = useNavigate();
  const followup = contact.next_followup_date;
  const since = contact.stage_changed_at
    ? `Depuis ${formatDueLabel(toDateKey(new Date(contact.stage_changed_at)), today).toLowerCase()}`
    : null;
  const StageIcon = STAGE_ICONS[stage];

  return (
    <CategoryCard
      category="contacts"
      icon={TrendingUp}
      title="Prospection"
      action={
        stage === 'signe' ? (
          <TextAction label="Client actif" icon={Check} category="contacts" onClick={onMarkAsActiveClient} />
        ) : undefined
      }
    >
      <CardList>
        <ListRow
          title={PIPELINE_STAGE_LABELS[stage]}
          subtitle={since}
          left={<StageIcon size={18} className="tint-icon" />}
          right={<StageSelect value={stage} onChange={onChangeStage} label="Changer l’étape" />}
        />
        <ListRow
          title={contact.pipeline_amount != null ? formatMoney(contact.pipeline_amount, 'EUR') : 'Montant non renseigné'}
          subtitle="Montant potentiel"
          left={<Banknote size={18} className="tint-icon" />}
          onClick={() => navigate(`/agency/contacts/${contact.id}/edit`)}
        />
        <ListRow
          title={followup ? formatDueLabel(followup, today) : 'Pas de relance prévue'}
          subtitle="Prochaine relance"
          left={<CalendarDays size={18} className="tint-icon" />}
          right={
            <span className="inline-field">
              {followup && followup < today && <Badge label="En retard" color="var(--color-warning)" />}
              {/* Remonté quand la date change ailleurs : le brouillon repart de la valeur enregistrée. */}
              <FollowupEditor key={followup ?? ''} value={followup} onSave={onChangeFollowup} />
            </span>
          }
        />
        {autoTask && (
          <ListRow
            title={autoTask.title}
            subtitle={autoTask.due_date ? `Tâche automatique · ${formatDueLabel(autoTask.due_date, today)}` : 'Tâche automatique'}
            left={<Repeat size={18} className="tint-icon" />}
            onClick={() => navigate('/tasks')}
          />
        )}
      </CardList>
      {autoTask && (
        <CardNote>
          Relances automatiques : un mail, appel ou deck enregistré ci-dessous (ou la tâche cochée) programme la
          suivante ; un RDV les arrête. Changer la date de relance déplace la tâche. Le recalcul se fait à la
          prochaine ouverture de l’app mobile.
        </CardNote>
      )}
      {stage === 'signe' && <CardNote>Deal signé : « Client actif » retire ce contact du pipeline.</CardNote>}
    </CategoryCard>
  );
}

/**
 * Date de prochaine relance : sélecteur natif + validation explicite (WebKit émet
 * un changement à chaque segment saisi au clavier).
 */
function FollowupEditor({ value, onSave }: { value: DateKey | null; onSave: (date: DateKey | null) => void }) {
  const [draft, setDraft] = useState(value ?? '');
  return (
    <>
      <input
        type="date"
        className="input input--compact"
        aria-label="Prochaine relance"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      {draft && draft !== (value ?? '') && (
        <button type="button" className="text-action" onClick={() => onSave(draft)}>
          Enregistrer
        </button>
      )}
      {value && (
        <button type="button" className="text-action" onClick={() => onSave(null)}>
          Retirer
        </button>
      )}
    </>
  );
}

/** Jour choisi + heure actuelle (aujourd'hui → maintenant). */
function atCurrentTime(day: DateKey, today: DateKey): string {
  if (day === today) return new Date().toISOString();
  const d = fromDateKey(day);
  const n = new Date();
  d.setHours(n.getHours(), n.getMinutes(), 0, 0);
  return d.toISOString();
}

function QuickAddInteraction({
  today,
  onAdd,
}: {
  today: DateKey;
  onAdd: (type: string, summary: string, day: DateKey) => Promise<boolean>;
}) {
  const [type, setType] = useState<string>('appel');
  const [summary, setSummary] = useState('');
  const [day, setDay] = useState<DateKey>('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const ok = await onAdd(type, summary.trim(), day || today);
    setBusy(false);
    // En cas d'échec, la saisie reste en place pour réessayer.
    if (ok) {
      setSummary('');
      setDay('');
    }
  };

  return (
    // Bloc de saisie blanc sur le fond rose de la carte Interactions.
    <form
      className="inset-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <ChipRow>
        {INTERACTION_TYPES.map((t) => (
          <Chip key={t} label={TYPE_LABELS[t]} selected={type === t} onClick={() => setType(t)} />
        ))}
      </ChipRow>
      <textarea
        className="input textarea"
        rows={2}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Résumé (ex. intéressé, rappeler après le match)"
        aria-label="Résumé de l’interaction"
        onKeyDown={(e) => {
          // ⌘↵ / Ctrl↵ : ajout sans quitter le clavier.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (!busy) void submit();
          }
        }}
      />
      <div className="inset-form__footer">
        <input
          type="date"
          className="input input--compact"
          value={day || today}
          onChange={(e) => setDay(e.target.value)}
          aria-label="Date de l’interaction"
          title={formatDueLabel(day || today, today)}
        />
        <button type="submit" className="button button--primary" disabled={busy}>
          Ajouter
        </button>
      </div>
    </form>
  );
}
