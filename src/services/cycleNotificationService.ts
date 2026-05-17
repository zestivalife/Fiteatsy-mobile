import * as Notifications from 'expo-notifications';
import { CyclePrediction } from '../types';

const parseTime24 = (time24h: string) => {
  const [h, m] = time24h.split(':').map((v) => Number(v));
  return { hour: Number.isFinite(h) ? h : 20, minute: Number.isFinite(m) ? m : 0 };
};

const futureAt = (daysOffset: number, time24h: string) => {
  const now = new Date();
  const { hour, minute } = parseTime24(time24h);
  const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysOffset, hour, minute, 0, 0);
  if (dt.getTime() <= now.getTime()) dt.setDate(dt.getDate() + 1);
  return dt;
};

const scheduleOne = async (title: string, body: string, triggerAt: Date, data: Record<string, string>) => {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      data
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerAt,
      channelId: 'medication-reminders'
    }
  });
};

export const clearCycleNotifications = async (ids: string[]) => {
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => null)));
};

export const scheduleCycleNotifications = async (params: {
  reminderTime24h: string;
  prediction: CyclePrediction;
}) => {
  const ids: string[] = [];
  const { reminderTime24h, prediction } = params;

  const daily = await scheduleOne(
    'Cycle check-in',
    'Log today in under 10 seconds for better cycle insights.',
    futureAt(0, reminderTime24h),
    { type: 'cycle_log' }
  );
  ids.push(daily);

  if (prediction.predictedNextPeriodStartISO) {
    const nextPeriod = new Date(prediction.predictedNextPeriodStartISO);
    const reminderDate = new Date(nextPeriod);
    reminderDate.setDate(reminderDate.getDate() - 1);
    reminderDate.setHours(parseTime24(reminderTime24h).hour, parseTime24(reminderTime24h).minute, 0, 0);
    if (reminderDate.getTime() > Date.now()) {
      ids.push(
        await scheduleOne(
          'Period likely tomorrow',
          'Based on your history, your next period may start soon.',
          reminderDate,
          { type: 'period_expected' }
        )
      );
    }
  }

  if (prediction.predictedFertileStartISO) {
    const fertile = new Date(prediction.predictedFertileStartISO);
    const reminderDate = new Date(fertile);
    reminderDate.setDate(reminderDate.getDate() - 1);
    reminderDate.setHours(parseTime24(reminderTime24h).hour, parseTime24(reminderTime24h).minute, 0, 0);
    if (reminderDate.getTime() > Date.now()) {
      ids.push(
        await scheduleOne(
          'Fertile window likely approaching',
          'Cycle insights suggest your predicted fertile window may begin soon.',
          reminderDate,
          { type: 'fertile_window' }
        )
      );
    }
  }

  return ids;
};
