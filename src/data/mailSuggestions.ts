import { supabase } from '../lib/supabase';
import { fetchAll, notifyDataChanged, unwrap } from './base';
import { contactNames } from './crm';
import { projectTitles } from './projects';

// Suggestions de tâche / date clé tirées de la boîte mail par l'Edge Function
// `mail-suggestions` (migration 017). Table hors sync mobile, lue en ligne comme
// qonto_items : la fonction seule y crée des lignes, l'app ne fait que les
// accepter (elle crée alors elle-même la tâche ou la date clé) ou les refuser.
// `reviewed_at` est posé par trigger au changement de statut : l'app n'a pas le
// droit d'écrire cette colonne.

export type SuggestionKind = 'task' | 'key_date';

export type MailSuggestion = {
  id: string;
  user_id: string;
  /** contacts.id (sans FK) : expéditeur reconnu. */
  contact_id: string | null;
  /** projects.id (sans FK), facultatif. */
  project_id: string | null;
  email_uid: number;
  email_date: string | null;
  email_subject: string;
  email_from: string;
  /** 300 caractères max, citations retirées. */
  email_snippet: string;
  suggested_kind: SuggestionKind;
  suggested_title: string;
  /** Jour YYYY-MM-DD ; toujours renseigné pour une date clé. */
  suggested_due_date: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  reviewed_at: string | null;
};

/** Suggestion + nom du contact et titre du projet liés (null si aucun ou supprimé). */
export type MailSuggestionWithLinks = MailSuggestion & { contact_name: string | null; project_title: string | null };

const MAIL_SUGGESTIONS = 'mail_suggestions';

/** Message quand la suggestion a déjà été traitée ailleurs (mobile, autre fenêtre). */
const ALREADY_REVIEWED = 'Cette suggestion a déjà été traitée entre-temps : rien n’a été créé.';

/** Suggestions en attente, plus récentes d'abord. */
export async function listPendingSuggestions(): Promise<MailSuggestionWithLinks[]> {
  const rows = await fetchAll<MailSuggestion>((from, to) =>
    supabase
      .from(MAIL_SUGGESTIONS)
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
  );
  const [names, titles] = await Promise.all([
    contactNames(rows.flatMap((r) => (r.contact_id ? [r.contact_id] : []))),
    projectTitles(rows.flatMap((r) => (r.project_id ? [r.project_id] : []))),
  ]);
  return rows.map((r) => ({
    ...r,
    contact_name: (r.contact_id && names.get(r.contact_id)) || null,
    project_title: (r.project_id && titles.get(r.project_id)) || null,
  }));
}

/** Nombre de suggestions en attente (badge de la barre latérale). */
export async function countPendingSuggestions(): Promise<number> {
  const { count, error } = await supabase
    .from(MAIL_SUGGESTIONS)
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Passe une suggestion encore en attente au statut `status` ; lève ALREADY_REVIEWED sinon. */
async function review(id: string, status: 'accepted' | 'rejected') {
  const rows = unwrap(
    await supabase.from(MAIL_SUGGESTIONS).update({ status }).eq('id', id).eq('status', 'pending').select('id')
  );
  notifyDataChanged();
  if (rows.length === 0) throw new Error(ALREADY_REVIEWED);
}

/** Ignore la suggestion : seul son statut change. */
export const rejectSuggestion = (s: MailSuggestion) => review(s.id, 'rejected');

/**
 * Crée la tâche ou la date clé suggérée, puis marque la suggestion acceptée.
 * La ligne créée reprend l'`id` de la suggestion : un second clic, une nouvelle
 * tentative après une coupure ou une autre fenêtre ne peuvent pas créer de
 * doublon (conflit de clé primaire, traité comme « déjà créée »). Les liens
 * vers un contact ou un projet supprimé (nom introuvable) sont laissés de côté.
 */
export async function acceptSuggestion(s: MailSuggestionWithLinks) {
  // Déjà ignorée ailleurs : on ne crée rien.
  const current = unwrap(
    await supabase.from(MAIL_SUGGESTIONS).select('status').eq('id', s.id).maybeSingle()
  ) as { status: MailSuggestion['status'] } | null;
  if (current?.status !== 'pending') {
    notifyDataChanged();
    throw new Error(ALREADY_REVIEWED);
  }

  const contactId = s.contact_name ? s.contact_id : null;
  const ts = new Date().toISOString();
  const base = { id: s.id, created_at: ts, updated_at: ts };
  const { error } =
    s.suggested_kind === 'task'
      ? await supabase.from('tasks').insert({
          ...base,
          title: s.suggested_title,
          done: false,
          due_date: s.suggested_due_date,
          priority: 0,
          project_id: s.project_title ? s.project_id : null,
          contact_id: contactId,
        })
      : await supabase.from('key_dates').insert({
          ...base,
          title: s.suggested_title,
          // Garanti par la contrainte mail_suggestions_key_date_has_date.
          date: s.suggested_due_date,
          category: 'autre',
          contact_id: contactId,
          notes: mailNote(s),
          recurrence: null,
          recurrence_day: null,
        });
  // 23505 : ligne déjà créée par une tentative précédente.
  if (error && error.code !== '23505') throw new Error(error.message);

  await review(s.id, 'accepted');
}

/** Note de la date clé : d'où vient la suggestion (key_dates n'a pas de lien projet). */
function mailNote(s: MailSuggestionWithLinks): string {
  const lines = [`Suggéré depuis le mail de ${s.email_from || 'expéditeur inconnu'} : « ${s.email_subject} »`];
  if (s.project_title) lines.push(`Projet : ${s.project_title}`);
  return lines.join('\n');
}
