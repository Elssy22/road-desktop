// Tâches : type repris de mobile-legacy/src/db/localDb.ts.

/** 0 = normale, 1 = haute, 2 = urgente. */
export type TaskPriority = 0 | 1 | 2;

export type Task = {
  id: string;
  user_id: string;
  title: string;
  done: boolean;
  /** Jour d'échéance local, format YYYY-MM-DD (colonne `date` côté Postgres). */
  due_date: string | null;
  priority: TaskPriority;
  /** Projet de rattachement facultatif (Lot 2, migration Supabase 005). */
  project_id: string | null;
  /** Contact de rattachement (migration Supabase 014) ; seules les tâches automatiques en ont un. */
  contact_id: string | null;
  /** Étape de la séquence de relances CRM ; null = tâche manuelle (cf. lib/crmFollowups.ts). */
  auto_kind: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
