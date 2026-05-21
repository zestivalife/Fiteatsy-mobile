import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { OnboardingProfile } from '../../types';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingNotifications'>;

const fallbackProfile = (): OnboardingProfile => ({
  name: 'Member',
  ageBracket: '25-34',
  primaryConditions: ['Gut Health'],
  symptomTags: ['Fatigue'],
  healthGoals: ['Better Energy'],
  wearablePreference: 'manual',
  careTrack: 'Foundational Recovery Care',
  matchedDietitianName: 'Dr. Aisha Menon',
  matchedDietitianSpecialty: 'Clinical Nutrition & Habit Recovery',
  calendarProvider: 'None',
  calendarPermissionGranted: false,
  notificationPermissionGranted: false,
  createdAtISO: new Date().toISOString()
});

export const OnboardingNotificationsScreen = ({ navigation }: Props) => {
  const { onboarding, setOnboarding, setWearableSetupCompleted } = useAppContext();
  const profile = onboarding ?? fallbackProfile();

  const allowNotifications = () => {
    setOnboarding({
      ...profile,
      notificationPermissionGranted: true
    });
  };

  const complete = () => {
    if (!profile.notificationPermissionGranted) {
      allowNotifications();
    }
    setWearableSetupCompleted(false);
    navigation.reset({
      index: 0,
      routes: [{ name: 'SyncWearable' }]
    });
  };

  return (
    <Screen>
      <View style={styles.body}>
        <Text style={styles.kicker}>Step 4 · Track & Transform</Text>
        <Text style={styles.title}>Your plan is ready</Text>
        <Text style={styles.subtitle}>We will only remind you when it helps your recovery. No spam, no guilt, no noise.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{profile.careTrack}</Text>
          <Text style={styles.cardCopy}>Matched with {profile.matchedDietitianName}. Your dashboard will blend condition tracking, symptom recovery, hydration, nutrition guidance, and optional health-app sync.</Text>
        </View>

        <Pressable style={styles.permissionButton} onPress={allowNotifications}>
          <Text style={styles.permissionText}>Allow smart health reminders</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <PrimaryButton title="Open my care dashboard" onPress={complete} />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  body: {
    flex: 1
  },
  footer: {
    paddingTop: 12
  },
  kicker: {
    ...typography.caption,
    color: colors.blueDark,
    marginBottom: 8
  },
  title: {
    ...typography.title,
    fontSize: 28,
    lineHeight: 34
  },
  subtitle: {
    ...typography.body,
    marginTop: 8,
    marginBottom: 18
  },
  card: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 18,
    backgroundColor: colors.cardMuted,
    padding: 14,
    marginBottom: 16
  },
  cardTitle: {
    ...typography.bodyStrong,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 6
  },
  cardCopy: {
    ...typography.body,
    fontSize: 14,
    marginTop: 2
  },
  permissionButton: {
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: 999,
    backgroundColor: 'rgba(96,175,0,0.16)',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 12
  },
  permissionText: {
    ...typography.bodyStrong,
    fontSize: 14,
    color: colors.textPrimary
  }
});
