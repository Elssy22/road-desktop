// Veille BOAMP. L'app n'appelle jamais l'API BOAMP : elle déclenche l'Edge
// Function `boamp-sync`, qui ajoute les avis dans tender_offers ; la sync
// offline-first les ramène ensuite dans SQLite (cf. DECISIONS.md §33).
// Les réglages (mots-clés) sont lus et écrits en ligne, comme Qonto.
import { FunctionsHttpError } from '@supabase/supabase-js';

import type { TenderOffer, TenderStatus } from '../db/tenderOffersDb';
import { daysBetween, formatDueLabel, toDateKey, type DateKey } from './dates';
import { supabase } from './supabase';

export type VeilleSettings = {
  sport_keywords: string[];
  activity_keywords: string[];
  last_run_at: string | null;
  last_run_status: 'ok' | 'erreur' | null;
  last_run_message: string | null;
};

export type KeywordList = 'sport_keywords' | 'activity_keywords';

export type BoampSyncResult = {
  /** Avis nouveaux pour l'utilisateur. */
  added: number;
  /** Avis trouvés (dont ceux déjà connus). */
  found: number;
  /** Premier jour de parution lu (YYYY-MM-DD). */
  since: string;
  synced_at: string;
};

/** Mêmes plafonds que la fonction et la contrainte SQL. */
export const MAX_KEYWORDS = 30;
export const MAX_KEYWORD_LENGTH = 60;

/** Date limite à moins de 7 jours : badge « Urgent ». */
export const URGENT_DAYS = 7;

const SETTINGS_COLUMNS = 'sport_keywords, activity_keywords, last_run_at, last_run_status, last_run_message';

/**
 * Réglages de l'utilisateur, créés avec les valeurs par défaut (définies dans
 * la migration 015) s'ils n'existent pas encore. Nécessite le réseau.
 */
export async function fetchVeilleSettings(userId: string): Promise<VeilleSettings> {
  const { error: initError } = await supabase
    .from('veille_settings')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (initError) throw new Error(initError.message);
  const { data, error } = await supabase
    .from('veille_settings')
    .select(SETTINGS_COLUMNS)
    .eq('user_id', userId)
    .single();
  if (error) throw new Error(error.message);
  return data as VeilleSettings;
}

/** Remplace une liste de mots-clés. Nécessite le réseau. */
export async function saveKeywords(userId: string, list: KeywordList, keywords: string[]): Promise<void> {
  const { error } = await supabase
    .from('veille_settings')
    .update({ [list]: keywords })
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

/**
 * Mot-clé saisi → forme enregistrée : espaces réduits, minuscules (la recherche
 * BOAMP ignore la casse), guillemets et antislash retirés (ils casseraient la requête).
 */
export function normalizeKeyword(input: string): string {
  return input
    .replace(/["\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fr-FR')
    .slice(0, MAX_KEYWORD_LENGTH);
}

/** Déclenche la recherche côté serveur. Lève une erreur lisible en cas d'échec. */
export async function syncBoamp(): Promise<BoampSyncResult> {
  const { data, error } = await supabase.functions.invoke<BoampSyncResult>('boamp-sync', { method: 'POST' });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      if (body?.error) throw new Error(body.error);
    }
    throw new Error(error.message || 'Synchronisation BOAMP impossible.');
  }
  if (!data) throw new Error('Réponse vide de la fonction boamp-sync.');
  return data;
}

/** Jours restants avant la date limite (0 le jour même, négatif une fois passée). */
export const daysLeft = (offer: Pick<TenderOffer, 'deadline_at'>, today: DateKey): number | null =>
  offer.deadline_at ? daysBetween(today, toDateKey(new Date(offer.deadline_at))) : null;

/** Urgent : date limite dans moins de URGENT_DAYS jours, pas encore passée. */
export function isUrgent(offer: Pick<TenderOffer, 'deadline_at' | 'status'>, today: DateKey): boolean {
  if (offer.status === 'ignore' || offer.status === 'candidate') return false;
  const days = daysLeft(offer, today);
  return days !== null && days >= 0 && days <= URGENT_DAYS;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** « Réponse avant Demain 12:00 », « Clôturé le lun. 6 oct. », « Pas de date limite ». */
export function deadlineLabel(offer: Pick<TenderOffer, 'deadline_at'>, today: DateKey): string {
  if (!offer.deadline_at) return 'Pas de date limite';
  const d = new Date(offer.deadline_at);
  const day = formatDueLabel(toDateKey(d), today);
  if (toDateKey(d) < today) return `Clôturé · ${day}`;
  return `Réponse avant ${day} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Avis à afficher pour un filtre : ouverts d'abord (date limite proche en tête), clôturés à la fin. */
export function offersFor(offers: TenderOffer[], status: TenderStatus, today: DateKey): TenderOffer[] {
  const selected = offers.filter((o) => o.status === status);
  const closed = (o: TenderOffer) => (daysLeft(o, today) ?? 0) < 0;
  // listTenderOffers trie déjà par date limite : on ne fait que repousser les clôturés.
  return [...selected.filter((o) => !closed(o)), ...selected.filter(closed)];
}
