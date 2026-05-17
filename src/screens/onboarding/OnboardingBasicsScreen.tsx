import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import {
  AgeBracket,
  HealthCondition,
  HealthGoal,
  OnboardingProfile,
  SymptomTag,
  WearablePreference
} from '../../types';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingBasics'>;

const ageBrackets: AgeBracket[] = ['18-24', '25-34', '35-44', '45-54', '55+'];
const conditions: HealthCondition[] = [
  'Diabetes',
  'Prediabetes',
  'Hypertension',
  'PCOS',
  'PCOD',
  'Thyroid',
  'Obesity',
  'High Cholesterol',
  'Fatty Liver',
  'Insulin Resistance',
  'Gut Health',
  'Anemia',
  'Vitamin Deficiency',
  'Kidney Care',
  'Hormonal Imbalance',
  'Inflammation'
];
const symptoms: SymptomTag[] = [
  'Fatigue',
  'Cravings',
  'Bloating',
  'Poor Sleep',
  'Sugar Crashes',
  'Irregular Cycles',
  'Acne',
  'Hair Fall',
  'Digestive Discomfort',
  'High Hunger',
  'Low Mood',
  'Joint Pain'
];
const goals: HealthGoal[] = [
  'Sugar Control',
  'Weight Loss',
  'Hormone Balance',
  'BP Control',
  'Gut Relief',
  'Better Energy',
  'Better Sleep',
  'Sustainable Habits'
];
const wearableOptions: Array<{ value: WearablePreference; label: string; copy: string }> = [
  { value: 'sync', label: 'Yes, sync wearable', copy: 'Use smartwatch or fitness band data inside your dashboard.' },
  { value: 'manual', label: 'No, manual tracking', copy: 'Use guided assessments, symptoms, hydration, sleep, and vitals logging.' },
  { value: 'later', label: 'Maybe later', copy: 'Start with assessments now and connect a device anytime.' }
];

