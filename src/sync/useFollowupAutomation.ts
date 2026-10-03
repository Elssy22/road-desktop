import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';

import { applyFollowupPlans, planAllFollowups } from '../db/crmFollowupsDb';
import { useToday } from '../lib/useToday';
import { useSync } from './SyncProvider';

// Un seul recalcul à la fois, même si plusieurs écrans montés le demandent
// (liste Contacts sous la fiche, par ex.) : le suivant relit l'état écrit.
let queue: Promise<void> = Promise.resolve();
// Garde-fou : chaque passage qui écrit relance un passage (dataVersion) qui ne
// doit plus rien trouver. Plusieurs passages d'affilée avec des écritures =
// planification non idempotente : on s'arrête plutôt que de boucler.
const MAX_CONSECUTIVE_WRITES = 5;
let consecutiveWrites = 0;

/**
 * Relances CRM automatiques (DECISIONS.md §32), recalculées en local à
 * l'ouverture de l'écran puis à chaque changement de données (interaction
 * ajoutée, étape changée, tâche cochée, pull de la sync) et au changement de jour.
 */
export function useFollowupAutomation() {
  const db = useSQLiteContext();
  const { userId, dataVersion, runLocal } = useSync();
  const today = useToday();

  useEffect(() => {
    queue = queue
      .then(async () => {
        if (consecutiveWrites >= MAX_CONSECUTIVE_WRITES) return;
        const plans = await planAllFollowups(db, userId, today);
        if (plans.length === 0) {
          consecutiveWrites = 0;
          return;
        }
        consecutiveWrites += 1;
        if (consecutiveWrites >= MAX_CONSECUTIVE_WRITES) {
          console.warn('Relances automatiques suspendues : la planification ne se stabilise pas.', plans);
        }
        await runLocal(() => applyFollowupPlans(db, userId, plans));
      })
      .catch((e) => console.warn('Relances automatiques :', e));
  }, [db, userId, today, dataVersion, runLocal]);
}
