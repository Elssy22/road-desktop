import { FileLock, FilePlus, Lock, LockOpen } from 'lucide-react';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { listLinkedDocuments, type VaultDocument } from '../data/documents';
import { useRemoteQuery } from '../data/useRemoteQuery';
import { formatEditedLabel } from '../lib/dates';
import { useToday } from '../lib/useToday';
import { useVaultLock } from '../lib/useVaultLock';
import { CardList, CardNote, CategoryCard, ErrorBanner, ListRow, TextAction } from './ui';

const NO_DOCUMENTS: VaultDocument[] = [];

/**
 * Carte « Documents » des fiches contact et projet : documents du Coffre liés
 * à la fiche. Coffre verrouillé : un message à la place de la liste, comme le
 * reste du Coffre (même état de session, cf. lib/useVaultLock.ts).
 * « Ajouter » ouvre le Coffre avec le lien déjà choisi (`?contact=` / `?project=`).
 */
export function LinkedDocumentsCard({ userId, kind, id }: { userId: string; kind: 'contact' | 'project'; id: string }) {
  const navigate = useNavigate();
  const today = useToday();
  const { unlocked } = useVaultLock(userId, () => {});
  const load = useCallback(() => listLinkedDocuments(kind, id), [kind, id]);
  const { data: documents, error, loading } = useRemoteQuery(load, NO_DOCUMENTS);

  return (
    // Coffre : carte menthe, comme sa carte du menu Agence (DECISIONS.md §29-30).
    <CategoryCard
      category="reminders"
      icon={unlocked ? LockOpen : Lock}
      title="Documents"
      count={unlocked ? documents.length : undefined}
      action={
        <TextAction
          label="Ajouter"
          icon={FilePlus}
          category="reminders"
          title="Chiffrer un document lié à cette fiche"
          onClick={() => navigate(`/agency/vault?${kind}=${id}`)}
        />
      }
    >
      {!unlocked ? (
        <CardNote>Déverrouille le Coffre pour voir les documents liés.</CardNote>
      ) : (
        <>
          <ErrorBanner message={error} />
          {documents.length > 0 ? (
            <CardList>
              {documents.map((d) => (
                <ListRow
                  key={d.id}
                  title={d.title || 'Sans titre'}
                  subtitle={formatEditedLabel(d.created_at, today)}
                  left={<FileLock size={18} className="tint-icon" />}
                  onClick={() => navigate(`/agency/vault/${d.id}`)}
                />
              ))}
            </CardList>
          ) : loading ? null : (
            <CardNote>Aucun document lié.</CardNote>
          )}
        </>
      )}
    </CategoryCard>
  );
}
