import { FileLock, FilePlus, Lock, LockOpen } from 'lucide-react';
import { useCallback, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  CardList,
  CardNote,
  CategoryCard,
  ErrorBanner,
  FormField,
  GradientButton,
  ListRow,
  ScreenHeader,
  TextAction,
} from '../../components/ui';
import { ContactSelect } from '../../components/ContactSelect';
import { VaultPassphrasePanel } from '../../components/VaultPassphrasePanel';
import { listContacts, type ContactWithLast } from '../../data/crm';
import { addDocument, listDocuments, type DocumentWithLinks } from '../../data/documents';
import { listProjects, type ProjectWithProgress } from '../../data/projects';
import { useRemoteQuery } from '../../data/useRemoteQuery';
import { formatEditedLabel } from '../../lib/dates';
import { errorMessage } from '../../lib/errors';
import { useVaultLock } from '../../lib/useVaultLock';
import { encryptDocument } from '../../lib/vault';
import { checkFileSize, readPickedFile, uploadEncrypted } from '../../lib/vaultFiles';
import { useToday } from '../../lib/useToday';

type Lists = { documents: DocumentWithLinks[]; contacts: ContactWithLast[]; projects: ProjectWithProgress[] };
const EMPTY: Lists = { documents: [], contacts: [], projects: [] };

type Draft = { file: File; title: string; contact_id: string | null; project_id: string | null };
type Step = 'reading' | 'encrypting' | 'uploading';

const STEP_LABELS: Record<Step, string> = {
  reading: 'Lecture du fichier…',
  encrypting: 'Chiffrement…',
  uploading: 'Envoi du fichier chiffré…',
};

const loadLists = async (): Promise<Lists> => {
  const [documents, contacts, projects] = await Promise.all([listDocuments(), listContacts(), listProjects()]);
  return { documents, contacts, projects };
};

/**
 * Coffre : portage web de mobile-legacy/src/screens/agency/VaultScreen.tsx.
 * Liste des documents (titres en clair) et ajout d'un fichier, chiffré sur ce
 * Mac avant envoi : le serveur ne reçoit que des octets illisibles.
 * `?contact=<id>` ou `?project=<id>` (bouton « Ajouter » des fiches contact et
 * projet) : le document est lié d'office, puis retour à la fiche après l'envoi.
 */
