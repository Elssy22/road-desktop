import type { SQLiteDatabase } from 'expo-sqlite';

import { fromSqlRow, getRow, insertRow, type BaseRow, type EntitySpec, type Fields } from './entityTable';

// Coffre documentaire (migration locale v10) : seules les métadonnées sont ici ;
// le fichier, chiffré côté client, est dans le bucket Storage `vault-documents`.

export type VaultDocument = BaseRow & {
  /** Titre saisi dans l'app : stocké EN CLAIR (le nom de fichier, lui, est chiffré). */
  title: string;
  /** Chemin dans le bucket : `<user_id>/<uuid>.bin`. */
  storage_path: string;
  contact_id: string | null;
  project_id: string | null;
};

export const DOCUMENTS: EntitySpec<VaultDocument> = {
  entity: 'documents',
  columns: { title: 'text', storage_path: 'text', contact_id: 'text', project_id: 'text' },
};

export type DocumentWithLinks = VaultDocument & { contact_name: string | null; project_title: string | null };

/** Plus récents d'abord ; les liens vers un contact/projet supprimé sont ignorés. */
export async function listDocuments(db: SQLiteDatabase, userId: string): Promise<DocumentWithLinks[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT d.*, c.name AS contact_name, p.title AS project_title
     FROM documents d
     LEFT JOIN contacts c ON c.id = d.contact_id AND c.deleted_at IS NULL
     LEFT JOIN projects p ON p.id = d.project_id AND p.deleted_at IS NULL
     WHERE d.user_id = ? AND d.deleted_at IS NULL
     ORDER BY d.created_at DESC`,
    userId
  );
  return rows.map((r) => ({
    ...fromSqlRow(DOCUMENTS, r),
    contact_name: (r.contact_name as string | null) ?? null,
    project_title: (r.project_title as string | null) ?? null,
  }));
}

export const getDocument = (db: SQLiteDatabase, id: string) => getRow(db, DOCUMENTS, id);

export const addDocument = (db: SQLiteDatabase, userId: string, fields: Fields<VaultDocument>) =>
  insertRow(db, DOCUMENTS, userId, fields);
