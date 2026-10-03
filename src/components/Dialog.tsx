import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

/** Boîte de dialogue modale : fond assombri, fermeture par Échap, clic à côté ou croix. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <h2 className="dialog__title">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Action destructive : bouton rouge. */
  danger?: boolean;
  onConfirm: () => void;
};

/**
 * Confirmation explicite (remplace Alert.alert du mobile ; les boîtes natives
 * window.confirm ne sont pas fiables dans la webview Tauri). `confirm(...)`
 * ouvre la boîte, `dialog` est à rendre dans l'écran.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const close = () => setOptions(null);

  const dialog = options && (
    <Dialog title={options.title} onClose={close}>
      {options.message ? <p className="dialog__message">{options.message}</p> : null}
      <div className="dialog__actions">
        <button type="button" className="button button--ghost" onClick={close}>
          {options.cancelLabel ?? 'Annuler'}
        </button>
        <button
          type="button"
          className={options.danger ? 'button button--danger' : 'button button--primary'}
          autoFocus
          onClick={() => {
            close();
            options.onConfirm();
          }}
        >
          {options.confirmLabel}
        </button>
      </div>
    </Dialog>
  );

  return { confirm: setOptions, dialog };
}
