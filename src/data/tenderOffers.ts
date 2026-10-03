import { supabase } from '../lib/supabase';
import { fetchAll, updateRow, type BaseRow } from './base';

// Veille BOAMP : types et constantes repris de mobile-legacy/src/db/tenderOffersDb.ts.
// Avis importés côté serveur par l'Edge Function boamp-sync. L'app ne crée
// jamais d'avis : elle n'en change que le statut (DECISIONS.md §33).

export const TENDER_STATUSES = ['nouveau', 'interessant', 'ignore', 'candidate'] as const;
export type TenderStatus = (typeof TENDER_STATUSES)[number];

export const TENDER_STATUS_LABELS: Record<TenderStatus, string> = {
  nouveau: 'Nouveau',
  interessant: 'Intéressant',
  ignore: 'Ignoré',
  candidate: 'Candidature envoyée',
};

export type TenderOffer = BaseRow & {
  source: string;
  /** Identifiant de l'avis chez la source (idweb BOAMP). */
  external_id: string;
  buyer: string;
  title: string;
  /** Descripteurs officiels (« Publicité, Communication », « Événementiel »…). */
  categories: string[];
  procedure: string | null;
  department: string | null;
  /** Jour de parution YYYY-MM-DD. */
  published_on: string | null;
  /** Date limite de réponse (instant ISO). */
  deadline_at: string | null;
  url: string | null;
  status: TenderStatus;
};

const TENDER_OFFERS = 'tender_offers';

/** Tous les avis, par date limite (les plus proches d'abord, sans date à la fin). */
export async function listTenderOffers(): Promise<TenderOffer[]> {
  const rows = await fetchAll<TenderOffer>((from, to) =>
    supabase
      .from(TENDER_OFFERS)
      .select('*')
      .is('deleted_at', null)
      .order('deadline_at', { nullsFirst: false })
      .order('published_on', { ascending: false })
      .order('id')
      .range(from, to)
  );
  // text[] Postgres : déjà un tableau, sauf colonne nulle.
  return rows.map((r) => ({ ...r, categories: r.categories ?? [] }));
}

export const setTenderStatus = (id: string, status: TenderStatus) => updateRow(TENDER_OFFERS, id, { status });
