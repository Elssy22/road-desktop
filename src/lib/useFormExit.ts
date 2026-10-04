import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Sortie d'un formulaire (Annuler, Enregistrer, Supprimer) : retour à l'écran
 * d'origine, sans laisser le formulaire dans l'historique (sinon Retour le
 * rouvre). Formulaire ouvert sans historique (rechargement) : `fallback`, à la
 * place du formulaire.
 */
export function useFormExit(fallback: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return () => (location.key === 'default' ? navigate(fallback, { replace: true }) : navigate(-1));
}
