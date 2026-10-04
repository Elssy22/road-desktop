import type { ContactWithLast } from '../data/crm';
import { daysBetween, toDateKey, type DateKey } from './dates';

/** Au-delà de ce nombre de jours sans interaction, le contact est « à relancer ». */
export const FOLLOW_UP_DAYS = 45;

/**
 * Jours écoulés depuis le dernier échange. Sans aucune interaction, on compte
 * depuis la création du contact : un contact ajouté hier n'est pas à relancer,
 * un contact jamais appelé depuis deux mois l'est.
 */
export function daysSinceContact(c: ContactWithLast, today: DateKey): number {
  const ref = c.last_interaction_at ?? c.created_at;
  return daysBetween(toDateKey(new Date(ref)), today);
}

export const needsFollowUp = (c: ContactWithLast, today: DateKey) => daysSinceContact(c, today) >= FOLLOW_UP_DAYS;
