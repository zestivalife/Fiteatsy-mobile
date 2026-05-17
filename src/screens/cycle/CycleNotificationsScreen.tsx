import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../components/Screen';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';

const presetTimes = ['08:00', '12:00', '18:00', '20:00'];

export const CycleNotificationsScreen = () => {
  const navigation = useNavigation();
  const { cycleNotificationSettings, requestCyclePermission, updateCycleNotificationSettings } = useAppContext();
  const [busy, setBusy] = useState(false);

  const toggleEnabled = async () => {
    setBusy(true);
    try {
      if (!cycleNotificationSettings.enabled) {
        const granted = await requestCyclePermission();
        if (!granted) return;
      }
      await updateCycleNotificationSettings({ enabled: !cycleNotificationSettings.enabled });
    } finally {
      setBusy(false);
    }
  };

  const selectTime = async (time: string) => {
    setBusy(true);
    try {
      await updateCycleNotificationSettings({ reminderTime24h: time });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>
      <Text style={styles.title}>Cycle Reminders</Text>
      <View style={styles.card}>
        <Text style={styles.body}>Optional reminders for daily logs and upcoming predicted cycle events.</Text>
        <Pressable style={[styles.toggleBtn, busy && styles.disabled]} onPress={toggleEnabled}>
          <Text style={styles.toggleText}>{cycleNotificationSettings.enabled ? 'Disable Reminders' : 'Enable Reminders'}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Reminder Time</Text>
        <View style={styles.row}>
          {presetTimes.map((time) => (
            <Pressable key={time} style={[styles.chip, cycleNotificationSettings.reminderTime24h === time && styles.chipActive, busy && styles.disabled]} onPress={() => selectTime(time)}>
              <Text style={styles.chipText}>{time}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  backBtn: {
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.stroke,
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginBottom: spacing.sm
  },
  backText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  title: {
    ...typography.section
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  body: {
    ...typography.caption,
    color: colors.textSecondary
  },
  toggleBtn: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  toggleText: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  section: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    minHeight: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    justifyContent: 'center'
  },
  chipActive: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  chipText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  disabled: {
    opacity: 0.6
  }
});
