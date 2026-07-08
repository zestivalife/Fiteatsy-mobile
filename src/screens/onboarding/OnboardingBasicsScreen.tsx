import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, getThemeColors, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import {
  AssessmentGender,
  HealthCondition,
  HealthGoal,
  OnboardingProfile
} from '../../types';
import { useAppContext } from '../../state/AppContext';
import { calculateAgeFromDob, createPendingConsultant, formatConsultantAvailability, normalizeOnboardingProfile } from '../../utils/healthProfile';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingBasics'>;

const goals: HealthGoal[] = ['Better Energy', 'Better Sleep', 'Weight Loss', 'Sugar Control', 'Hormone Balance'];
const genders: AssessmentGender[] = ['Male', 'Female', 'Prefer not to say'];
const conditions: HealthCondition[] = [
  'Diabetes',
  'Prediabetes',
  'Hypertension',
  'PCOS',
  'Thyroid',
  'Obesity',
  'High Cholesterol',
  'Gut Health'
];

const formatDob = (date: Date): string =>
  date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

const deriveCareTrack = (selectedConditions: HealthCondition[], goal: HealthGoal | null) => {
  if (selectedConditions.some((item) => ['Diabetes', 'Prediabetes'].includes(item)) || goal === 'Sugar Control') {
    return 'Blood Sugar Recovery Care';
  }
  if (selectedConditions.some((item) => ['PCOS', 'Thyroid'].includes(item)) || goal === 'Hormone Balance') {
    return 'Hormone Balance Care';
  }
  if (selectedConditions.includes('Gut Health')) {
    return 'Digestive & Metabolic Care';
  }
  return 'Foundational Recovery Care';
};

const baseProfile = (): OnboardingProfile => ({
  name: '',
  dateOfBirthISO: new Date(1996, 0, 1).toISOString(),
  calculatedAge: 28,
  age: 28,
  gender: 'Prefer not to say',
  wellnessGoal: 'Better Energy',
  ageBracket: '25-34',
  primaryConditions: [],
  symptomTags: ['Fatigue'],
  healthGoals: ['Better Energy'],
  primaryGoal: 'Better Energy',
  secondaryGoals: [],
  wearablePreference: 'later',
  careTrack: 'Foundational Recovery Care',
  assignedConsultantId: null,
  assignedConsultant: null,
  calendarProvider: 'None',
  calendarPermissionGranted: false,
  notificationPermissionGranted: false,
  createdAtISO: new Date().toISOString()
});

