// Relances CRM automatiques (DECISIONS.md §32). La séquence elle-même (deck à J+2,
// relances à J+5 / J+10 / J+20, « Perdu » à J+30) est planifiée par l'app mobile
// (lib/crmFollowups.ts, planFollowups) : le desktop ne crée ni ne reprogramme
// aucune tâche automatique. Il n'a besoin que des étapes et de leurs titres, pour
// écrire des tâches identiques à celles du mobile (cf. data/crm.ts, import).

export const AUTO_KINDS = ['deck', 'relance_1', 'relance_2', 'relance_3', 'perdu'] as const;
export type AutoKind = (typeof AUTO_KINDS)[number];

export function autoTaskTitle(kind: AutoKind, name: string): string {
  const who = name.trim() || 'ce prospect';
  switch (kind) {
    case 'deck':
      return `Envoyer le deck à ${who}`;
    case 'relance_1':
      return `Relance 1 : mail de suivi à ${who}`;
    case 'relance_2':
      return `Relance 2 : appeler ${who} (ou envoyer un contenu utile)`;
    case 'relance_3':
      return `Relance 3 : point de clarification avec ${who}`;
    case 'perdu':
      return `Sans réponse après 3 relances : passer ${who} en perdu ?`;
  }
}
