import React, { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChoiceCard, OnboardingAction, OnboardingShell, QuestionHeader } from '../../components/onboarding/OnboardingShell';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { AssessmentMood, AssessmentPhysicalDistress, AssessmentSleepQuality } from '../../types';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingAssessment'>;
type Activity = 'Mostly seated' | 'Lightly active' | 'Moderately active' | 'Very active' | 'Athlete / intense training';

const activities: Array<{ value: Activity; description: string }> = [
  { value: 'Mostly seated', description: 'Desk job, minimal movement' },
  { value: 'Lightly active', description: 'Short walks, light daily movement' },
  { value: 'Moderately active', description: 'Regular exercise 3–4× per week' },
  { value: 'Very active', description: 'Active job or daily intense exercise' },
  { value: 'Athlete / intense training', description: 'Competitive or professional training' }
];
const sleepOptions = [
  { label: '<5h', hours: 4, quality: 'Worst' as AssessmentSleepQuality },
  { label: '5–6h', hours: 5.5, quality: 'Poor' as AssessmentSleepQuality },
  { label: '6–7h', hours: 6.5, quality: 'Fair' as AssessmentSleepQuality },
  { label: '7–8h', hours: 7.5, quality: 'Good' as AssessmentSleepQuality },
  { label: '8h+', hours: 8.5, quality: 'Excellent' as AssessmentSleepQuality }
];
const moods: Array<{ label: string; value: AssessmentMood; emoji: string; copy: string }> = [
  { label: 'Low', value: 'Low', emoji: '😔', copy: 'A gentler recovery pace may help today' },
  { label: 'Flat', value: 'Low', emoji: '😐', copy: 'Energy feels muted today' },
  { label: 'Neutral', value: 'Neutral', emoji: '🙂', copy: 'Feeling steady and balanced' },
  { label: 'Good', value: 'Positive', emoji: '😊', copy: 'Feeling positive and capable' },
  { label: 'Positive', value: 'Positive', emoji: '😁', copy: 'Strong positive energy today' }
];
const stressCopy: Record<number, string> = { 1: 'Feeling calm and settled', 2: 'Light pressure, comfortably manageable', 3: 'Some tension, still manageable', 4: 'Noticeable tension affecting wellbeing', 5: 'Feeling overwhelmed and needing support' };