export const OnboardingBasicsScreen = ({ navigation }: Props) => {
  const { onboarding, setOnboarding, setWearableSetupCompleted, themeMode } = useAppContext();
  const isLight = themeMode === 'light';
  const themeColors = getThemeColors(themeMode);
  const darkTextStrong = isLight ? '#000000' : '#FFFFFF';
  const darkTextSoft = isLight ? '#334155' : '#FFFFFF';
  const selectedLightBg = isLight ? themeColors.blueDark : undefined;
  const seed = useMemo(() => onboarding ?? baseProfile(), [onboarding]);

  const initialDob = seed.dateOfBirthISO ? new Date(seed.dateOfBirthISO) : new Date(1996, 0, 1);
  const [dob, setDob] = useState(initialDob);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState<AssessmentGender>(seed.gender ?? 'Prefer not to say');
  const [selectedGoals, setSelectedGoals] = useState<HealthGoal[]>(seed.healthGoals ?? []);
  const [primaryConditions, setPrimaryConditions] = useState<HealthCondition[]>(seed.primaryConditions ?? []);

  const age = calculateAgeFromDob(dob);
  const careTrack = deriveCareTrack(primaryConditions, selectedGoals[0] ?? null);
  const assignmentPreview = createPendingConsultant(careTrack, seed.createdAtISO);

  const onDobChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event.type === 'set' && selectedDate) {
      setDob(selectedDate);
    }
  };

  const persistAndContinue = (mode: 'continue' | 'skip') => {
    const finalGoals = mode === 'skip' ? [] : selectedGoals;
    const finalGoal = finalGoals[0] ?? null;
    const finalConditions = mode === 'skip' ? [] : primaryConditions;
    const finalTrack = deriveCareTrack(finalConditions, finalGoal);
    setOnboarding(normalizeOnboardingProfile({
      ...seed,
      name: seed.name.trim() || 'Member',
      dateOfBirthISO: dob.toISOString(),
      gender,
      primaryConditions: finalConditions,
      healthGoals: finalGoals,
      primaryGoal: finalGoal ?? undefined,
      secondaryGoals: finalGoal ? finalGoals.filter((goal) => goal !== finalGoal) : [],
      wearablePreference: 'later',
      careTrack: finalTrack,
      assignedConsultantId: seed.assignedConsultantId ?? null,
      assignedConsultant: seed.assignedConsultant ?? null,
      createdAtISO: seed.createdAtISO || new Date().toISOString()
    }));
    setWearableSetupCompleted(false);
    navigation.navigate('OnboardingCalendar');
  };

  return (
    <Screen>
      <View style={styles.body}>
        <Text style={[styles.kicker, { color: themeColors.blue }]}>Quick Setup</Text>
        <Text style={[styles.title, { color: darkTextStrong }]}>Tell us just what we need</Text>
        <Text style={[styles.subtitle, { color: darkTextSoft }]}>This takes less than a minute. You can update everything later.</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.label, { color: darkTextStrong }]}>Date of birth</Text>
          <Pressable style={[styles.dateField, { borderColor: themeColors.stroke, backgroundColor: isLight ? '#FFFFFF' : themeColors.cardMuted }]} onPress={() => setShowDatePicker(true)}>
            <View style={styles.dateFieldLeft}>
              <Ionicons name="calendar-outline" size={16} color={darkTextSoft} />
              <Text style={[styles.dateFieldText, { color: darkTextStrong }]}>{formatDob(dob)}</Text>
            </View>
            <Text style={styles.dateAgeText}>{age} yrs</Text>
          </Pressable>
          {showDatePicker ? (
            <DateTimePicker
              value={dob}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date()}
              onChange={onDobChange}
            />
          ) : null}

          <Text style={[styles.label, { color: darkTextStrong }]}>Gender</Text>
          <View style={styles.options}>
            {genders.map((item) => {
              const active = gender === item;
              return (
                <Pressable
                  key={item}
                  style={[
                    styles.option,
                    { borderColor: themeColors.stroke, backgroundColor: isLight ? '#FFFFFF' : themeColors.cardMuted },
                    active && styles.optionActive,
                    active && isLight && { backgroundColor: selectedLightBg, borderColor: selectedLightBg }
                  ]}
                  onPress={() => setGender(item)}
                >
                  <Text style={[styles.optionText, { color: darkTextStrong }, active && styles.optionTextActive]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: darkTextStrong }]}>Wellness goals</Text>
          <Text style={[styles.helper, { color: darkTextSoft }]}>Choose one or more. Your first selected goal becomes primary.</Text>
          <View style={styles.options}>
            {goals.map((item) => {
              const active = selectedGoals.includes(item);
              return (
                <Pressable
                  key={item}
                  style={[
                    styles.option,
                    { borderColor: themeColors.stroke, backgroundColor: isLight ? '#FFFFFF' : themeColors.cardMuted },
                    active && styles.optionActive,
                    active && isLight && { backgroundColor: selectedLightBg, borderColor: selectedLightBg }
                  ]}
                  onPress={() => {
                    setSelectedGoals((current) => {
                      if (current.includes(item)) {
                        return current.filter((goal) => goal !== item);
                      }
                      return [...current, item];
                    });
                  }}
                >
                  <Text style={[styles.optionText, { color: darkTextStrong }, active && styles.optionTextActive]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.helper, { color: darkTextSoft }]}>
            {selectedGoals.length > 0 ? `Primary: ${selectedGoals[0]}${selectedGoals.length > 1 ? ` • Secondary: ${selectedGoals.slice(1).join(', ')}` : ''}` : 'You can skip goals for now.'}
          </Text>

          <Text style={[styles.label, { color: darkTextStrong }]}>Existing conditions (optional)</Text>
          <Text style={[styles.helper, { color: darkTextSoft }]}>Select if relevant, or leave blank</Text>
          <View style={styles.options}>
            {conditions.map((item) => {
              const active = primaryConditions.includes(item);
              return (
                <Pressable
                  key={item}
                  style={[
                    styles.option,
                    { borderColor: themeColors.stroke, backgroundColor: isLight ? '#FFFFFF' : themeColors.cardMuted },
                    active && styles.optionActive,
                    active && isLight && { backgroundColor: selectedLightBg, borderColor: selectedLightBg }
                  ]}
                  onPress={() => {
                    setPrimaryConditions((current) => {
                      const exists = current.includes(item);
                      if (exists) {
                        return current.filter((x) => x !== item);
                      }
                      return [...current, item];
                    });
                  }}
                >
                  <Text style={[styles.optionText, { color: darkTextStrong }, active && styles.optionTextActive]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>

          <LinearGradient colors={isLight ? ['#FFFFFF', '#EEF2F7'] : [colors.cardMuted, colors.cardMuted]} style={[styles.matchCard, { borderColor: themeColors.stroke }]}>
            <Text style={[styles.matchEyebrow, { color: themeColors.blue }]}>Consultant assignment</Text>
            <Text style={[styles.matchTrack, { color: darkTextStrong }]}>{careTrack}</Text>
            <Text style={[styles.matchDietitian, { color: darkTextStrong }]}>Assigned after program activation</Text>
            <Text style={[styles.matchSpecialty, { color: darkTextSoft }]}>{assignmentPreview.specialization} • {formatConsultantAvailability(assignmentPreview.availability)}</Text>
            <Text style={[styles.matchSpecialty, { color: darkTextSoft }]}>Your consultant syncs automatically from the backend once your care case is created and assigned.</Text>
          </LinearGradient>
        </ScrollView>
      </View>

      <View style={styles.footer}>
        <PrimaryButton title="Continue" onPress={() => persistAndContinue('continue')} />
        <Pressable style={styles.skipBtn} onPress={() => persistAndContinue('skip')}>
          <Text style={[styles.skipText, { color: darkTextSoft }]}>Skip for now</Text>
        </Pressable>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  body: {
    flex: 1
  },
  scrollContent: {
    paddingBottom: 16,
    gap: 12
  },
  footer: {
    paddingTop: 12
  },
  kicker: {
    ...typography.caption,
    color: colors.blue,
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
    marginBottom: 20
  },
  label: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  helper: {
    ...typography.caption,
    marginTop: -6,
    marginBottom: 2
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  option: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 999,
    backgroundColor: colors.cardMuted,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  optionActive: {
    borderColor: colors.blue,
    backgroundColor: 'rgba(96,175,0,0.24)'
  },
  optionText: {
    ...typography.caption,
    color: colors.textSecondary
  },
  optionTextActive: {
    color: colors.textPrimary
  },
  matchCard: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 16,
    backgroundColor: colors.cardMuted,
    padding: 14,
    marginTop: 4
  },
  matchEyebrow: {
    ...typography.caption,
    color: colors.blue
  },
  dateField: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  dateFieldLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  dateFieldText: {
    ...typography.body,
    fontSize: 14,
    color: colors.textPrimary
  },
  dateAgeText: {
    ...typography.caption,
    color: colors.blue
  },
  matchTrack: {
    ...typography.bodyStrong,
    marginTop: 6,
    fontSize: 16
  },
  matchDietitian: {
    ...typography.bodyStrong,
    marginTop: 10
  },
  matchSpecialty: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 3
  },
  skipBtn: {
    marginTop: 12,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  skipText: {
    ...typography.caption,
    color: colors.textSecondary
  }
});
