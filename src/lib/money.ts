// Affichage et saisie des montants (suivi financier).

/** "1 234,50 €" ; repli sur "1234.50 XYZ" si le code devise est inconnu. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return amount.toLocaleString('fr-FR', { style: 'currency', currency });
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Saisie libre ("1 200,5", "1200.50") → nombre positif, ou null si invalide. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Montant → texte éditable ("1200,5"). */
export const amountToInput = (amount: number) => String(amount).replace('.', ',');

/** Totaux par devise, dans l'ordre d'apparition. */
export function totalsByCurrency(items: { amount: number; currency: string }[]): [string, number][] {
  const totals = new Map<string, number>();
  for (const i of items) totals.set(i.currency, (totals.get(i.currency) ?? 0) + i.amount);
  // Arrondi au centime : évite 0.30000000000000004 dans l'affichage.
  return [...totals].map(([c, n]) => [c, Math.round(n * 100) / 100]);
}

/** "1 200 € · 300 $" */
export const formatTotals = (totals: [string, number][]) =>
  totals.map(([c, n]) => formatMoney(n, c)).join(' · ');