export const OnboardingAssessmentScreen = ({ navigation, route }: Props) => {
  const { onboarding, setOnboarding, setAssessment, submitCheckIn, setMood } = useAppContext();
  const recoveryStart = route.params?.startPhase === 'recovery';
  const lifestyleSeed = route.params?.lifestyle;
  const [step, setStep] = useState(recoveryStart ? 5 : 1);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [heightCm, setHeightCm] = useState(lifestyleSeed?.heightCm ?? onboarding?.heightCm ?? 170);
  const [weightKg, setWeightKg] = useState(lifestyleSeed?.weightKg ?? onboarding?.currentWeightKg ?? 68);
  const [unit, setUnit] = useState<'kg' | 'lbs'>('kg');
  const [activity, setActivity] = useState<Activity>((lifestyleSeed?.activityLevel as Activity) ?? (onboarding?.activityLevel as Activity) ?? 'Lightly active');
  const [sleep, setSleep] = useState(sleepOptions.find((item) => item.hours === lifestyleSeed?.sleepHours) ?? sleepOptions.find((item) => item.hours === onboarding?.sleepHours) ?? sleepOptions[3]);
  const [moodChoice, setMoodChoice] = useState(moods.find((item) => item.value === 'Neutral') ?? moods[2]);
  const [stress, setStress] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [distress, setDistress] = useState<AssessmentPhysicalDistress>('No');
  const [support, setSupport] = useState<'Yes' | 'No'>('No');
  const total = 8;
  const phase = step <= 4 ? 'LIFESTYLE' : 'RECOVERY';
  const phaseStep = step <= 4 ? step : step - 4;
  const valueOpacity = useRef(new Animated.Value(1)).current;

  const changeMetric = (setter: React.Dispatch<React.SetStateAction<number>>, current: number, next: number, min: number, max: number) => {
    const value = Math.max(min, Math.min(max, next));
    Animated.sequence([Animated.timing(valueOpacity, { toValue: 0.35, duration: 70, useNativeDriver: true }), Animated.timing(valueOpacity, { toValue: 1, duration: 110, useNativeDriver: true })]).start();
    setter(value);
  };
  const back = () => {
    if (recoveryStart && step === 5) { navigation.goBack(); return; }
    if (step > 1) { setDirection('back'); setStep((value) => value - 1); return; }
    navigation.goBack();
  };
  const next = () => {
    if (step < 4) { setDirection('forward'); setStep((value) => value + 1); return; }
    if (step === 4) {
      navigation.navigate('FoodPreferences', {
        mode: 'onboarding',
        lifestyle: { heightCm, weightKg, activityLevel: activity, sleepHours: sleep.hours, sleepQuality: sleep.quality }
      });
      return;
    }
    if (step < total) { setDirection('forward'); setStep((value) => value + 1); return; }
    const completedAtISO = new Date().toISOString();
    if (onboarding) setOnboarding({ ...onboarding, heightCm, currentWeightKg: weightKg, activityLevel: activity, sleepHours: sleep.hours, sleepQualityLabel: sleep.quality, stressLevelLabel: `${stress}` });
    setAssessment({ completedAtISO, goal: 'Reduce Stress', gender: onboarding?.gender, age: onboarding?.calculatedAge ?? onboarding?.age, heightCm, weightKg, mood: moodChoice.value, soughtHelpBefore: support, physicalDistress: distress, sleepQuality: sleep.quality, stressLevel: stress, voiceReflection: '' });
    const moodScore = moodChoice.value === 'Positive' ? 5 : moodChoice.value === 'Neutral' ? 3 : 2;
    const sleepScore = sleep.quality === 'Excellent' ? 5 : sleep.quality === 'Good' ? 4 : sleep.quality === 'Fair' ? 3 : sleep.quality === 'Poor' ? 2 : 1;
    void submitCheckIn({ mood: moodScore as 1 | 2 | 3 | 4 | 5, energy: Math.max(1, 6 - stress) as 1 | 2 | 3 | 4 | 5, sleepQuality: sleepScore as 1 | 2 | 3 | 4 | 5, stressLevel: stress });
    setMood(moodScore >= 4 ? '🙂' : moodScore === 3 ? '😐' : '☹️');
    navigation.navigate('SyncWearable');
  };

  return <OnboardingShell key={step} phase={phase} step={phaseStep} total={4} onBack={back} direction={direction} action={<OnboardingAction title="Continue" onPress={next} />}>
    {step === 1 ? <Metric title="What is your height?" description="Used to estimate your metabolic rate and ideal weight range." value={heightCm} suffix="cm" onMinus={() => changeMetric(setHeightCm, heightCm, heightCm - 1, 130, 220)} onPlus={() => changeMetric(setHeightCm, heightCm, heightCm + 1, 130, 220)} opacity={valueOpacity} /> : null}
    {step === 2 ? <View><QuestionHeader title="What is your weight?" description="Used to personalise your nutrition and activity targets." /><Segment values={['kg', 'lbs']} selected={unit} onSelect={(value) => setUnit(value as 'kg' | 'lbs')} /><MetricCore value={unit === 'kg' ? weightKg : Math.round(weightKg * 2.20462)} suffix={unit} onMinus={() => changeMetric(setWeightKg, weightKg, weightKg - 1, 35, 220)} onPlus={() => changeMetric(setWeightKg, weightKg, weightKg + 1, 35, 220)} opacity={valueOpacity} /></View> : null}
    {step === 3 ? <View><QuestionHeader title="How active are you?" description="We use this to set your calorie and recovery targets." /><View style={styles.list}>{activities.map((item) => <ChoiceCard key={item.value} label={item.value} description={item.description} selected={activity === item.value} accent="#FF8A35" onPress={() => setActivity(item.value)} />)}</View></View> : null}
    {step === 4 ? <View><QuestionHeader title="Typical sleep duration?" description="Sleep affects every aspect of recovery, metabolism, and mood." /><View style={styles.sleepRow}>{sleepOptions.map((item) => <Pressable accessibilityRole="radio" accessibilityState={{ selected: sleep.label === item.label }} key={item.label} onPress={() => setSleep(item)} style={[styles.sleepCard, sleep.label === item.label && styles.sleepActive]}><Ionicons name="moon-outline" size={22} color={sleep.label === item.label ? '#62A8FF' : colors.textPrimary} /><Text style={[styles.sleepText, sleep.label === item.label && styles.sleepTextActive]}>{item.label}</Text></Pressable>)}</View><Text style={styles.insight}>•  Most adults need 7–9 hours for optimal recovery</Text></View> : null}
    {step === 5 ? <View><QuestionHeader title="How’s your mood today?" description="Mood patterns help us personalise your recovery and energy insights." /><View style={styles.moodRow}>{moods.map((item) => <Pressable accessibilityRole="radio" accessibilityState={{ selected: moodChoice.label === item.label }} key={item.label} onPress={() => setMoodChoice(item)} style={[styles.moodCard, moodChoice.label === item.label && styles.moodActive]}><Text style={styles.emoji}>{item.emoji}</Text><Text style={styles.moodText}>{item.label}</Text></Pressable>)}</View><Text style={[styles.insight, styles.greenInsight]}>{moodChoice.copy}</Text></View> : null}
    {step === 6 ? <View><QuestionHeader title="How stressed do you feel lately?" description="Stress affects sleep, digestion, and hormonal balance." /><View style={styles.scaleRow}>{([1,2,3,4,5] as const).map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ selected: stress === item }} onPress={() => setStress(item)} style={[styles.scale, stress === item && styles.scaleActive]}><Text style={[styles.scaleText, stress === item && styles.scaleTextActive]}>{item}</Text></Pressable>)}</View><View style={styles.endLabels}><Text style={styles.caption}>Very calm</Text><Text style={styles.caption}>Overwhelmed</Text></View><Text style={[styles.insight, styles.purpleInsight]}>{stressCopy[stress]}</Text></View> : null}
    {step === 7 ? <View><QuestionHeader title="Are you experiencing discomfort today?" description="Optional — helps us flag activities or foods to approach carefully." /><View style={styles.binary}><ChoiceCard label="None" selected={distress === 'No'} accent="#FF8A35" onPress={() => setDistress('No')} /><ChoiceCard label="Some discomfort" selected={distress === 'Yes'} accent="#FF8A35" onPress={() => setDistress('Yes')} /></View></View> : null}
    {step === 8 ? <View><QuestionHeader title="Are you receiving professional support?" description="We'll tailor recommendations to complement your existing care." /><View style={styles.binary}><ChoiceCard label="Yes" selected={support === 'Yes'} accent="#35D7D2" onPress={() => setSupport('Yes')} /><ChoiceCard label="No" selected={support === 'No'} accent="#35D7D2" onPress={() => setSupport('No')} /></View></View> : null}
  </OnboardingShell>;
};

