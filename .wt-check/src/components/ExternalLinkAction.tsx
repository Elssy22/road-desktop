import { ExternalLink } from 'lucide-react';

import { openExternal } from '../lib/openExternal';

/**
 * Lien vers une page web extérieure, ouvert dans le navigateur par défaut
 * (lib/openExternal.ts). Reste un vrai lien : URL visible au survol, focus clavier.
 */
export function ExternalLinkAction({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="text-action text-action--tinted"
      href={href}
      rel="noreferrer"
      onClick={(e) => {
        e.preventDefault();
        openExternal(href).catch((err: unknown) => console.error('Ouverture du lien impossible', err));
      }}
    >
      <ExternalLink size={16} />
      {label}
    </a>
  );
}
