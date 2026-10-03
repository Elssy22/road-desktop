import type { SQLiteDatabase } from 'expo-sqlite';

import { listRows, updateRow, type BaseRow, type EntitySpec } from './entityTable';

// Veille BOAMP (migration locale v15) : appels d'offres importés côté serveur
// par l'Edge Function boamp-sync, synchronisés comme les autres tables. L'app
// ne crée jamais d'avis : elle n'en change que le statut (DECISIONS.md §33).

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

export const TENDER_OFFERS: EntitySpec<TenderOffer> = {
  entity: 'tender_offers',
  columns: {
    source: 'text',
    external_id: 'text',
    buyer: 'text',
    title: 'text',
    categories: 'list',
    procedure: 'text',
    department: 'text',
    published_on: 'date',
    deadline_at: 'ts',
    url: 'text',
    status: 'text',
  },
};

/** Tous les avis, par date limite (les plus proches d'abord, sans date à la fin). */
export const listTenderOffers = (db: SQLiteDatabase, userId: string) =>
  listRows(db, TENDER_OFFERS, userId, 'deadline_at IS NULL, deadline_at, published_on DESC');

export const setTenderStatus = (db: SQLiteDatabase, offer: TenderOffer, status: TenderStatus) =>
  updateRow(db, TENDER_OFFERS, offer, { status });