const Metric = ({ title, description, ...props }: { title: string; description: string; value: number; suffix: string; onMinus: () => void; onPlus: () => void; opacity: Animated.Value }) => <View><QuestionHeader title={title} description={description} /><MetricCore {...props} /></View>;
const MetricCore = ({ value, suffix, onMinus, onPlus, opacity }: { value: number; suffix: string; onMinus: () => void; onPlus: () => void; opacity: Animated.Value }) => <View style={styles.metricWrap}><Animated.Text style={[styles.metric, { opacity }]}>{value} <Text style={styles.metricSuffix}>{suffix}</Text></Animated.Text><View style={styles.ruler}><View style={styles.marker} />{Array.from({ length: 17 }, (_, index) => <View key={index} style={[styles.tick, index % 4 === 0 && styles.majorTick]} />)}</View><View style={styles.metricButtons}><Pressable accessibilityRole="button" accessibilityLabel="Decrease value" onPress={onMinus} style={styles.metricButton}><Text style={styles.metricButtonText}>−</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Increase value" onPress={onPlus} style={styles.metricButton}><Text style={styles.metricButtonText}>+</Text></Pressable></View></View>;
const Segment = ({ values, selected, onSelect }: { values: string[]; selected: string; onSelect: (value: string) => void }) => <View style={styles.segment}>{values.map((value) => <Pressable key={value} onPress={() => onSelect(value)} style={[styles.segmentItem, selected === value && styles.segmentActive]}><Text style={[styles.segmentText, selected === value && styles.segmentTextActive]}>{value}</Text></Pressable>)}</View>;

