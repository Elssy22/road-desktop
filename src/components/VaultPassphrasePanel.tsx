import { KeyRound, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { getVaultConfig, passphraseProblem, resetVaultOnDevice, setupVault, unlockVault } from '../lib/vault';
import { useConfirm } from './Dialog';
import { FormField, Panel } from './ui';

/**
 * Création du coffre (première fois sur ce Mac) ou déverrouillage : portage web
 * de mobile-legacy/src/components/VaultPassphrasePanel.tsx. La phrase n'est
 * jamais stockée ni envoyée : seul un hash de vérification l'est, en local.
 */
export function VaultPassphrasePanel({ userId, onUnlocked }: { userId: string; onUnlocked: () => void }) {
  const { confirm, dialog } = useConfirm();
  const [configured, setConfigured] = useState(() => getVaultConfig(userId) != null);
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = configured ? null : passphraseProblem(passphrase, confirmation);
  const canSubmit = !busy && passphrase.length > 0 && (configured || (!problem && understood));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (configured) await unlockVault(userId, passphrase);
      else await setupVault(userId, passphrase);
      setPassphrase('');
      setConfirmation('');
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = () =>
    confirm({
      title: 'Saisir une autre phrase ?',
      message:
        'La phrase enregistrée sur ce Mac sera oubliée. Les documents déjà chiffrés ne seront lisibles qu’avec la phrase qui a servi à les chiffrer : il n’existe aucune récupération.',
      confirmLabel: 'Oublier sur ce Mac',
      danger: true,
      onConfirm: () => {
        resetVaultOnDevice(userId);
        setConfigured(false);
        setError(null);
      },
    });

  // Pas d'autocomplétion : la webview ne doit pas mémoriser la phrase secrète.
  const secretInput = {
    type: 'password',
    className: 'input',
    autoComplete: 'off',
    autoCapitalize: 'none',
    autoCorrect: 'off',
    spellCheck: false,
    disabled: busy,
  } as const;

  return (
    // Carte blanche, comme les écrans de connexion (DECISIONS.md §28, §30).
    <Panel className="panel-card--padded">
      <form className="form" onSubmit={(e) => void submit(e)}>
        <p className="vault-panel__title">
          {configured ? <Lock size={20} /> : <KeyRound size={20} />}
          {configured ? 'Coffre verrouillé' : 'Choisis ta phrase secrète'}
        </p>

        {!configured && (
          <div className="vault-warning">
            <p className="vault-warning__title">
              ⚠️ Si vous oubliez cette phrase, les documents chiffrés sont perdus définitivement, sans récupération
              possible.
            </p>
            <p className="dialog__message">
              Elle n’est envoyée nulle part et personne (ni l’app, ni Supabase) ne peut la retrouver. Note-la dans un
              gestionnaire de mots de passe. Si le coffre existe déjà sur ton téléphone, saisis exactement la même
              phrase.
            </p>
          </div>
        )}

        <FormField label="Phrase secrète" htmlFor="vault-passphrase">
          <input
            id="vault-passphrase"
            {...secretInput}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder={configured ? 'Phrase secrète' : '10 caractères min.'}
            autoFocus
          />
        </FormField>
        {!configured && (
          <>
            <FormField
              label="Confirmation"
              htmlFor="vault-confirmation"
              error={passphrase.length > 0 && problem ? problem : null}
            >
              <input
                id="vault-confirmation"
                {...secretInput}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="Confirme la phrase secrète"
              />
            </FormField>
            <label className="toggle">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              J’ai compris : sans cette phrase, mes documents seront irrécupérables.
            </label>
          </>
        )}

        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions form-actions--start">
          <button type="submit" className="button button--primary" disabled={!canSubmit}>
            {busy ? 'Calcul de la clé…' : configured ? 'Déverrouiller' : 'Créer le coffre'}
          </button>
          {configured && !busy && (
            <button type="button" className="button button--ghost" onClick={confirmReset}>
              Autre phrase, ou coffre créé sur un autre appareil ?
            </button>
          )}
        </div>
      </form>
      {dialog}
    </Panel>
  );
}
