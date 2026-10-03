import type { BaseRow } from './base';

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
