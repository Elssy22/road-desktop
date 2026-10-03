import { addDays, type DateKey } from './dates';

// Relances CRM automatiques (DECISIONS.md §32), modèle métier du tableau de bord
// web regista-dashboard (lib/crm/followups.ts) adapté à Road :
// - prospect entré en « À démarcher » : tâche « Envoyer le deck » à J+2 ;
// - premier mail / appel / deck enregistré = début de la séquence : relance 1 à
//   J+5, relance 2 à J+10, relance 3 à J+20, puis proposition de passer en
//   « Perdu » à J+30 (10 jours après la 3e relance) ;
// - un mail / appel / deck enregistré ensuite, ou la tâche de relance cochée,
//   = relance faite : la suivante se programme (au moins 3 jours après le
//   dernier contact en cas de retard) ;
// - un rendez-vous (agenda ou interaction « RDV ») = le prospect a répondu,
//   la séquence s'arrête ;
// - Signé, Perdu ou sorti du pipeline : les tâches automatiques ouvertes sont retirées ;
// - tâche automatique supprimée à la main = étape sautée, jamais recréée ;
// - « Prochaine relance » modifiée sur la fiche = la relance en cours suit.
//
// Fonction pure, sans accès base ni fuseau : les jours sont déjà des DateKey
// locales. src/db/crmFollowupsDb.ts lit les données, appelle
// planFollowups() et applique les actions.

export const AUTO_KINDS = ['deck', 'relance_1', 'relance_2', 'relance_3', 'perdu'] as const;
export type AutoKind = (typeof AUTO_KINDS)[number];

export const isAutoKind = (s: string | null): s is AutoKind =>
  s !== null && (AUTO_KINDS as readonly string[]).includes(s);

export type PlannerContact = {
  name: string;
  pipeline_stage: string | null;
  next_followup_date: DateKey | null;
  created_day: DateKey;
  /** Jour du dernier changement d'étape (null si jamais renseigné). */
  stage_changed_day: DateKey | null;
  /** Instant ISO de la dernière modification (arbitre fiche ↔ tâche pour la date de relance). */
  updated_at: string;
};

/** Interaction (type libre : mail, appel, deck, rdv…) ou rendez-vous de l'agenda (type « rdv »). */
export type PlannerEvent = { type: string; day: DateKey; created_at: string };

/** Tâche automatique du contact, y compris supprimée (tombstone = étape sautée). */
export type PlannerTask = {
  id: string;
  auto_kind: AutoKind;
  title: string;
  done: boolean;
  deleted: boolean;
  due_date: DateKey | null;
  updated_at: string;
  /** Jour de la dernière modification : jour où la tâche a été cochée si elle est faite. */
  updated_day: DateKey;
};

export type PlanAction =
  | { kind: 'insert'; autoKind: AutoKind; title: string; dueDate: DateKey }
  | { kind: 'complete'; taskId: string }
  | { kind: 'retitle'; taskId: string; title: string }
  | { kind: 'reschedule'; taskId: string; dueDate: DateKey }
  /** Retrait par l'automatisation (≠ suppression à la main, qui saute l'étape). */
  | { kind: 'remove'; taskId: string }
  | { kind: 'setFollowup'; date: DateKey | null };

export const DECK_DELAY_DAYS = 2;
const STEP_OFFSETS_DAYS = { 1: 5, 2: 10, 3: 20, 4: 30 } as const;
const MIN_GAP_AFTER_CONTACT_DAYS = 3;
/** Types d'interaction qui comptent comme un contact (l'app propose mail, appel, deck). */
const CONTACT_TYPES = ['mail', 'appel', 'deck'];
const MEETING_TYPE = 'rdv';
const RELANCE_KINDS = ['relance_1', 'relance_2', 'relance_3'] as const;

export function autoTaskTitle(kind: AutoKind, name: string): string {
  const who = name.trim() || 'ce prospect';
  switch (kind) {
    case 'deck':
      return `Envoyer le deck à ${who}`;
    case 'relance_1':
      return `Relance 1 : mail de suivi à ${who}`;
    case 'relance_2':
      return `Relance 2 : appeler ${who} (ou envoyer un contenu utile)`;
    case 'relance_3':
      return `Relance 3 : point de clarification avec ${who}`;
    case 'perdu':
      return `Sans réponse après 3 relances : passer ${who} en perdu ?`;
  }
}

const maxDay = (...days: DateKey[]): DateKey => days.reduce((max, d) => (d > max ? d : max));

const isOpen = (t: PlannerTask | undefined): t is PlannerTask => !!t && !t.deleted && !t.done;
const isDone = (t: PlannerTask | undefined): t is PlannerTask => !!t && !t.deleted && t.done;
/** Étape passée : cochée, ou supprimée à la main (sautée). Pas de type guard : sa
 *  négation ne prouve pas l'absence de tâche (elle peut être ouverte). */
const isPassed = (t: PlannerTask | undefined): boolean => !!t && (t.deleted || t.done);

