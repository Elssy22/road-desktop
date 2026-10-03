import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { listUpcomingDebriefs } from '../db/appointmentsDb';
import { listKeyDatesBetween } from '../db/keyDatesDb';
import { listOpenDueDates } from '../db/localDb';
import { listUpcomingReminders } from '../db/remindersDb';
import { addDays, toDateKey } from '../lib/dates';
import {
  KEY_DATE_NOTICE_DAYS,
  MAX_REMINDER_NOTIFICATIONS,
  mergeOneOff,
  MORNING_DAYS_AHEAD,
  planDebriefs,
  planKeyDateAlerts,
  planMorningReminders,
  planReminders,
} from './plan';
import type { NotificationSettings } from './settings';

// Notifications 100 % locales (expo-notifications, SDK 57) : aucune push,
// aucun serveur. Toutes les notifications programmées de l'app viennent d'ici,
// d'où l'annulation globale avant chaque reprogrammation.

export const notificationsSupported = Platform.OS === 'ios' || Platform.OS === 'android';

/** Canal Android (obligatoire depuis Android 8, et avant la demande de permission sur Android 13+). */
const CHANNEL_ID = 'reminders';

if (notificationsSupported) {
  // App au premier plan : afficher quand même la bannière.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Rappels',
    description: 'Rappel du matin, échéances clés, rappels ponctuels et debriefs de RDV',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** `blocked` : refusée et le système ne redemandera plus (seuls les réglages du téléphone y peuvent quelque chose). */
export type PermissionState = 'granted' | 'undetermined' | 'denied' | 'blocked' | 'unsupported';

function toState(p: Notifications.NotificationPermissionsStatus): PermissionState {
  if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
  if (p.status === 'undetermined') return 'undetermined';
  return p.canAskAgain === false ? 'blocked' : 'denied';
}

export async function getNotificationPermission(): Promise<PermissionState> {
  if (!notificationsSupported) return 'unsupported';
  return toState(await Notifications.getPermissionsAsync());
}

/** Demande la permission système si elle peut encore l'être (POST_NOTIFICATIONS sur Android 13+). */
export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!notificationsSupported) return 'unsupported';
  await ensureChannel();
  const current = await getNotificationPermission();
  if (current === 'granted' || current === 'blocked') return current;
  return toState(await Notifications.requestPermissionsAsync());
}

// Une reprogrammation à la fois : sinon deux appels rapprochés (réglage +
// sync) entrelaceraient annulations et programmations et laisseraient des doublons.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export function cancelAllNotifications(): Promise<void> {
  if (!notificationsSupported) return Promise.resolve();
  return serial(() => Notifications.cancelAllScheduledNotificationsAsync());
}

/**
 * Annule tout puis reprogramme, si la permission est accordée : les rappels
 * ponctuels et debriefs de RDV (toujours) et, si le réglage quotidien est activé, les rappels du
 * matin et les alertes J-7, à partir des données locales. Renvoie le nombre programmé.
 */
export function rescheduleNotifications(
  db: SQLiteDatabase,
  userId: string,
  settings: NotificationSettings
): Promise<number> {
  if (!notificationsSupported) return Promise.resolve(0);
  return serial(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if ((await getNotificationPermission()) !== 'granted') return 0;
    await ensureChannel();

    const now = new Date();
    const today = toDateKey(now);
    const [reminders, debriefs] = await Promise.all([
      listUpcomingReminders(db, userId, now, MAX_REMINDER_NOTIFICATIONS),
      listUpcomingDebriefs(db, userId, now, MAX_REMINDER_NOTIFICATIONS),
    ]);
    const plan = mergeOneOff(planReminders(reminders, now), planDebriefs(debriefs, now));
    if (settings.enabled) {
      const [dueDates, keyDates] = await Promise.all([
        listOpenDueDates(db, userId, addDays(today, MORNING_DAYS_AHEAD)),
        listKeyDatesBetween(db, userId, addDays(today, KEY_DATE_NOTICE_DAYS), '9999-12-31'),
      ]);
      plan.push(...planMorningReminders(dueDates, settings, now), ...planKeyDateAlerts(keyDates, settings, now));
    }
    for (const n of plan) {
      await Notifications.scheduleNotificationAsync({
        identifier: n.id,
        content: { title: n.title, body: n.body, data: n.data },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.date, channelId: CHANNEL_ID },
      });
    }
    return plan.length;
  });
}