const styles = StyleSheet.create({
  list: { gap: spacing.sm }, binary: { gap: spacing.sm },
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: colors.stroke, borderRadius: radius.lg, backgroundColor: colors.cardMuted, padding: 4 },
  segmentItem: { flex: 1, minHeight: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, segmentActive: { backgroundColor: '#49DF86' },
  segmentText: { ...typography.bodyStrong, color: colors.textSecondary }, segmentTextActive: { color: '#07120D' },
  metricWrap: { alignItems: 'center', paddingTop: spacing.xl }, metric: { ...typography.metric, fontSize: 32, lineHeight: 40, color: colors.textPrimary }, metricSuffix: { fontSize: 16, color: colors.success },
  ruler: { height: 100, width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', position: 'relative', marginVertical: spacing.lg },
  marker: { position: 'absolute', left: '50%', bottom: 0, width: 3, height: 88, borderRadius: 2, backgroundColor: colors.success },
  tick: { width: 2, height: 20, backgroundColor: colors.stroke }, majorTick: { height: 36, backgroundColor: colors.textSecondary },
  metricButtons: { flexDirection: 'row', gap: 32 }, metricButton: { width: 52, height: 52, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.cardMuted, alignItems: 'center', justifyContent: 'center' }, metricButtonText: { ...typography.sectionTitle, fontSize: 20, color: colors.textPrimary },
  sleepRow: { flexDirection: 'row', gap: 6 }, sleepCard: { flex: 1, minHeight: 78, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.cardMuted, alignItems: 'center', justifyContent: 'center', gap: spacing.xs }, sleepActive: { borderColor: '#62A8FF', backgroundColor: '#62A8FF12' }, sleepText: { ...typography.label, fontSize: 12, color: colors.textSecondary }, sleepTextActive: { color: '#62A8FF' },
  insight: { ...typography.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: spacing.xl, borderWidth: 1, borderColor: colors.stroke, borderRadius: radius.lg, padding: spacing.md, backgroundColor: colors.cardMuted }, greenInsight: { color: colors.success, borderColor: '#1D5038' }, purpleInsight: { color: '#B394FF', borderColor: '#3C315F' },
  moodRow: { flexDirection: 'row', gap: 6 }, moodCard: { flex: 1, minHeight: 90, borderWidth: 1, borderColor: colors.stroke, borderRadius: radius.lg, backgroundColor: colors.cardMuted, alignItems: 'center', justifyContent: 'center', gap: spacing.xs }, moodActive: { borderColor: colors.success, backgroundColor: '#49DF8612' }, emoji: { fontSize: 24 }, moodText: { ...typography.caption, fontSize: 11, color: colors.textSecondary },
  scaleRow: { flexDirection: 'row', gap: spacing.sm }, scale: { flex: 1, minHeight: 52, borderWidth: 1, borderColor: colors.stroke, borderRadius: radius.lg, backgroundColor: colors.cardMuted, alignItems: 'center', justifyContent: 'center' }, scaleActive: { borderColor: '#A78BFA', backgroundColor: '#A78BFA12' }, scaleText: { ...typography.bodyStrong, color: colors.textSecondary }, scaleTextActive: { color: '#B394FF' },
  endLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm }, caption: { ...typography.caption, fontSize: 12, color: colors.textSecondary }
});