export function planFollowups(
  contact: PlannerContact,
  events: PlannerEvent[],
  tasks: PlannerTask[],
  today: DateKey
): PlanAction[] {
  const actions: PlanAction[] = [];
  const byKind = new Map(tasks.map((t) => [t.auto_kind, t]));
  const followup = contact.next_followup_date;
  const stage = contact.pipeline_stage;

  /** Retire les tâches ouvertes ; la date de relance s'efface si c'était celle d'une tâche retirée. */
  const removeOpen = (list: PlannerTask[]) => {
    const removed = list.filter(isOpen);
    for (const t of removed) actions.push({ kind: 'remove', taskId: t.id });
    if (followup !== null && removed.some((t) => t.due_date === followup)) {
      actions.push({ kind: 'setFollowup', date: null });
    }
  };

  // Prospect clos ou contact hors pipeline : plus rien à relancer. Une date de
  // relance saisie à la main (différente des tâches retirées) est conservée.
  if (stage === null || stage === 'signe' || stage === 'perdu') {
    removeOpen(tasks);
    return actions;
  }

  // Nom modifié : les tâches ouvertes reprennent le nouveau nom.
  for (const t of tasks) {
    const expected = autoTaskTitle(t.auto_kind, contact.name);
    if (isOpen(t) && t.title !== expected) actions.push({ kind: 'retitle', taskId: t.id, title: expected });
  }

  const sorted = [...events].sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at));
  const contacts = sorted.filter((e) => CONTACT_TYPES.includes(e.type));
  const firstContact = contacts[0];

  // 1. « Envoyer le deck » : à l'entrée en « À démarcher » (création ou changement
  // d'étape), cochée dès qu'un premier contact est enregistré ou que l'étape avance.
  const deckTask = byKind.get('deck');
  if (firstContact || stage !== 'a_demarcher') {
    if (isOpen(deckTask)) actions.push({ kind: 'complete', taskId: deckTask.id });
  } else if (!deckTask) {
    const entryDay = maxDay(contact.created_day, contact.stage_changed_day ?? contact.created_day);
    actions.push({
      kind: 'insert',
      autoKind: 'deck',
      title: autoTaskTitle('deck', contact.name),
      dueDate: addDays(entryDay, DECK_DELAY_DAYS),
    });
  }

  // 2. Début de la séquence : premier contact enregistré ; à défaut, la tâche
  // deck cochée (le jour où elle l'a été), ou le passage à « Deck envoyé »
  // (toujours ce jour-là : cocher le deck n'est plus possible une fois retiré).
  const start =
    firstContact?.day ??
    (isDone(deckTask) ? deckTask.updated_day : null) ??
    (stage === 'deck_envoye' ? contact.stage_changed_day : null);
  if (!start) return actions;

  const relanceTasks = tasks.filter((t) => t.auto_kind !== 'deck');

  // 3. Rendez-vous après le début = le prospect a répondu : fin de la séquence.
  if (sorted.some((e) => e.type === MEETING_TYPE && e.day >= start)) {
    removeOpen(relanceTasks);
    return actions;
  }

  // 4. Relances faites : contacts enregistrés après le premier, ou tâches de
  // relance cochées ou sautées (la plus avancée fait foi).
  const contactsAfter = firstContact ? contacts.slice(1) : [];
  let passedByTasks = 0;
  RELANCE_KINDS.forEach((kind, index) => {
    if (isPassed(byKind.get(kind))) passedByTasks = index + 1;
  });
  const completed = Math.min(3, Math.max(contactsAfter.length, passedByTasks));

  // Une étape sautée n'est pas un contact : seules les tâches cochées datent le dernier contact.
  const lastContact = maxDay(
    start,
    ...contactsAfter.map((e) => e.day),
    ...RELANCE_KINDS.map((k) => byKind.get(k))
      .filter(isDone)
      .map((t) => t.updated_day)
  );

  // Relances passées : leurs tâches encore ouvertes se cochent.
  RELANCE_KINDS.slice(0, completed).forEach((kind) => {
    const t = byKind.get(kind);
    if (isOpen(t)) actions.push({ kind: 'complete', taskId: t.id });
  });

  const step = (completed + 1) as 1 | 2 | 3 | 4;
  const kind: AutoKind = step === 4 ? 'perdu' : RELANCE_KINDS[step - 1];
  const dueDate = maxDay(addDays(start, STEP_OFFSETS_DAYS[step]), addDays(lastContact, MIN_GAP_AFTER_CONTACT_DAYS));
  const current = byKind.get(kind);

  // Proposition « perdu » écartée (cochée ou supprimée) : la séquence est terminée.
  if (current && isPassed(current)) {
    if (followup !== null && followup === current.due_date) actions.push({ kind: 'setFollowup', date: null });
    return actions;
  }

  if (!current) {
    // Séquence qui démarre alors qu'une « Prochaine relance » a été choisie à la
    // main : cette date devient l'échéance de la première relance.
    const insertDue = relanceTasks.length === 0 && followup ? followup : dueDate;
    actions.push({ kind: 'insert', autoKind: kind, title: autoTaskTitle(kind, contact.name), dueDate: insertDue });
    if (followup !== insertDue) actions.push({ kind: 'setFollowup', date: insertDue });
    return actions;
  }

  // Tâche en cours : elle garde son échéance (elle a pu être déplacée à la main),
  // et la fiche et la tâche se suivent. Si elles divergent, la dernière modifiée
  // gagne : date changée sur la fiche → la tâche suit ; échéance de la tâche
  // changée dans Tâches → la fiche suit.
  if (current.due_date !== null && followup !== current.due_date) {
    if (followup !== null && contact.updated_at > current.updated_at) {
      actions.push({ kind: 'reschedule', taskId: current.id, dueDate: followup });
    } else {
      actions.push({ kind: 'setFollowup', date: current.due_date });
    }
  } else if (current.due_date === null && followup !== null) {
    actions.push({ kind: 'reschedule', taskId: current.id, dueDate: followup });
  }

  return actions;
}
