import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useToday } from '../lib/useToday';
import { useSync } from '../sync/SyncProvider';
import { cancelAllNotifications, rescheduleNotifications } from './scheduler';
import { useNotificationSettings } from './settings';

// Les données changent par rafales (sync, saisie) : on attend un peu avant de
// tout reprogrammer.
const DEBOUNCE_MS = 1500;

/**
 * Monté sous <SyncProvider> : reprogramme les notifications au lancement, au
 * retour au premier plan, à chaque changement des données locales, de jour ou
 * de réglage. À la
 * déconnexion, annule tout (les notifications parlent des données du compte).
 */
export function NotificationScheduler() {
  const db = useSQLiteContext();
  const { userId, dataVersion } = useSync();
  const today = useToday();
  const settings = useNotificationSettings();
  // Retour au premier plan : la permission a pu être accordée ou retirée dans
  // les réglages du téléphone, sans que rien d'autre ne change.
  const [foregrounds, setForegrounds] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setForegrounds((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      rescheduleNotifications(db, userId, settings).catch((e) =>
        console.warn('Programmation des notifications impossible', e)
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [db, userId, settings, dataVersion, today, foregrounds]);

  useEffect(
    () => () => {
      void cancelAllNotifications().catch(() => undefined);
    },
    [userId]
  );

  return null;
}
