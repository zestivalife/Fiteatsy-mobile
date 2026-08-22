import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChoiceCard, OnboardingAction, OnboardingShell, QuestionHeader } from '../../components/onboarding/OnboardingShell';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { AssessmentGender, HealthCondition, HealthGoal, OnboardingProfile } from '../../types';
import { useAppContext } from '../../state/AppContext';
import { normalizeOnboardingProfile } from '../../utils/healthProfile';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingBasics'>;
const goals: HealthGoal[] = ['Better Energy', 'Better Sleep', 'Weight Loss', 'Sugar Control', 'Hormone Balance'];
const genders: AssessmentGender[] = ['Male', 'Female', 'Prefer not to say'];
const conditions: HealthCondition[] = ['Diabetes', 'Prediabetes', 'Hypertension', 'PCOS', 'Thyroid', 'Obesity', 'High Cholesterol', 'Gut Health'];

const baseProfile = (): OnboardingProfile => ({
  name: '', dateOfBirthISO: new Date(1996, 0, 1).toISOString(), calculatedAge: 28, age: 28,
  gender: 'Prefer not to say', wellnessGoal: 'Better Energy', ageBracket: '25-34', primaryConditions: [],
  symptomTags: ['Fatigue'], healthGoals: ['Better Energy'], primaryGoal: 'Better Energy', secondaryGoals: [],
  wearablePreference: 'later', careTrack: 'Foundational Recovery Care', assignedConsultantId: null,
  assignedConsultant: null, calendarProvider: 'None', calendarPermissionGranted: false,
  notificationPermissionGranted: false, createdAtISO: new Date().toISOString()
});

const deriveCareTrack = (items: HealthCondition[], goal: HealthGoal | null) => {
  if (items.some((item) => item === 'Diabetes' || item === 'Prediabetes') || goal === 'Sugar Control') return 'Blood Sugar Recovery Care';
  if (items.some((item) => item === 'PCOS' || item === 'Thyroid') || goal === 'Hormone Balance') return 'Hormone Balance Care';
  if (items.includes('Gut Health')) return 'Digestive & Metabolic Care';
  return 'Foundational Recovery Care';
};

