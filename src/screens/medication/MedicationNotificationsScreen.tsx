import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { colors, radius, spacing } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';

const medicationTheme = {
  text: '#F4F5F6',
  secondary: '#A7ABB1',
  muted: '#747980',
  card: '#111315',
  border: '#282C30',
  cta: '#171A1D',
  ctaBorder: '#42484F'
};

const typography = {
  section: {
    fontFamily: 'Exo_700Bold',
    fontSize: 24,
    lineHeight: 30
  },
  bodyStrong: {
    fontFamily: 'Exo_700Bold',
    fontSize: 17,
    lineHeight: 24
  },
  body: {
    fontFamily: 'Exo_500Medium',
    fontSize: 16,
    lineHeight: 23
  },
  caption: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 13,
    lineHeight: 18
  }
};

export const MedicationNotificationsScreen = () => {
  const navigation = useNavigation();
  const { medicationPermissionGranted, requestMedicationPermission } = useAppContext();
  const darkGraySurfaceText = medicationTheme.text;

  return (
    <Screen>
      <View style={styles.container}>
        <AppBackButton onPress={() => navigation.goBack()} iconOnly />
        <Text style={[styles.title, { color: darkGraySurfaceText }]}>Medication Notifications</Text>
        <Text style={[styles.body, { color: darkGraySurfaceText }]}>Enable notifications to receive actionable reminders with Taken, Snooze, and Skip options.</Text>

        <View style={styles.card}>
          <Text style={[styles.label, { color: darkGraySurfaceText }]}>Permission status</Text>
          <Text style={[styles.value, { color: darkGraySurfaceText }]}>{medicationPermissionGranted ? 'Enabled' : 'Disabled'}</Text>
        </View>

        <Pressable style={styles.button} onPress={requestMedicationPermission}>
          <Text style={styles.buttonText}>{medicationPermissionGranted ? 'Re-check Permission' : 'Enable Notifications'}</Text>
        </Pressable>

        <Text style={[styles.helper, { color: darkGraySurfaceText }]}>Snooze presets: 5, 10, 15, 30 minutes. Reminder sounds: Default, Soft, Bell, Medical alert.</Text>
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
    color: medicationTheme.secondary
  },
  card: {
    borderWidth: 1,
    borderColor: medicationTheme.border,
    borderRadius: radius.md,
    backgroundColor: medicationTheme.card,
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
    borderWidth: 1,
    borderColor: medicationTheme.ctaBorder,
    borderRadius: radius.pill,
    backgroundColor: medicationTheme.cta,
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
    color: medicationTheme.muted
  }
});