const baseProfile = (): OnboardingProfile => ({
  name: '',
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

const toggleValue = <T extends string>(list: T[], value: T, max = 3) => {
  if (list.includes(value)) {
    return list.filter((item) => item !== value);
  }
  return [...list, value].slice(-max);
};

const deriveCareTrack = (selectedConditions: HealthCondition[], selectedGoals: HealthGoal[]) => {
  if (selectedConditions.some((item) => ['Diabetes', 'Prediabetes', 'Insulin Resistance'].includes(item))) {
    return 'Blood Sugar Recovery Care';
  }
  if (selectedConditions.some((item) => ['PCOS', 'PCOD', 'Hormonal Imbalance', 'Thyroid'].includes(item))) {
    return 'Hormone Balance Care';
  }
  if (selectedConditions.some((item) => ['Gut Health', 'Fatty Liver'].includes(item)) || selectedGoals.includes('Gut Relief')) {
    return 'Digestive & Metabolic Care';
  }
  if (selectedConditions.some((item) => ['Hypertension', 'High Cholesterol'].includes(item)) || selectedGoals.includes('BP Control')) {
    return 'Heart & Pressure Care';
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
    return { name: 'Dr. Neha Batra', specialty: 'Gut Health & Fatty Liver Nutrition' };
  }
  if (careTrack === 'Heart & Pressure Care') {
    return { name: 'Dr. Sana Verma', specialty: 'BP, Lipids & Cardio Nutrition' };
  }
  return { name: 'Dr. Aisha Menon', specialty: 'Clinical Nutrition & Habit Recovery' };
};

export const OnboardingBasicsScreen = ({ navigation }: Props) => {
  const { onboarding, setOnboarding } = useAppContext();
  const seed = useMemo(() => onboarding ?? baseProfile(), [onboarding]);

  const [name, setName] = useState(seed.name);
  const [ageBracket, setAgeBracket] = useState<AgeBracket>(seed.ageBracket);
  const [primaryConditions, setPrimaryConditions] = useState<HealthCondition[]>(seed.primaryConditions);
  const [symptomTags, setSymptomTags] = useState<SymptomTag[]>(seed.symptomTags);
  const [healthGoals, setHealthGoals] = useState<HealthGoal[]>(seed.healthGoals);
  const [wearablePreference, setWearablePreference] = useState<WearablePreference>(seed.wearablePreference);

  const careTrack = deriveCareTrack(primaryConditions, healthGoals);
  const dietitian = deriveDietitian(careTrack);

  const continueNext = () => {
    setOnboarding({
      ...seed,
      name: name.trim() || 'Member',
      ageBracket,
      primaryConditions: primaryConditions.length ? primaryConditions : ['Gut Health'],
      symptomTags: symptomTags.length ? symptomTags : ['Fatigue'],
      healthGoals: healthGoals.length ? healthGoals : ['Better Energy'],
      wearablePreference,
      careTrack,
      matchedDietitianName: dietitian.name,
      matchedDietitianSpecialty: dietitian.specialty,
      createdAtISO: seed.createdAtISO || new Date().toISOString()
    });
    navigation.navigate('OnboardingCalendar');
  };

  return (
    <Screen>
      <View style={styles.body}>
        <Text style={styles.kicker}>Step 2 · Get Matched</Text>
        <Text style={styles.title}>Tell us what your health needs right now</Text>
        <Text style={styles.subtitle}>We use this to match you with the right clinical dietitian, dashboard, and care plan.</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.form}>
            <TextField label="Name" placeholder="Your first name" value={name} onChangeText={setName} />
          </View>

          <Text style={styles.label}>Age group</Text>
          <View style={styles.options}>
            {ageBrackets.map((item) => {
              const active = ageBracket === item;
              return (
                <Pressable key={item} accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={`Age group ${item}`} style={[styles.option, active && styles.optionActive]} onPress={() => setAgeBracket(item)}>
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Primary conditions</Text>
          <Text style={styles.helper}>Choose up to 3</Text>
          <View style={styles.options}>
            {conditions.map((item) => {
              const active = primaryConditions.includes(item);
              return (
                <Pressable
                  key={item}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={item}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => setPrimaryConditions((current) => toggleValue(current, item, 3))}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Current symptoms</Text>
          <Text style={styles.helper}>Choose what feels most relevant today</Text>
          <View style={styles.options}>
            {symptoms.map((item) => {
              const active = symptomTags.includes(item);
              return (
                <Pressable
                  key={item}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={item}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => setSymptomTags((current) => toggleValue(current, item, 4))}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>What do you want to improve first?</Text>
          <View style={styles.options}>
            {goals.map((item) => {
              const active = healthGoals.includes(item);
              return (
                <Pressable
                  key={item}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={item}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => setHealthGoals((current) => toggleValue(current, item, 3))}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Wearable sync</Text>
          <View style={styles.stack}>
            {wearableOptions.map((item) => {
              const active = wearablePreference === item.value;
              return (
                <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={item.label} style={[styles.radioCard, active && styles.radioCardActive]} onPress={() => setWearablePreference(item.value)}>
                  <View style={[styles.radioDot, active && styles.radioDotActive]} />
                  <View style={styles.radioCopy}>
                    <Text style={[styles.radioTitle, active && styles.radioTitleActive]}>{item.label}</Text>
                    <Text style={styles.radioText}>{item.copy}</Text>
                  </View>
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
        <PrimaryButton title="Continue" onPress={continueNext} />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  body: {
    flex: 1
  },
  scrollContent: {
    paddingBottom: 16
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
    marginBottom: 20
  },
  form: {
    gap: 12,
    marginBottom: 16
  },
  label: {
    ...typography.bodyStrong,
    fontSize: 14,
    marginBottom: 8
  },
  helper: {
    ...typography.caption,
    marginTop: -4,
    marginBottom: 10
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18
  },
  option: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 999,
    backgroundColor: colors.cardMuted,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  optionActive: {
    backgroundColor: 'rgba(96,175,0,0.16)',
    borderColor: colors.blue
  },
  optionText: {
    ...typography.body,
    fontSize: 14,
    color: colors.textPrimary
  },
  optionTextActive: {
    color: colors.textPrimary,
    fontWeight: '700'
  },
  stack: {
    gap: 10,
    marginBottom: 18
  },
  radioCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 18,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  radioCardActive: {
    borderColor: colors.blue,
    backgroundColor: 'rgba(96,175,0,0.12)'
  },
  radioDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.textMuted,
    marginTop: 2
  },
  radioDotActive: {
    borderColor: colors.blue,
    backgroundColor: colors.blue
  },
  radioCopy: {
    flex: 1,
    gap: 4
  },
  radioTitle: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  radioTitleActive: {
    color: colors.textPrimary
  },
  radioText: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 18
  },
  matchCard: {
    borderWidth: 1,
    borderColor: 'rgba(96,175,0,0.24)',
    borderRadius: 22,
    backgroundColor: 'rgba(96,175,0,0.11)',
    padding: 16
  },
  matchEyebrow: {
    ...typography.caption,
    color: colors.blueDark,
    marginBottom: 6
  },
  matchTrack: {
    ...typography.bodyStrong,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 6
  },
  matchDietitian: {
    ...typography.bodyStrong,
    fontSize: 15,
    color: colors.textPrimary
  },
  matchSpecialty: {
    ...typography.body,
    marginTop: 4
  }
});
