import { Clock, Download, FileLock, GitBranch, LockOpen, User, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useConfirm } from '../../components/Dialog';
import { CardList, CardNote, CategoryCard, ErrorBanner, ListRow, ScreenHeader, TextAction } from '../../components/ui';
import { VaultPassphrasePanel } from '../../components/VaultPassphrasePanel';
import { getDocument, softDeleteDocument, type DocumentWithLinks } from '../../data/documents';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { formatEditedLabel } from '../../lib/dates';
import { errorMessage } from '../../lib/errors';
import { useVaultLock } from '../../lib/useVaultLock';
import { decryptDocument, type DocumentMeta } from '../../lib/vault';
import { canPreview, decryptedUrl, downloadEncrypted, removeEncrypted, saveDecrypted } from '../../lib/vaultFiles';
import { useToday } from '../../lib/useToday';

type Opened = { meta: DocumentMeta; url: string; size: number };

/**
 * Fiche d'un document (`/agency/vault/:id`) : portage web de
 * mobile-legacy/src/screens/agency/VaultDocumentScreen.tsx. Déchiffrement à la
 * demande, en mémoire (phrase redemandée si le coffre est verrouillé).
 */
export function VaultDocumentScreen({ userId }: { userId: string }) {
  const { id = '' } = useParams();
  // Changement de document : état (aperçu déchiffré compris) repart de zéro.
  return <VaultDocument key={id} id={id} userId={userId} />;
}

function VaultDocument({ id, userId }: { id: string; userId: string }) {
  const navigate = useNavigate();
  const today = useToday();
  const { confirm, dialog } = useConfirm();
  const load = useCallback(() => getDocument(id), [id]);
  const { data: doc, error: loadError, loading } = useRemoteQuery<DocumentWithLinks | null>(load, null);
  const [step, setStep] = useState<'downloading' | 'decrypting' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const { unlocked, markUnlocked, lock } = useVaultLock(userId, () => setOpened(null));

  // Le clair ne vit qu'en mémoire : l'URL blob est révoquée dès qu'elle n'est plus affichée.
  useEffect(() => () => {
    if (opened) URL.revokeObjectURL(opened.url);
  }, [opened]);

  const open = async () => {
    if (!doc || step) return;
    setError(null);
    try {
      setStep('downloading');
      const blob = await downloadEncrypted(doc.storage_path);
      setStep('decrypting');
      const { meta, bytes } = await decryptDocument(userId, blob);
      setOpened({ meta, url: decryptedUrl(meta, bytes), size: bytes.length });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStep(null);
    }
  };

  const confirmDelete = () => {
    if (!doc) return;
    confirm({
      title: 'Supprimer ce document ?',
      message: 'Le fichier chiffré sera supprimé du serveur.',
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () =>
        void softDeleteDocument(doc.id)
          .then(() => {
            void removeEncrypted(doc.storage_path);
            navigate('/agency/vault', { replace: true });
          })
          .catch((err: unknown) => setError(errorMessage(err))),
    });
  };

  const header = (
    <ScreenHeader
      eyebrow="Coffre"
      title={doc?.title || 'Document'}
      action={
        unlocked ? <TextAction label="Verrouiller" icon={LockOpen} onClick={lock} title="Verrouiller le coffre" /> : undefined
      }
    />
  );

  if (!doc) {
    return (
      <div className="screen">
        {header}
        <ErrorBanner message={loadError} />
        {!loading && !loadError && (
          <CategoryCard category="reminders" icon={FileLock} title="Document">
            <CardNote>Ce document n’existe plus (supprimé sur un autre appareil ?).</CardNote>
          </CategoryCard>
        )}
      </div>
    );
  }

  const infoRows = [
    doc.contact_name && { icon: User, text: doc.contact_name },
    doc.project_title && { icon: GitBranch, text: doc.project_title },
    { icon: Clock, text: `Ajouté ${formatEditedLabel(doc.created_at, today).toLowerCase()}` },
  ].filter((r): r is { icon: LucideIcon; text: string } => !!r);

  return (
    <div className="screen">
      {header}
      <ErrorBanner message={loadError} />
      <div className="stack">
        {/* Coffre : carte menthe, comme sa carte du menu Agence (DECISIONS.md §29-30). */}
        <CategoryCard category="reminders" icon={FileLock} title="Document">
          <CardList>
            {infoRows.map(({ icon: Icon, text }) => (
              <ListRow key={text} title={text} left={<Icon size={16} className="tint-icon" />} />
            ))}
          </CardList>
          <CardNote>
            Le document est déchiffré en mémoire sur ce Mac uniquement. Rien n’est écrit sur le disque, sauf si tu
            enregistres une copie ; l’aperçu disparaît en quittant la fiche ou en verrouillant le coffre.
          </CardNote>
        </CategoryCard>

        {!unlocked ? (
          <VaultPassphrasePanel userId={userId} onUnlocked={markUnlocked} />
        ) : step ? (
          <p className="loading-note">{step === 'downloading' ? 'Téléchargement…' : 'Déchiffrement…'}</p>
        ) : opened ? (
          <CategoryCard
            category="reminders"
            icon={LockOpen}
            title={opened.meta.name || 'Document déchiffré'}
            action={
              <TextAction
                label="Enregistrer une copie"
                icon={Download}
                category="reminders"
                title="Écrit une copie NON chiffrée sur ce Mac"
                onClick={() => saveDecrypted(opened.url, opened.meta)}
              />
            }
          >
            <CardNote>
              {opened.meta.mime || 'Type inconnu'} · {(opened.size / 1024).toFixed(0)} Ko
            </CardNote>
            {canPreview(opened.meta) ? (
              <img className="vault-preview" src={opened.url} alt={opened.meta.name} />
            ) : (
              <CardNote>
                Pas d’aperçu intégré pour ce type de fichier. « Enregistrer une copie » l’écrit en clair sur ce Mac pour
                l’ouvrir avec l’application habituelle : pense à supprimer la copie ensuite.
              </CardNote>
            )}
          </CategoryCard>
        ) : (
          <div className="form-actions form-actions--start">
            <button type="button" className="button button--primary" onClick={() => void open()}>
              Déchiffrer et afficher
            </button>
          </div>
        )}

        <ErrorBanner message={error} />

        <div className="form-actions">
          <button type="button" className="button button--danger" onClick={confirmDelete}>
            Supprimer le document
          </button>
        </div>
      </div>
      {dialog}
    </div>
  );
}
