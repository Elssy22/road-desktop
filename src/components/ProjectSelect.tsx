import type { Project } from '../data/projects';
import { LinkSelect } from './LinkSelect';

/**
 * Sélecteur « Projet lié » (notes). Un projet lié supprimé entre-temps
 * s'affiche « Projet supprimé » (cf. LinkSelect).
 */
export function ProjectSelect({
  projects,
  ...props
}: {
  id: string;
  projects: Pick<Project, 'id' | 'title'>[];
  value: string | null;
  onChange: (projectId: string | null) => void;
  disabled?: boolean;
  /** Bouton « Retirer » à côté de la liste. */
  removable?: boolean;
}) {
  return (
    <LinkSelect
      {...props}
      options={projects.map((p) => ({ id: p.id, label: p.title || 'Sans titre' }))}
      missingLabel="Projet supprimé"
    />
  );
}
