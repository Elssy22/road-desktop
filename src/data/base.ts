// Couche données du desktop : accès direct à Supabase, sans cache local
// (DECISIONS.md §35). Pour l'instant, seuls les types des lignes et les
// constantes métier sont repris de mobile-legacy/src/db/ ; les requêtes
// Supabase arrivent avec les écrans (étape 2).

/** Colonnes communes à toutes les tables synchronisées. */
export type BaseRow = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** Champs modifiables par l'app. */
export type Fields<T extends BaseRow> = Omit<T, keyof BaseRow>;
