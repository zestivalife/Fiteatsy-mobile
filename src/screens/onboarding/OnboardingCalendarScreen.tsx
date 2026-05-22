import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, getThemeColors, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { CalendarProvider, OnboardingProfile } from '../../types';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingCalendar'>;

const providers: CalendarProvider[] = ['Google', 'Outlook'];

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

export const OnboardingCalendarScreen = ({ navigation }: Props) => {
  const { onboarding, setOnboarding, themeMode } = useAppContext();
  const isLight = themeMode === 'light';
  const themeColors = getThemeColors(themeMode);
  const selectedLightBg = isLight ? themeColors.blueDark : undefined;
  const profile = onboarding ?? fallbackProfile();

  const selectProvider = (provider: CalendarProvider) => {
    setOnboarding({
      ...profile,
      calendarProvider: provider,
      calendarPermissionGranted: true
    });
  };

  const continueNext = () => {
    setOnboarding({
      ...profile,
      calendarPermissionGranted: profile.calendarProvider !== 'None'
    });
    navigation.navigate('OnboardingNotifications');
  };

  return (
    <Screen>
      <View style={styles.body}>
        <Text style={[styles.kicker, { color: themeColors.blue }]}>Step 3 · Personalized Guidance</Text>
        <Text style={[styles.title, { color: isLight ? '#000000' : themeColors.textPrimary }]}>Connect your daily schedule</Text>
        <Text style={[styles.subtitle, { color: isLight ? '#334155' : colors.textSecondary }]}>Optional, but helpful. We use your schedule only to place meals, walks, hydration, and recovery nudges at the right time.</Text>

        <View style={styles.list}>
          {providers.map((provider) => {
            const active = profile.calendarProvider === provider;
            return (
              <Pressable
                key={provider}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={provider}
                style={[
                  styles.option,
                  { borderColor: themeColors.stroke },
                  active && styles.optionActive,
                  active && isLight && { backgroundColor: selectedLightBg, borderColor: selectedLightBg }
                ]}
                onPress={() => selectProvider(provider)}
              >
                <LinearGradient colors={isLight ? ['#FFFFFF', '#EEF2F7'] : [colors.cardMuted, colors.cardMuted]} style={styles.optionGradient}>
                  <Text style={[styles.optionTitle, { color: isLight ? '#000000' : themeColors.textPrimary }, active && styles.optionTitleActive]}>{provider}</Text>
                  <Text style={[styles.optionCopy, { color: isLight ? '#334155' : colors.textSecondary }]}>Time meals, hydration, supplements, and movement reminders around your real day.</Text>
                </LinearGradient>
              </Pressable>
            );
          })}

          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: profile.calendarProvider === 'None' }}
            accessibilityLabel="Skip calendar connection for now"
            style={[
              styles.option,
              { borderColor: themeColors.stroke },
              profile.calendarProvider === 'None' && styles.optionActive,
              profile.calendarProvider === 'None' && isLight && { backgroundColor: selectedLightBg, borderColor: selectedLightBg }
            ]}
            onPress={() => setOnboarding({ ...profile, calendarProvider: 'None', calendarPermissionGranted: false })}
          >
            <LinearGradient colors={isLight ? ['#FFFFFF', '#EEF2F7'] : [colors.cardMuted, colors.cardMuted]} style={styles.optionGradient}>
              <Text style={[styles.optionTitle, { color: isLight ? '#000000' : themeColors.textPrimary }, profile.calendarProvider === 'None' && styles.optionTitleActive]}>Skip for now</Text>
              <Text style={[styles.optionCopy, { color: isLight ? '#334155' : colors.textSecondary }]}>You can continue with manual planning and connect your schedule later.</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>

      <View style={styles.footer}>
        <PrimaryButton title="Continue" onPress={continueNext} />
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
  list: {
    gap: 10,
    marginBottom: 18
  },
  option: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 16,
    overflow: 'hidden'
  },
  optionGradient: {
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  optionActive: {
    borderColor: colors.blue,
    backgroundColor: 'rgba(96,175,0,0.16)'
  },
  optionTitle: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  optionTitleActive: {
    color: colors.textPrimary
  },
  optionCopy: {
    ...typography.body,
    fontSize: 14,
    marginTop: 4
  }
});
