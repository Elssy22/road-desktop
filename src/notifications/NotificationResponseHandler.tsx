import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import type { NotificationData } from './plan';
import { notificationsSupported } from './scheduler';

const isDebrief = (data: unknown): data is NotificationData =>
  typeof data === 'object' && data !== null && (data as { kind?: unknown }).kind === 'debrief';

/**
 * Toucher une notification de debrief ouvre le compte-rendu de RDV, contact
 * prérempli. Schéma de la doc expo-notifications SDK 57 (Expo Router) :
 * `getLastNotificationResponse()` pour l'app lancée par le toucher (à froid),
 * `addNotificationResponseReceivedListener` quand elle tourne déjà.
 *
 * Monté dans `(app)/_layout.tsx`, après la Stack et derrière le verrou
 * biométrique : un toucher reçu avant connexion / déverrouillage est traité
 * une fois l'espace connecté monté. La réponse est effacée après traitement
 * pour ne pas rouvrir l'écran à un remontage (changement de compte).
 * Les autres notifications (matin, J-7, rappels) ouvrent simplement l'app.
 */
export function NotificationResponseHandler() {
  useEffect(() => {
    if (!notificationsSupported) return;

    const handle = (response: Notifications.NotificationResponse) => {
      Notifications.clearLastNotificationResponse();
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const data = response.notification.request.content.data;
      if (!isDebrief(data)) return;
      router.push(
        { pathname: '/agency/meeting-report', params: data.contactId ? { contactId: data.contactId } : {} },
        // Comme les autres accès depuis un autre onglet : « Retour » ramène au menu Agence.
        { withAnchor: true }
      );
    };

    const last = Notifications.getLastNotificationResponse();
    if (last) handle(last);
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);

  return null;
}
