// Recherche texte simple côté client : insensible à la casse et aux accents
// ("ete" trouve "Été"), tous les mots de la requête doivent apparaître.

export const normalizeForSearch = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Prédicat réutilisable sur une liste ; requête vide = tout passe. */
export function makeMatcher(query: string): (...fields: string[]) => boolean {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return () => true;
  return (...fields) => {
    const haystack = normalizeForSearch(fields.join('\n'));
    return words.every((w) => haystack.includes(w));
  };
}
