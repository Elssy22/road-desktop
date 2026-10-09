import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Boîte de dialogue modale, sur `<dialog>` natif ouvert par showModal() :
 * focus gardé dans la boîte, arrière-plan inerte, Échap géré par le navigateur.
 * Fermeture par Échap, clic à côté ou croix ; le focus revient à l'élément
 * qui avait ouvert la boîte.
 */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    // React ne pose pas l'attribut `autofocus` (il appelle focus() avant
    // showModal, qui le déplace ensuite) : le champ ou bouton initial porte data-autofocus.
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      // Échap : on ferme via l'état React plutôt que de laisser le navigateur le faire seul.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // La boîte occupe toute la fenêtre : un clic qui l'atteint directement est un clic à côté de la carte.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog">
        <div className="dialog__header">
          <h2 className="dialog__title">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Action destructive : bouton rouge, et focus initial sur « Annuler » (Entrée ne détruit rien). */
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
        <button
          type="button"
          className="button button--ghost"
          data-autofocus={options.danger || undefined}
          onClick={close}
        >
          {options.cancelLabel ?? 'Annuler'}
        </button>
        <button
          type="button"
          className={options.danger ? 'button button--danger' : 'button button--primary'}
          data-autofocus={!options.danger || undefined}
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
