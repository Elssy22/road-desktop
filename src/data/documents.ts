import { supabase } from '../lib/supabase';
import { fetchAll, insertRow, softDeleteRow, unwrap, type BaseRow, type Fields } from './base';
import { contactNames } from './crm';
import { projectTitles } from './projects';

// Coffre documentaire : type et requêtes repris de mobile-legacy/src/db/documentsDb.ts.
// Seules les métadonnées sont ici ; le fichier, chiffré côté client
// (src/lib/vault.ts), est dans le bucket Storage privé `vault-documents`.

export type VaultDocument = BaseRow & {
  /** Titre saisi dans l'app : stocké EN CLAIR (le nom de fichier, lui, est chiffré). */
  title: string;
  /** Chemin dans le bucket : `<user_id>/<uuid>.bin`. */
  storage_path: string;
  contact_id: string | null;
  project_id: string | null;
};

export type DocumentWithLinks = VaultDocument & { contact_name: string | null; project_title: string | null };

const DOCUMENTS = 'documents';

async function withLinks(rows: VaultDocument[]): Promise<DocumentWithLinks[]> {
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

/** Plus récents d'abord ; les liens vers un contact/projet supprimé sont ignorés. */
export async function listDocuments(): Promise<DocumentWithLinks[]> {
  const rows = await fetchAll<VaultDocument>((from, to) =>
    supabase
      .from(DOCUMENTS)
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
  );
  return withLinks(rows);
}

/** Documents liés à un contact ou à un projet, plus récents d'abord (fiches contact et projet). */
export async function listLinkedDocuments(kind: 'contact' | 'project', id: string): Promise<VaultDocument[]> {
  return fetchAll<VaultDocument>((from, to) =>
    supabase
      .from(DOCUMENTS)
      .select('*')
      .eq(kind === 'contact' ? 'contact_id' : 'project_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
  );
}

/** Document vivant avec ses liens, ou null s'il n'existe pas ou a été supprimé. */
export async function getDocument(id: string): Promise<DocumentWithLinks | null> {
  const doc = unwrap(
    await supabase.from(DOCUMENTS).select('*').eq('id', id).is('deleted_at', null).maybeSingle()
  ) as VaultDocument | null;
  return doc ? (await withLinks([doc]))[0] : null;
}

/** À n'appeler qu'une fois le fichier chiffré envoyé : jamais de ligne sans fichier. */
export const addDocument = (fields: Fields<VaultDocument>) => insertRow(DOCUMENTS, fields);

export const softDeleteDocument = (id: string) => softDeleteRow(DOCUMENTS, id);
