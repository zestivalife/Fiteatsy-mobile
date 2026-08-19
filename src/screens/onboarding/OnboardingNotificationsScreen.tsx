import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, getThemeColors, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { OnboardingProfile } from '../../types';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingNotifications'>;

const fallbackProfile = (): OnboardingProfile => ({
  name: 'Member',
  dateOfBirthISO: new Date(1996, 0, 1).toISOString(),
  calculatedAge: 28,
  age: 28,
  gender: 'Prefer not to say',
  ageBracket: '25-34',
  primaryConditions: ['Gut Health'],
  symptomTags: ['Fatigue'],
  healthGoals: ['Better Energy'],
  primaryGoal: 'Better Energy',
  secondaryGoals: [],
  wearablePreference: 'manual',
  careTrack: 'Foundational Recovery Care',
  assignedConsultantId: null,
  assignedConsultant: null,
  calendarProvider: 'None',
  calendarPermissionGranted: false,
  notificationPermissionGranted: false,
  createdAtISO: new Date().toISOString()
});

export const OnboardingNotificationsScreen = ({ navigation }: Props) => {
  const { onboarding, setOnboarding, setWearableSetupCompleted, themeMode } = useAppContext();
  const isLight = themeMode === 'light';
  const themeColors = getThemeColors(themeMode);
  const darkTextStrong = isLight ? '#000000' : '#FFFFFF';
  const darkTextSoft = isLight ? '#334155' : '#FFFFFF';
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
    navigation.navigate('FoodPreferences', { mode: 'onboarding' });
  };

  return (
    <Screen>
      <View style={styles.body}>
        <Text style={[styles.kicker, { color: themeColors.blue }]}>Step 3 · Track & Transform</Text>
        <Text style={[styles.title, { color: darkTextStrong }]}>Your plan is ready</Text>
        <Text style={[styles.subtitle, { color: darkTextSoft }]}>We will only remind you when it helps your recovery. No spam, no guilt, no noise.</Text>

        <LinearGradient colors={isLight ? ['#FFFFFF', '#EEF2F7'] : [colors.cardMuted, colors.cardMuted]} style={[styles.card, { borderColor: themeColors.stroke }]}>
          <Text style={[styles.cardTitle, { color: darkTextStrong }]}>{profile.careTrack}</Text>
          <Text style={[styles.cardCopy, { color: darkTextSoft }]}>Your consultant is assigned after subscription activation, recovery program creation, and care-case routing. Once assigned, the app will sync their profile, availability, appointments, and contact channels automatically.</Text>
        </LinearGradient>

        <Pressable style={[styles.permissionButton, { borderColor: themeColors.blue }]} onPress={allowNotifications}>
          <Text style={[styles.permissionText, { color: darkTextStrong }]}>Allow smart health reminders</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <PrimaryButton title="Continue to health assessment" onPress={complete} />
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
