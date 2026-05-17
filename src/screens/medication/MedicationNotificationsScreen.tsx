import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../components/Screen';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';

export const MedicationNotificationsScreen = () => {
  const navigation = useNavigation();
  const { medicationPermissionGranted, requestMedicationPermission } = useAppContext();

  return (
    <Screen>
      <View style={styles.container}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
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
  backBtn: {
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.stroke,
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  backText: {
    ...typography.caption,
    color: colors.textPrimary
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
