import { CheckCircle2, FileUp, TableProperties } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  CardNote,
  CategoryCard,
  ErrorBanner,
  GradientButton,
  ProgressBar,
  ScreenHeader,
  TextAction,
} from '../../components/ui';
import { notifyDataChanged } from '../../data/base';
import { addImportedContacts, listContactNameValues, PIPELINE_STAGE_LABELS, segmentLabel } from '../../data/crm';
import { errorMessage } from '../../lib/errors';
import {
  ACCEPTED_EXTENSIONS,
  mapTable,
  nameKey,
  readTable,
  type ImportedContact,
  type MappedTable,
} from '../../lib/contactImport';

/** Lignes insérées par requête : l'interface reste réactive et la progression avance. */
const BATCH_SIZE = 50;
const PREVIEW_ROWS = 10;

type Parsed = MappedTable & { fileName: string };
type Progress = { done: number; total: number };
type Result = { created: number; existing: number; duplicates: number };

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Import de contacts depuis un fichier CSV / XLSX (prospection : districts,
 * clubs…). Tout se passe dans l'app : lecture et mapping côté client, aperçu,
 * confirmation explicite, puis insertion par lots. Un contact dont le nom
 * existe déjà (ou apparaît deux fois dans le fichier) est ignoré.
 */
export function ContactImportScreen({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importing = progress !== null && result === null && error === null;

  const reset = () => {
    setParsed(null);
    setConfirmed(false);
    setProgress(null);
    setResult(null);
    setError(null);
  };

  const onPicked = async (file: File | undefined) => {
    if (!file) return;
    reset();
    try {
      setParsed({ ...mapTable(await readTable(file)), fileName: file.name });
    } catch (e) {
      setError(`Lecture de « ${file.name} » impossible : ${errorMessage(e)}`);
    }
  };

  const runImport = async (contacts: ImportedContact[]) => {
    setError(null);
    setProgress({ done: 0, total: contacts.length });
    let created = 0;
    try {
      const known = new Set((await listContactNameValues()).map(nameKey));
      const seen = new Set<string>();
      const fresh: ImportedContact[] = [];
      let existing = 0;
      let duplicates = 0;
      for (const c of contacts) {
        const key = nameKey(c.name);
        if (known.has(key)) existing++;
        else if (seen.has(key)) duplicates++;
        else {
          seen.add(key);
          fresh.push(c);
        }
      }
      const skipped = existing + duplicates;
      setProgress({ done: skipped, total: contacts.length });
      for (let i = 0; i < fresh.length; i += BATCH_SIZE) {
        const batch = fresh.slice(i, i + BATCH_SIZE);
        await addImportedContacts(userId, batch);
        created += batch.length;
        setProgress({ done: skipped + created, total: contacts.length });
      }
      setResult({ created, existing, duplicates });
    } catch (e) {
      const message = errorMessage(e);
      setError(
        created > 0
          ? `Import interrompu après ${plural(created, 'contact')} créé${created > 1 ? 's' : ''} : ${message}. Relance l’import : les contacts déjà créés seront ignorés.`
          : `Import impossible : ${message}`
      );
    } finally {
      notifyDataChanged();
    }
  };

  const total = parsed?.contacts.length ?? 0;

  return (
    <div className="screen">
      <ScreenHeader
        eyebrow="Contacts"
        title="Importer un fichier"
        action={
          !importing && (
            <GradientButton
              label={parsed ? 'Choisir un autre fichier' : 'Choisir un fichier'}
              icon={FileUp}
              onClick={() => fileInput.current?.click()}
            />
          )
        }
      />
      <ErrorBanner message={error} />
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        hidden
        onChange={(e) => {
          void onPicked(e.target.files?.[0]);
          // Permet de rechoisir le même fichier (après correction, par exemple).
          e.target.value = '';
        }}
      />
      <div className="stack">
        {!parsed && (
          <CategoryCard category="contacts" icon={FileUp} title="Fichier de prospection">
            <CardNote>
              Formats acceptés : .csv (séparateur « ; » ou « , ») et .xlsx (première feuille). Le tableau doit avoir une
              ligne d’en-têtes, dont au moins « Nom ». Colonnes reconnues : Nom, Type, Niveau, Contact (nom, rôle), Mail
              ou page de contact, Téléphone, Statut, Localisation / Dépt, Adresse, Site officiel, Instagram, Spécificité
              / particularité historique, Groupe, N° affiliation. Les autres colonnes sont recopiées dans les notes.
            </CardNote>
            <CardNote>
              Le fichier est lu sur cet ordinateur ; rien n’est enregistré avant ta confirmation, après l’aperçu.
            </CardNote>
            <CardNote>
              Les contacts importés entrent dans le pipeline sans créer de relances automatiques : la séquence d’un
              prospect démarre au premier mail, appel ou deck enregistré sur sa fiche.
            </CardNote>
          </CategoryCard>
        )}

        {parsed && (
          <CategoryCard category="contacts" icon={TableProperties} title="Aperçu" count={total}>
            <CardNote>
              {parsed.fileName} : {plural(total, 'contact')} détecté{total > 1 ? 's' : ''}
              {total > PREVIEW_ROWS ? `, ${PREVIEW_ROWS} premiers affichés` : ''}.
              {parsed.skippedNoName > 0 &&
                ` ${plural(parsed.skippedNoName, 'ligne')} sans nom écartée${parsed.skippedNoName > 1 ? 's' : ''}.`}
            </CardNote>
            {parsed.extra.length > 0 && (
              <CardNote>Colonnes non reconnues, recopiées dans les notes : {parsed.extra.join(', ')}.</CardNote>
            )}
            {total > 0 && <PreviewTable contacts={parsed.contacts.slice(0, PREVIEW_ROWS)} />}
          </CategoryCard>
        )}

        {parsed && total > 0 && !result && (
          <>
            <label className="toggle">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={importing}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Je confirme vouloir importer ces {plural(total, 'contact')}
            </label>
            <button
              type="button"
              className="button button--primary"
              disabled={!confirmed || importing}
              onClick={() => void runImport(parsed.contacts)}
            >
              {importing ? 'Import en cours…' : `Importer (${total})`}
            </button>
          </>
        )}

        {progress && !result && (
          <div className="import-progress">
            <ProgressBar value={(progress.done / Math.max(1, progress.total)) * 100} label="Progression de l’import" />
            <CardNote>
              {progress.done} / {progress.total}
            </CardNote>
          </div>
        )}

        {result && (
          <CategoryCard category="contacts" icon={CheckCircle2} title="Import terminé">
            <CardNote>
              {result.created} créé{result.created > 1 ? 's' : ''}, {result.existing} ignoré
              {result.existing > 1 ? 's' : ''} (déjà existant{result.existing > 1 ? 's' : ''})
              {result.duplicates > 0 && `, ${result.duplicates} en double dans le fichier`}.
            </CardNote>
            <div className="header-actions">
              <TextAction label="Voir le pipeline" category="contacts" onClick={() => navigate('/agency/pipeline')} />
              <TextAction label="Voir les contacts" category="contacts" onClick={() => navigate('/agency/contacts')} />
              <TextAction label="Importer un autre fichier" category="contacts" onClick={reset} />
            </div>
          </CategoryCard>
        )}
      </div>
    </div>
  );
}

function PreviewTable({ contacts }: { contacts: ImportedContact[] }) {
  return (
    <div className="import-preview">
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Segment</th>
            <th>Étape</th>
            <th>Mail</th>
            <th>Téléphone</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c, i) => (
            <tr key={i}>
              <td>{c.name}</td>
              <td>{segmentLabel(c.segment) ?? '—'}</td>
              <td>{c.pipeline_stage ? PIPELINE_STAGE_LABELS[c.pipeline_stage] : '—'}</td>
              <td>{c.email ?? '—'}</td>
              <td>{c.phone ?? '—'}</td>
              <td className="import-preview__notes">{c.notes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