export function VaultScreen({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const today = useToday();
  const [params] = useSearchParams();
  const presetContact = params.get('contact');
  const presetProject = params.get('project');
  const preset = presetContact || presetProject;
  const { data, error: loadError, loading } = useRemoteQuery(loadLists, EMPTY);
  // Un projet terminé reste proposé s'il est celui de la fiche d'où l'on vient.
  const projects = data.projects.filter((p) => p.status !== 'terminé' || p.id === presetProject);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { unlocked, markUnlocked, lock } = useVaultLock(userId, () => setDraft(null));

  const onPicked = useCallback(
    (file: File | undefined) => {
      setError(null);
      if (!file) return;
      const problem = checkFileSize(file.size);
      if (problem) {
        setError(problem);
        return;
      }
      setDraft({
        file,
        title: file.name.replace(/\.[^.]+$/, ''),
        contact_id: presetContact,
        project_id: presetProject,
      });
    },
    [presetContact, presetProject]
  );

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft || step) return;
    setError(null);
    try {
      setStep('reading');
      const bytes = await readPickedFile(draft.file);
      setStep('encrypting');
      const encrypted = await encryptDocument(userId, bytes, {
        name: draft.file.name,
        mime: draft.file.type || 'application/octet-stream',
      });
      setStep('uploading');
      const storage_path = await uploadEncrypted(userId, encrypted);
      // La ligne n'est écrite qu'une fois le fichier chiffré envoyé : jamais de document sans fichier.
      await addDocument({
        title: draft.title.trim() || draft.file.name,
        storage_path,
        contact_id: draft.contact_id,
        project_id: draft.project_id,
      });
      setDraft(null);
      if (preset) navigate(-1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStep(null);
    }
  };

  return (
    <div className="screen">
      <ScreenHeader
        eyebrow="Agence"
        title="Coffre"
        action={
          unlocked ? (
            <span className="header-actions">
              <TextAction label="Verrouiller" icon={LockOpen} onClick={lock} title="Verrouiller le coffre" />
              {!draft && <GradientButton label="Document" icon={FilePlus} onClick={() => fileInput.current?.click()} />}
            </span>
          ) : undefined
        }
      />
      <ErrorBanner message={loadError} />
      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={(e) => {
          onPicked(e.target.files?.[0]);
          // Permet de rechoisir le même fichier après une annulation.
          e.target.value = '';
        }}
      />
      <div className="stack">
        {/* Coffre : cartes menthe, comme sa carte du menu Agence (DECISIONS.md §29-30). */}
        {!unlocked ? (
          <VaultPassphrasePanel userId={userId} onUnlocked={markUnlocked} />
        ) : (
          draft && (
            <CategoryCard category="reminders" icon={FilePlus} title="Nouveau document">
              <form className="form" onSubmit={(e) => void send(e)}>
                <CardNote>
                  {draft.file.name} · {(draft.file.size / 1024).toFixed(0)} Ko
                </CardNote>
                <FormField label="Titre" htmlFor="vault-title">
                  <input
                    id="vault-title"
                    className="input"
                    value={draft.title}
                    onChange={(e) => setDraft((d) => d && { ...d, title: e.target.value })}
                    disabled={!!step}
                    autoFocus
                  />
                </FormField>
                <CardNote>Le titre est visible en clair sur le serveur ; le fichier et son nom sont chiffrés.</CardNote>
                <div className="form form--grid">
                  <FormField label="Contact (facultatif)" htmlFor="vault-contact">
                    <ContactSelect
                      id="vault-contact"
                      contacts={data.contacts}
                      value={draft.contact_id}
                      disabled={!!step}
                      removable={false}
                      onChange={(contact_id) => setDraft((d) => d && { ...d, contact_id })}
                    />
                  </FormField>
                  <FormField label="Projet (facultatif)" htmlFor="vault-project">
                    <select
                      id="vault-project"
                      className="select"
                      value={draft.project_id ?? ''}
                      disabled={!!step}
                      onChange={(e) => setDraft((d) => d && { ...d, project_id: e.target.value || null })}
                    >
                      <option value="">Aucun</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title || 'Sans titre'}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                {step ? (
                  <p className="loading-note">{STEP_LABELS[step]}</p>
                ) : (
                  <div className="form-actions form-actions--start">
                    <button type="submit" className="button button--primary">
                      Chiffrer et envoyer
                    </button>
                    <button type="button" className="button button--ghost" onClick={() => setDraft(null)}>
                      Annuler
                    </button>
                  </div>
                )}
              </form>
            </CategoryCard>
          )
        )}

        {/* Venu d'une fiche contact ou projet : lien déjà choisi, il ne reste que le fichier. */}
        {unlocked && !draft && preset && (
          <CategoryCard category="reminders" icon={FilePlus} title="Nouveau document">
            <CardNote>
              Sera lié à{' '}
              {presetContact
                ? (data.contacts.find((c) => c.id === presetContact)?.name ?? 'ce contact')
                : (projects.find((p) => p.id === presetProject)?.title ?? 'ce projet')}
              .
            </CardNote>
            <div className="form-actions form-actions--start">
              <button type="button" className="button button--primary" onClick={() => fileInput.current?.click()}>
                Choisir un fichier
              </button>
              <button type="button" className="button button--ghost" onClick={() => navigate(-1)}>
                Retour à la fiche
              </button>
            </div>
          </CategoryCard>
        )}

        <ErrorBanner message={error} />

        <CategoryCard
          category="reminders"
          icon={unlocked ? LockOpen : Lock}
          title="Documents"
          count={data.documents.length}
        >
          {data.documents.length > 0 ? (
            <CardList>
              {data.documents.map((d) => (
                <ListRow
                  key={d.id}
                  title={d.title || 'Sans titre'}
                  subtitle={[d.contact_name, d.project_title, formatEditedLabel(d.created_at, today)]
                    .filter(Boolean)
                    .join(' · ')}
                  left={<FileLock size={18} className="tint-icon" />}
                  onClick={() => navigate(`/agency/vault/${d.id}`)}
                />
              ))}
            </CardList>
          ) : loading ? null : (
            <CardNote>Aucun document dans le coffre.</CardNote>
          )}
        </CategoryCard>
      </div>
    </div>
  );
}
