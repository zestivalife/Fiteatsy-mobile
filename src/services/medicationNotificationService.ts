import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Medication } from '../types';
import { getMedicationOccurrencesForDate } from './medicationUtils';

const ACTIONS = ['TAKEN', 'SNOOZE_5', 'SNOOZE_10', 'SNOOZE_15', 'SNOOZE_30', 'SKIP'] as const;

let initialized = false;

export const initMedicationNotifications = async () => {
  if (initialized) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false
    })
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('medication-reminders', {
      name: 'Medication Reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default'
    });
  }

  await Notifications.setNotificationCategoryAsync('MEDICATION_ACTIONS', [
    { identifier: ACTIONS[0], buttonTitle: 'Taken' },
    { identifier: ACTIONS[1], buttonTitle: 'Snooze 5m' },
    { identifier: ACTIONS[2], buttonTitle: 'Snooze 10m' },
    { identifier: ACTIONS[3], buttonTitle: 'Snooze 15m' },
    { identifier: ACTIONS[4], buttonTitle: 'Snooze 30m' },
    { identifier: ACTIONS[5], buttonTitle: 'Skip', options: { isDestructive: true } }
  ]);

  initialized = true;
};

export const requestMedicationNotificationPermissions = async () => {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted || existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
  const req = await Notifications.requestPermissionsAsync();
  return !!req.granted;
};

const scheduleOne = async (medication: Medication, when: Date) => {
  const now = Date.now();
  if (when.getTime() <= now) return null;

  let attempt = 0;
  while (attempt < 2) {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `Medication reminder: ${medication.name}`,
          body: `${medication.dosage} • ${medication.type}`,
          sound: 'default',
          categoryIdentifier: 'MEDICATION_ACTIONS',
          data: {
            medicationId: medication.id,
            scheduledForISO: when.toISOString()
          }
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: when,
          channelId: Platform.OS === 'android' ? 'medication-reminders' : undefined
        }
      });
      return id;
    } catch {
      attempt += 1;
    }
  }
  return null;
};

export const clearScheduledMedicationNotifications = async (notificationIds: string[]) => {
  await Promise.all(notificationIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => null)));
};

export const scheduleMedicationNotifications = async (medication: Medication) => {
  const next30Days: Date[] = [];
  const today = new Date();

  for (let i = 0; i < 30; i += 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const occurrences = getMedicationOccurrencesForDate(medication, day);
    occurrences.forEach((occurrence) => next30Days.push(occurrence.scheduledFor));
  }

  const ids: string[] = [];
  for (const when of next30Days) {
    const id = await scheduleOne(medication, when);
    if (id) ids.push(id);
  }
  return ids;
};

export const cancelAllMedicationScheduledNotifications = async () => {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  const medicationIds = all
    .filter((item) => {
      const data = item.content.data as { medicationId?: string } | undefined;
      return Boolean(data?.medicationId);
    })
    .map((item) => item.identifier);

  await Promise.all(medicationIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => null)));
};

export const scheduleSnoozeNotification = async (medicationName: string, medicationId: string, minutes: 5 | 10 | 15 | 30) => {
  const when = new Date(Date.now() + minutes * 60_000);
  return Notifications.scheduleNotificationAsync({
    content: {
      title: `Snoozed: ${medicationName}`,
      body: `Reminder in ${minutes} minutes`,
      sound: 'default',
      categoryIdentifier: 'MEDICATION_ACTIONS',
      data: {
        medicationId,
        scheduledForISO: when.toISOString(),
        snoozed: true
      }
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: Platform.OS === 'android' ? 'medication-reminders' : undefined
    }
  });
};
