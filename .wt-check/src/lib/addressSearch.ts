/**
 * Recherche d'adresses via Nominatim (OpenStreetMap), gratuite et sans clé.
 *
 * Politique d'usage (https://operations.osmfoundation.org/policies/nominatim/) :
 * - 1 requête/seconde maximum → `MIN_INTERVAL_MS` entre deux appels ;
 * - User-Agent identifiant l'application (ignoré sur le web, où le navigateur
 *   l'impose et envoie le Referer) ;
 * - résultats mis en cache → cache mémoire par requête normalisée ;
 * - **pas d'autocomplétion côté client** : cette fonction ne doit être appelée
 *   que sur une action explicite de l'utilisateur, jamais à la frappe.
 * - attribution « © contributeurs OpenStreetMap » affichée avec les résultats.
 */

export type AddressSuggestion = { id: string; label: string };

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Road/1.0 (app personnelle de gestion d’agence, usage privé)';
const MIN_INTERVAL_MS = 1100;
const MIN_QUERY_LENGTH = 3;

const cache = new Map<string, AddressSuggestion[]>();
let lastRequestAt = 0;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    });
  });

export const canSearchAddress = (query: string) => query.trim().length >= MIN_QUERY_LENGTH;

/** Jusqu'à 5 adresses correspondant au texte. Rejette en cas d'erreur réseau ou d'annulation. */
export async function searchAddress(query: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
  const q = query.trim().replace(/\s+/g, ' ');
  if (q.length < MIN_QUERY_LENGTH) return [];
  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait, signal);
  lastRequestAt = Date.now();

  const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=fr`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data: unknown = await res.json();
  const results = (Array.isArray(data) ? data : [])
    .filter((r): r is { place_id: number | string; display_name: string } => typeof r?.display_name === 'string')
    .map((r) => ({ id: String(r.place_id), label: r.display_name }));
  cache.set(key, results);
  return results;
}
