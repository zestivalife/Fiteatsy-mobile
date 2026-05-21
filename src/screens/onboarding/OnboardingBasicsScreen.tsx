import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import {
  AgeBracket,
  AssessmentGender,
  HealthCondition,
  HealthGoal,
  OnboardingProfile
} from '../../types';
import { useAppContext } from '../../state/AppContext';

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

const toAgeBracket = (age: number): AgeBracket => {
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  if (age <= 54) return '45-54';
  return '55+';
};

const calculateAgeFromDob = (dob: Date): number => {
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    years -= 1;
  }
  return Math.max(18, Math.min(99, years));
};

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

const deriveDietitian = (careTrack: string) => {
  if (careTrack === 'Blood Sugar Recovery Care') {
    return { name: 'Dr. Rhea Kapoor', specialty: 'Diabetes & Metabolic Nutrition' };
  }
  if (careTrack === 'Hormone Balance Care') {
    return { name: 'Dr. Aisha Menon', specialty: 'PCOS, Thyroid & Hormonal Nutrition' };
  }
  if (careTrack === 'Digestive & Metabolic Care') {
    return { name: 'Dr. Neha Batra', specialty: 'Gut Health & Metabolic Nutrition' };
  }
  return { name: 'Dr. Aisha Menon', specialty: 'Clinical Nutrition & Habit Recovery' };
};

const baseProfile = (): OnboardingProfile => ({
  name: '',
  dateOfBirthISO: new Date(1996, 0, 1).toISOString(),
  age: 28,
  gender: 'Prefer not to say',
  wellnessGoal: 'Better Energy',
  ageBracket: '25-34',
  primaryConditions: [],
  symptomTags: ['Fatigue'],
  healthGoals: ['Better Energy'],
  wearablePreference: 'later',
  careTrack: 'Foundational Recovery Care',
  matchedDietitianName: 'Dr. Aisha Menon',
  matchedDietitianSpecialty: 'Clinical Nutrition & Habit Recovery',
  calendarProvider: 'None',
  calendarPermissionGranted: false,
  notificationPermissionGranted: false,
  createdAtISO: new Date().toISOString()
});

export const OnboardingBasicsScreen = ({ navigation }: Props) => {
  const { onboarding, setOnboarding, setWearableSetupCompleted } = useAppContext();
  const seed = useMemo(() => onboarding ?? baseProfile(), [onboarding]);

  const initialDob = seed.dateOfBirthISO ? new Date(seed.dateOfBirthISO) : new Date(1996, 0, 1);
  const [dob, setDob] = useState(initialDob);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState<AssessmentGender>(seed.gender ?? 'Prefer not to say');
  const [wellnessGoal, setWellnessGoal] = useState<HealthGoal | null>(seed.wellnessGoal ?? seed.healthGoals[0] ?? null);
  const [primaryConditions, setPrimaryConditions] = useState<HealthCondition[]>(seed.primaryConditions ?? []);

  const age = calculateAgeFromDob(dob);
  const ageBracket = toAgeBracket(age);
  const careTrack = deriveCareTrack(primaryConditions, wellnessGoal);
  const dietitian = deriveDietitian(careTrack);

  const onDobChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event.type === 'set' && selectedDate) {
      setDob(selectedDate);
    }
  };

  const persistAndContinue = (mode: 'continue' | 'skip') => {
    const finalGoal = mode === 'skip' ? null : wellnessGoal;
    const finalConditions = mode === 'skip' ? [] : primaryConditions;
    const finalTrack = deriveCareTrack(finalConditions, finalGoal);
    const finalDietitian = deriveDietitian(finalTrack);

    setOnboarding({
      ...seed,
      name: seed.name.trim() || 'Member',
      dateOfBirthISO: dob.toISOString(),
      age,
      gender,
      wellnessGoal: finalGoal ?? undefined,
      ageBracket,
      primaryConditions: finalConditions,
      healthGoals: finalGoal ? [finalGoal] : ['Better Energy'],
      wearablePreference: 'later',
      careTrack: finalTrack,
      matchedDietitianName: finalDietitian.name,
      matchedDietitianSpecialty: finalDietitian.specialty,
      createdAtISO: seed.createdAtISO || new Date().toISOString()
    });
    setWearableSetupCompleted(false);
    navigation.navigate('OnboardingCalendar');
  };

  return (
    <Screen>
      <View style={styles.body}>
        <Text style={styles.kicker}>Quick Setup</Text>
        <Text style={styles.title}>Tell us just what we need</Text>
        <Text style={styles.subtitle}>This takes less than a minute. You can update everything later.</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.label}>Date of birth</Text>
          <Pressable style={styles.dateField} onPress={() => setShowDatePicker(true)}>
            <View style={styles.dateFieldLeft}>
              <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.dateFieldText}>{formatDob(dob)}</Text>
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

          <Text style={styles.label}>Gender</Text>
          <View style={styles.options}>
            {genders.map((item) => {
              const active = gender === item;
              return (
                <Pressable key={item} style={[styles.option, active && styles.optionActive]} onPress={() => setGender(item)}>
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Wellness goal</Text>
          <Text style={styles.helper}>Choose one or select “Maybe later”</Text>
          <View style={styles.options}>
            {goals.map((item) => {
              const active = wellnessGoal === item;
              return (
                <Pressable key={item} style={[styles.option, active && styles.optionActive]} onPress={() => setWellnessGoal(item)}>
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{item}</Text>
                </Pressable>
              );
            })}
            <Pressable style={[styles.option, wellnessGoal === null && styles.optionActive]} onPress={() => setWellnessGoal(null)}>
              <Text style={[styles.optionText, wellnessGoal === null && styles.optionTextActive]}>Maybe later</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Existing conditions (optional)</Text>
          <Text style={styles.helper}>Select if relevant, or leave blank</Text>
          <View style={styles.options}>
            {conditions.map((item) => {
              const active = primaryConditions.includes(item);
              return (
                <Pressable
                  key={item}
                  style={[styles.option, active && styles.optionActive]}
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
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.matchCard}>
            <Text style={styles.matchEyebrow}>Matched for you</Text>
            <Text style={styles.matchTrack}>{careTrack}</Text>
            <Text style={styles.matchDietitian}>{dietitian.name}</Text>
            <Text style={styles.matchSpecialty}>{dietitian.specialty}</Text>
          </View>
        </ScrollView>
      </View>

      <View style={styles.footer}>
        <PrimaryButton title="Continue" onPress={() => persistAndContinue('continue')} />
        <Pressable style={styles.skipBtn} onPress={() => persistAndContinue('skip')}>
          <Text style={styles.skipText}>Skip for now</Text>
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
