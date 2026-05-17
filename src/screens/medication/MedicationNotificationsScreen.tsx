import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';

export const MedicationNotificationsScreen = () => {
  const { medicationPermissionGranted, requestMedicationPermission } = useAppContext();

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>Medication Notifications</Text>
        <Text style={styles.body}>Enable notifications to receive actionable reminders with Taken, Snooze, and Skip options.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Permission status</Text>
          <Text style={styles.value}>{medicationPermissionGranted ? 'Enabled' : 'Disabled'}</Text>
        </View>

        <Pressable style={styles.button} onPress={requestMedicationPermission}>
          <Text style={styles.buttonText}>{medicationPermissionGranted ? 'Re-check Permission' : 'Enable Notifications'}</Text>
        </Pressable>

        <Text style={styles.helper}>Snooze presets: 5, 10, 15, 30 minutes. Reminder sounds: Default, Soft, Bell, Medical alert.</Text>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.md
  },
  title: {
    ...typography.section
  },
  body: {
    ...typography.body,
    color: colors.textSecondary
  },
  card: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: 12,
    gap: 6
  },
  label: {
    ...typography.caption
  },
  value: {
    ...typography.bodyStrong
  },
  button: {
    borderRadius: radius.pill,
    backgroundColor: colors.blue,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonText: {
    ...typography.bodyStrong,
    color: colors.white
  },
  helper: {
    ...typography.caption,
    color: colors.textMuted
  }
});