export const OnboardingBasicsScreen = ({ navigation }: Props) => {
  const { onboarding, setOnboarding, setWearableSetupCompleted } = useAppContext();
  const seed = useMemo(() => onboarding ?? baseProfile(), [onboarding]);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [dob, setDob] = useState(seed.dateOfBirthISO ? new Date(seed.dateOfBirthISO) : new Date(1996, 0, 1));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState<AssessmentGender>(seed.gender ?? 'Prefer not to say');
  const [selectedGoals, setSelectedGoals] = useState<HealthGoal[]>(seed.healthGoals ?? []);
  const [selectedConditions, setSelectedConditions] = useState<HealthCondition[]>(seed.primaryConditions ?? []);

  const goBack = () => {
    if (step > 1) { setDirection('back'); setStep((value) => value - 1); return; }
    if (navigation.canGoBack()) navigation.goBack();
  };
  const next = () => {
    if (step < 4) { setDirection('forward'); setStep((value) => value + 1); return; }
    const primaryGoal = selectedGoals[0] ?? null;
    setOnboarding(normalizeOnboardingProfile({
      ...seed, name: seed.name.trim() || 'Member', dateOfBirthISO: dob.toISOString(), gender,
      primaryConditions: selectedConditions, healthGoals: selectedGoals, primaryGoal: primaryGoal ?? undefined,
      secondaryGoals: primaryGoal ? selectedGoals.slice(1) : [], wellnessGoal: primaryGoal ?? seed.wellnessGoal,
      careTrack: deriveCareTrack(selectedConditions, primaryGoal), createdAtISO: seed.createdAtISO || new Date().toISOString()
    }));
    setWearableSetupCompleted(false);
    navigation.navigate('FoodPreferences', { mode: 'onboarding' });
  };
  const onDob = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'set' && date) setDob(date);
  };

  return (
    <OnboardingShell key={step} phase="BASICS" step={step} total={4} onBack={step === 1 ? undefined : goBack} direction={direction} action={<OnboardingAction title={step === 1 ? 'Start setup' : 'Continue'} onPress={next} />}>
      {step === 1 ? <Intro /> : null}
      {step === 2 ? <View><QuestionHeader title="Basic profile" description="Used to calculate your personal health baselines and safe targets." />
        <Text style={styles.label}>DATE OF BIRTH</Text>
        <Pressable accessibilityRole="button" style={styles.field} onPress={() => setShowDatePicker(true)}><Text style={styles.fieldText}>{dob.toLocaleDateString('en-GB')}</Text><Ionicons name="calendar-outline" size={20} color={colors.textPrimary} /></Pressable>
        {showDatePicker ? <DateTimePicker value={dob} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} maximumDate={new Date()} onChange={onDob} /> : null}
        <Text style={styles.label}>GENDER</Text><View style={styles.list}>{genders.map((item) => <ChoiceCard key={item} label={item} selected={gender === item} onPress={() => setGender(item)} />)}</View>
      </View> : null}
      {step === 3 ? <View><QuestionHeader title="What are your wellness goals?" description="Select all that apply. Your first choice becomes your primary focus." /><View style={styles.list}>{goals.map((item) => <ChoiceCard key={item} label={item === 'Weight Loss' ? 'Weight Management' : item} description={selectedGoals[0] === item ? 'Primary' : undefined} selected={selectedGoals.includes(item)} accent="#FFBE25" onPress={() => setSelectedGoals((current) => current.includes(item) ? current.filter((goal) => goal !== item) : [...current, item])} />)}</View></View> : null}
      {step === 4 ? <View><QuestionHeader title="Existing health conditions" description="Helps us keep recommendations safe and relevant for you." /><View style={styles.list}>{conditions.map((item) => <ChoiceCard key={item} label={item} selected={selectedConditions.includes(item)} onPress={() => setSelectedConditions((current) => current.includes(item) ? current.filter((condition) => condition !== item) : [...current, item])} />)}</View></View> : null}
    </OnboardingShell>
  );
};

const Intro = () => <View style={styles.intro}>
  <View style={styles.heroIcon}><Ionicons name="person-circle-outline" size={38} color="#06100B" /></View>
  <Text style={styles.introTitle}>Let's personalise your{`\n`}recovery journey</Text>
  <Text style={styles.introBody}>Answer a few questions and Fiteatsy will build a health profile tailored to you.</Text>
  <View style={styles.list}>
    <ChoiceCard icon="locate-outline" label="Better recommendations" selected={false} onPress={() => undefined} />
    <ChoiceCard icon="pulse-outline" label="Safer health targets" selected={false} onPress={() => undefined} accent={colors.blue} />
    <ChoiceCard icon="person-outline" label="More relevant consultant support" selected={false} onPress={() => undefined} accent="#A78BFA" />
  </View>
  <Text style={styles.support}>Takes about 4 minutes · Your data stays private</Text>
</View>;

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  label: { ...typography.label, fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.md },
  field: { minHeight: 52, borderWidth: 1, borderColor: colors.success, borderRadius: radius.lg, backgroundColor: colors.cardMuted, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldText: { ...typography.bodyStrong, fontSize: 14, color: colors.textPrimary },
  intro: { alignItems: 'center', paddingTop: spacing.xl },
  heroIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#42DDB5', marginBottom: spacing.xl },
  introTitle: { ...typography.sectionTitle, fontSize: 20, lineHeight: 26, textAlign: 'center', color: colors.textPrimary },
  introBody: { ...typography.body, fontSize: 14, lineHeight: 20, textAlign: 'center', color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xl, maxWidth: 360 },
  support: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: spacing.xl }
});
