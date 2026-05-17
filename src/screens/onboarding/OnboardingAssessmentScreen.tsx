import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, radius, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import {
  AssessmentGender,
  AssessmentGoal,
  AssessmentMood,
  AssessmentPhysicalDistress,
  AssessmentSleepQuality
} from '../../types';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingAssessment'>;

type VoiceAnalysis = {
  title: string;
  summary: string;
  moodLabel: string;
  confidence: string;
};

const BRAND_GREEN = '#60AF00';
const goals: AssessmentGoal[] = ['Reduce Stress', 'Try AI Therapy', 'Cope With Trauma', 'Become Better'];
const genders: AssessmentGender[] = ['Male', 'Female', 'Prefer not to say'];
const moods: { value: AssessmentMood; label: string; emoji: string }[] = [
  { value: 'Low', label: 'Low', emoji: '☹️' },
  { value: 'Neutral', label: 'Neutral', emoji: '😐' },
  { value: 'Positive', label: 'Positive', emoji: '🙂' }
];
const sleepQualityLevels: AssessmentSleepQuality[] = ['Excellent', 'Good', 'Fair', 'Poor', 'Worst'];

const AGE_MIN = 16;
const AGE_MAX = 80;
const AGE_ITEM_HEIGHT = 52;
const WEIGHT_MIN = 40;
const WEIGHT_MAX = 160;
const WEIGHT_TICK_WIDTH = 14;
const DEFAULT_VOICE_REFLECTION = 'I believe in myself and my progress.';

const moodToScore = (mood: AssessmentMood): 1 | 2 | 3 | 4 | 5 => {
  if (mood === 'Positive') return 5;
  if (mood === 'Neutral') return 3;
  return 2;
};

const sleepToScore = (quality: AssessmentSleepQuality): 1 | 2 | 3 | 4 | 5 => {
  const map: Record<AssessmentSleepQuality, 1 | 2 | 3 | 4 | 5> = {
    Excellent: 5,
    Good: 4,
    Fair: 3,
    Poor: 2,
    Worst: 1
  };
  return map[quality];
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const createVoiceAnalysis = ({
  mood,
  stressLevel,
  sleepQuality,
  physicalDistress,
  soughtHelpBefore
}: {
  mood: AssessmentMood;
  stressLevel: 1 | 2 | 3 | 4 | 5;
  sleepQuality: AssessmentSleepQuality;
  physicalDistress: AssessmentPhysicalDistress;
  soughtHelpBefore: 'Yes' | 'No';
}): VoiceAnalysis => {
  const confidence = stressLevel <= 2 ? 'High confidence' : stressLevel === 3 ? 'Balanced confidence' : 'Supportive watch mode';

  if (mood === 'Positive' && stressLevel <= 2 && sleepQuality !== 'Poor' && sleepQuality !== 'Worst') {
    return {
      title: 'Steady and optimistic',
      summary: 'Your tone feels uplifted and stable. Recovery signals look healthy, so your voice suggests good emotional readiness for the day.',
      moodLabel: 'Positive mood signature',
      confidence
    };
  }

  if (mood === 'Low' || stressLevel >= 4 || physicalDistress === 'Yes') {
    return {
      title: 'Needs gentler pacing',
      summary: soughtHelpBefore === 'Yes'
        ? 'Your voice pattern sounds tense and a bit heavy. Fiteatsy would recommend a slower day structure, hydration, and one short recovery break before intense work.'
        : 'Your voice pattern sounds strained. Fiteatsy would recommend a slower day structure, a breathing break, and one supportive check-in later today.',
      moodLabel: 'Elevated stress signature',
      confidence
    };
  }

  return {
    title: 'Calm with mild load',
    summary: 'Your voice sounds mostly steady with a small amount of pressure underneath. You look functional today, but short recovery moments will help protect focus and mood.',
    moodLabel: 'Neutral mood signature',
    confidence
  };
};

export const OnboardingAssessmentScreen = ({ navigation }: Props) => {
  const { setAssessment, submitCheckIn, setMood } = useAppContext();
  const { width } = useWindowDimensions();

  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<AssessmentGoal>('Reduce Stress');
  const [gender, setGender] = useState<AssessmentGender>('Male');
  const [age, setAge] = useState(28);
  const [weightKg, setWeightKg] = useState(68);
  const [unit, setUnit] = useState<'kg' | 'lbs'>('kg');
  const [mood, setAssessmentMood] = useState<AssessmentMood>('Neutral');
  const [soughtHelpBefore, setSoughtHelpBefore] = useState<'Yes' | 'No'>('No');
  const [physicalDistress, setPhysicalDistress] = useState<AssessmentPhysicalDistress>('No');
  const [sleepQuality, setSleepQuality] = useState<AssessmentSleepQuality>('Good');
  const [stressLevel, setStressLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceReflection, setVoiceReflection] = useState(DEFAULT_VOICE_REFLECTION);
  const [voiceAnalysis, setVoiceAnalysis] = useState<VoiceAnalysis | null>(null);

  const ageValues = useMemo(() => Array.from({ length: AGE_MAX - AGE_MIN + 1 }, (_, i) => AGE_MIN + i), []);
  const weightValues = useMemo(() => Array.from({ length: WEIGHT_MAX - WEIGHT_MIN + 1 }, (_, i) => WEIGHT_MIN + i), []);
  const pulse = useRef(new Animated.Value(1)).current;
  const micScale = useRef(new Animated.Value(1)).current;
  const ageRef = useRef<ScrollView>(null);
  const weightRef = useRef<ScrollView>(null);
  const rulerSidePadding = Math.max(16, (width - 32) / 2);
  const ageIndex = age - AGE_MIN;
  const weightIndex = weightKg - WEIGHT_MIN;

  const weightDisplay = useMemo(() => {
    if (unit === 'kg') return `${weightKg} kg`;
    return `${Math.round(weightKg * 2.20462)} lbs`;
  }, [unit, weightKg]);

  const totalSteps = 10;
  const isLast = step === totalSteps;

  const stressCopy = useMemo(() => {
    if (stressLevel <= 2) return 'You look calm today.';
    if (stressLevel === 3) return 'Mild pressure, manageable.';
    return 'High pressure day. We will support you.';
  }, [stressLevel]);

  const selectedSleepIndex = sleepQualityLevels.indexOf(sleepQuality);

  const animatePulse = () => {
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1.03, duration: 120, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 120, useNativeDriver: true })
    ]).start();
  };

  useEffect(() => {
    if (step === 3) {
      const id = setTimeout(() => {
        ageRef.current?.scrollTo({ y: ageIndex * AGE_ITEM_HEIGHT, animated: false });
      }, 40);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [step, ageIndex]);

  useEffect(() => {
    if (step === 4) {
      const id = setTimeout(() => {
        weightRef.current?.scrollTo({ x: weightIndex * WEIGHT_TICK_WIDTH, animated: false });
      }, 40);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [step, weightIndex]);

  const onAgeScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const rawIndex = Math.round(event.nativeEvent.contentOffset.y / AGE_ITEM_HEIGHT);
    setAge(ageValues[clamp(rawIndex, 0, ageValues.length - 1)]);
  };

  const onWeightScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const rawIndex = Math.round(event.nativeEvent.contentOffset.x / WEIGHT_TICK_WIDTH);
    setWeightKg(weightValues[clamp(rawIndex, 0, weightValues.length - 1)]);
  };

  const startVoiceCapture = () => {
    setIsRecordingVoice(true);
    setVoiceAnalysis(null);
    Animated.loop(
      Animated.sequence([
        Animated.timing(micScale, { toValue: 1.08, duration: 260, useNativeDriver: true }),
        Animated.timing(micScale, { toValue: 1, duration: 260, useNativeDriver: true })
      ])
    ).start();
  };

  const stopVoiceCapture = () => {
    if (!isRecordingVoice) {
      return;
    }

    micScale.stopAnimation(() => {
      micScale.setValue(1);
    });
    setIsRecordingVoice(false);
    setVoiceReflection(DEFAULT_VOICE_REFLECTION);
    setVoiceAnalysis(
      createVoiceAnalysis({
        mood,
        stressLevel,
        sleepQuality,
        physicalDistress,
        soughtHelpBefore
      })
    );
  };

  const continueNext = () => {
    if (!isLast) {
      setStep((current) => current + 1);
      return;
    }

    const completedAtISO = new Date().toISOString();
    setAssessment({
      completedAtISO,
      goal,
      gender,
      age,
      weightKg,
      mood,
      soughtHelpBefore,
      physicalDistress,
      sleepQuality,
      stressLevel,
      voiceReflection
    });

    const moodScore = moodToScore(mood);
    const sleepScore = sleepToScore(sleepQuality);
    const energyScore = Math.max(1, Math.min(5, 6 - stressLevel)) as 1 | 2 | 3 | 4 | 5;

    submitCheckIn({ mood: moodScore, energy: energyScore, sleepQuality: sleepScore });
    setMood(moodScore >= 4 ? '🙂' : moodScore === 3 ? '😐' : '☹️');

    navigation.reset({ index: 0, routes: [{ name: 'OnboardingBasics' }] });
  };

  return (
    <Screen>
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Pressable
            style={styles.backBtn}
            onPress={() => {
              if (step > 1) {
                setStep((current) => current - 1);
                return;
              }
              navigation.goBack();
            }}
          >
            <Text style={styles.backBtnText}>{'<'}</Text>
          </Pressable>
          <Text style={styles.title}>Assessment</Text>
          <Text style={styles.progress}>{step} of {totalSteps}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {step === 1 ? (
            <View>
              <Text style={styles.question}>What’s your health goal for today?</Text>
              <View style={styles.list}>
                {goals.map((item) => {
                  const active = goal === item;
                  return (
                    <Pressable
                      key={item}
                      style={[styles.optionRow, active && styles.optionRowActive]}
                      onPress={() => {
                        setGoal(item);
                        animatePulse();
                      }}
                    >
                      <View style={[styles.radioDot, active && styles.radioDotActive]} />
                      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{item}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {step === 2 ? (
            <View>
              <Text style={styles.question}>What’s your official gender?</Text>
              <View style={styles.list}>
                {genders.map((item) => {
                  const active = gender === item;
                  return (
                    <Pressable
                      key={item}
                      style={[styles.optionRow, active && styles.optionRowActive]}
                      onPress={() => {
                        setGender(item);
                        animatePulse();
                      }}
                    >
                      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{item}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {step === 3 ? (
            <View>
              <Text style={styles.question}>What’s your age?</Text>
              <View style={styles.ageWheelWrap}>
                <ScrollView
                  ref={ageRef}
                  showsVerticalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={AGE_ITEM_HEIGHT}
                  contentContainerStyle={styles.ageListContent}
                  onMomentumScrollEnd={onAgeScrollEnd}
                >
                  {ageValues.map((item) => {
                    const selected = item === age;
                    return (
                      <View key={`age-${item}`} style={styles.ageItem}>
                        <Text style={[styles.ageText, selected && styles.ageTextActive]}>{item}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
                <View pointerEvents="none" style={styles.ageSelectionBand} />
              </View>
            </View>
          ) : null}

          {step === 4 ? (
            <View>
              <Text style={styles.question}>What’s your weight?</Text>
              <View style={styles.unitRow}>
                <Pressable style={[styles.unitChip, unit === 'kg' && styles.unitChipActive]} onPress={() => setUnit('kg')}>
                  <Text style={[styles.unitChipText, unit === 'kg' && styles.unitChipTextActive]}>kg</Text>
                </Pressable>
                <Pressable style={[styles.unitChip, unit === 'lbs' && styles.unitChipActive]} onPress={() => setUnit('lbs')}>
                  <Text style={[styles.unitChipText, unit === 'lbs' && styles.unitChipTextActive]}>lbs</Text>
                </Pressable>
              </View>

              <View style={styles.weightCard}>
                <Text style={styles.bigNumber}>{weightDisplay}</Text>
                <View style={styles.rulerWrap}>
                  <ScrollView
                    ref={weightRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    snapToInterval={WEIGHT_TICK_WIDTH}
                    contentContainerStyle={{ paddingHorizontal: rulerSidePadding }}
                    onMomentumScrollEnd={onWeightScrollEnd}
                  >
                    {weightValues.map((item) => {
                      const selected = item === weightKg;
                      const major = item % 5 === 0;
                      return (
                        <View key={`wt-${item}`} style={styles.tickItem}>
                          <View style={[styles.tick, major && styles.tickMajor, selected && styles.tickSelected]} />
                          {major ? <Text style={styles.tickLabel}>{item}</Text> : <View style={styles.tickLabelSpacer} />}
                        </View>
                      );
                    })}
                  </ScrollView>
                  <View pointerEvents="none" style={styles.rulerIndicator} />
                </View>
              </View>
            </View>
          ) : null}

          {step === 5 ? (
            <View>
              <Text style={styles.question}>How would you describe your mood?</Text>
              <View style={styles.rowWrap}>
                {moods.map((item) => {
                  const active = mood === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      style={[styles.moodCard, active && styles.moodCardActive]}
                      onPress={() => {
                        setAssessmentMood(item.value);
                        animatePulse();
                      }}
                    >
                      <Text style={styles.moodEmoji}>{item.emoji}</Text>
                      <Text style={[styles.moodLabel, active && styles.optionLabelActive]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {step === 6 ? (
            <View>
              <Text style={styles.question}>Have you sought professional help before?</Text>
              <View style={styles.binaryRow}>
                <Pressable style={[styles.binaryOption, soughtHelpBefore === 'Yes' && styles.binaryOptionActive]} onPress={() => setSoughtHelpBefore('Yes')}>
                  <Text style={[styles.optionLabel, soughtHelpBefore === 'Yes' && styles.optionLabelActive]}>Yes</Text>
                </Pressable>
                <Pressable style={[styles.binaryOption, soughtHelpBefore === 'No' && styles.binaryOptionActive]} onPress={() => setSoughtHelpBefore('No')}>
                  <Text style={[styles.optionLabel, soughtHelpBefore === 'No' && styles.optionLabelActive]}>No</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {step === 7 ? (
            <View>
              <Text style={styles.question}>Are you experiencing any physical distress?</Text>
              <View style={styles.binaryRow}>
                <Pressable style={[styles.binaryOption, physicalDistress === 'Yes' && styles.binaryOptionActive]} onPress={() => setPhysicalDistress('Yes')}>
                  <Text style={[styles.optionLabel, physicalDistress === 'Yes' && styles.optionLabelActive]}>Yes, one or multiple</Text>
                </Pressable>
                <Pressable style={[styles.binaryOption, physicalDistress === 'No' && styles.binaryOptionActive]} onPress={() => setPhysicalDistress('No')}>
                  <Text style={[styles.optionLabel, physicalDistress === 'No' && styles.optionLabelActive]}>No physical pain at all</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {step === 8 ? (
            <View>
              <Text style={styles.question}>How would you rate your sleep quality?</Text>
              <View style={styles.sleepRailWrap}>
                {sleepQualityLevels.map((item, index) => {
                  const active = sleepQuality === item;
                  const hint = index === 0 ? '7+ hrs' : index === 1 ? '6-7 hrs' : index === 2 ? '5-6 hrs' : index === 3 ? '3-4 hrs' : '<3 hrs';
                  return (
                    <Pressable key={item} style={styles.sleepRow} onPress={() => setSleepQuality(item)}>
                      <Text style={[styles.sleepLabel, active && styles.sleepLabelActive]}>{item}</Text>
                      <View style={styles.sleepDotTrack}>
                        <View style={[styles.sleepDot, active && styles.sleepDotActive]} />
                      </View>
                      <Text style={[styles.sleepHint, active && styles.sleepHintActive]}>{hint}</Text>
                    </Pressable>
                  );
                })}
                <View style={[styles.sleepActiveBar, { top: selectedSleepIndex * 52 + 14 }]} />
              </View>
            </View>
          ) : null}

          {step === 9 ? (
            <View>
              <Text style={styles.question}>How would you rate your stress level?</Text>
              <Text style={styles.stressValue}>{stressLevel}</Text>
              <View style={styles.stressRow}>
                {[1, 2, 3, 4, 5].map((value) => {
                  const level = value as 1 | 2 | 3 | 4 | 5;
                  const active = stressLevel === level;
                  return (
                    <Pressable key={value} style={[styles.stressChip, active && styles.stressChipActive]} onPress={() => setStressLevel(level)}>
                      <Text style={[styles.stressChipText, active && styles.stressChipTextActive]}>{value}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.stressCopy}>{stressCopy}</Text>
            </View>
          ) : null}

          {step === 10 ? (
            <View>
              <Text style={styles.question}>AI Sound Analysis</Text>
              <View style={styles.voiceCard}>
                <Animated.View style={[styles.micButtonWrap, { transform: [{ scale: isRecordingVoice ? micScale : pulse }] }]}>
                  <Pressable
                    onPressIn={startVoiceCapture}
                    onPressOut={stopVoiceCapture}
                    style={[styles.micButton, isRecordingVoice && styles.micButtonActive]}
                  >
                    <Ionicons name="mic" size={34} color={colors.white} />
                  </Pressable>
                </Animated.View>
                <Text style={styles.voiceTitle}>{isRecordingVoice ? 'Listening...' : 'Hold the mic and say the statement'}</Text>
                <Text style={styles.voiceCopy}>“{voiceReflection}”</Text>

                {voiceAnalysis ? (
                  <View style={styles.voiceAnalysisCard}>
                    <View style={styles.voiceAnalysisHeader}>
                      <Text style={styles.voiceAnalysisTitle}>{voiceAnalysis.title}</Text>
                      <Text style={styles.voiceAnalysisConfidence}>{voiceAnalysis.confidence}</Text>
                    </View>
                    <Text style={styles.voiceAnalysisMood}>{voiceAnalysis.moodLabel}</Text>
                    <Text style={styles.voiceAnalysisSummary}>{voiceAnalysis.summary}</Text>
                  </View>
                ) : (
                  <Text style={styles.voiceHint}>Release the mic to let AI read your mood and recovery tone.</Text>
                )}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>

      <View style={styles.footer}>
        <PrimaryButton title={isLast ? 'Finish Assessment' : 'Continue'} onPress={continueNext} disabled={isLast && !voiceAnalysis} />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  body: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  footer: { paddingTop: 8, paddingBottom: 4 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10
  },
  backBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.29)'
  },
  backBtnText: { color: colors.textPrimary, fontSize: 18, lineHeight: 21 },
  title: { ...typography.bodyStrong, fontSize: 16 },
  progress: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginLeft: 'auto' },
  question: { ...typography.title, fontSize: 28, lineHeight: 34, marginBottom: 16 },
  list: { gap: 10, marginBottom: 20 },
  optionRow: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.29)',
    minHeight: 54,
    justifyContent: 'flex-start',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14
  },
  optionRowActive: { borderColor: BRAND_GREEN, backgroundColor: 'rgba(96,175,0,0.3)' },
  radioDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: '#C9CFD4' },
  radioDotActive: { borderColor: BRAND_GREEN, backgroundColor: BRAND_GREEN },
  optionLabel: { ...typography.body, fontSize: 14 },
  optionLabelActive: { color: colors.textPrimary, fontWeight: '700' },
  ageWheelWrap: {
    height: AGE_ITEM_HEIGHT * 5,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: 'rgba(0,0,0,0.29)',
    marginBottom: 20,
    overflow: 'hidden'
  },
  ageListContent: { paddingVertical: AGE_ITEM_HEIGHT * 2 },
  ageItem: { height: AGE_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  ageText: { ...typography.title, fontSize: 34, color: '#939393' },
  ageTextActive: { color: colors.textPrimary, fontSize: 46, lineHeight: 52 },
  ageSelectionBand: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: AGE_ITEM_HEIGHT * 2,
    height: AGE_ITEM_HEIGHT,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: BRAND_GREEN,
    backgroundColor: 'rgba(96,175,0,0.22)'
  },
  unitRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  unitChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.stroke,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.29)'
  },
  unitChipActive: { backgroundColor: BRAND_GREEN, borderColor: BRAND_GREEN },
  unitChipText: { ...typography.body, fontSize: 14 },
  unitChipTextActive: { color: '#FFFFFF', fontWeight: '700' },
  weightCard: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.29)',
    padding: 16,
    marginBottom: 20,
    alignItems: 'center'
  },
  bigNumber: { ...typography.title, fontSize: 44, lineHeight: 52, marginBottom: 12 },
  rulerWrap: { width: '100%', height: 82, justifyContent: 'center' },
  tickItem: { width: WEIGHT_TICK_WIDTH, alignItems: 'center' },
  tick: { width: 2, height: 18, borderRadius: 1, backgroundColor: '#939393' },
  tickMajor: { height: 28, backgroundColor: '#939393' },
  tickSelected: { backgroundColor: BRAND_GREEN },
  tickLabel: { ...typography.caption, fontSize: 10, marginTop: 4, color: '#939393' },
  tickLabelSpacer: { height: 16, marginTop: 4 },
  rulerIndicator: { position: 'absolute', alignSelf: 'center', width: 4, height: 46, borderRadius: 2, backgroundColor: BRAND_GREEN },
  rowWrap: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  moodCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: 'rgba(0,0,0,0.29)',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 6
  },
  moodCardActive: { borderColor: BRAND_GREEN, backgroundColor: 'rgba(96,175,0,0.28)' },
  moodEmoji: { fontSize: 26 },
  moodLabel: { ...typography.body, fontSize: 14 },
  binaryRow: { gap: 10, marginBottom: 20 },
  binaryOption: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: 'rgba(0,0,0,0.29)',
    paddingVertical: 14,
    paddingHorizontal: 12
  },
  binaryOptionActive: { borderColor: BRAND_GREEN, backgroundColor: 'rgba(96,175,0,0.28)' },
  sleepRailWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: 'rgba(0,0,0,0.29)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 20,
    position: 'relative'
  },
  sleepRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
  sleepLabel: { ...typography.body, fontSize: 16, width: 88, color: '#F5E1E1' },
  sleepLabelActive: { color: colors.textPrimary, fontWeight: '700' },
  sleepDotTrack: { width: 24, alignItems: 'center', justifyContent: 'center' },
  sleepDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#939393' },
  sleepDotActive: { backgroundColor: BRAND_GREEN },
  sleepHint: { ...typography.caption, fontSize: 12, color: '#939393', marginLeft: 8 },
  sleepHintActive: { color: '#509512' },
  sleepActiveBar: { position: 'absolute', right: 12, width: 4, height: 24, borderRadius: 3, backgroundColor: BRAND_GREEN },
  stressValue: { ...typography.title, fontSize: 72, lineHeight: 76, color: '#F5E1E1', textAlign: 'center', marginBottom: 8 },
  stressRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stressChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: 'rgba(0,0,0,0.29)'
  },
  stressChipActive: { borderColor: BRAND_GREEN, backgroundColor: BRAND_GREEN },
  stressChipText: { ...typography.bodyStrong, fontSize: 16 },
  stressChipTextActive: { color: '#FFFFFF' },
  stressCopy: { ...typography.body, color: '#939393' },
  voiceCard: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.29)',
    alignItems: 'center',
    padding: 20,
    gap: 14,
    marginBottom: 20
  },
  micButtonWrap: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  micButton: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#323232',
    shadowColor: '#8A7864',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5
  },
  micButtonActive: {
    backgroundColor: BRAND_GREEN
  },
  voiceTitle: {
    ...typography.bodyStrong,
    fontSize: 16,
    color: colors.textPrimary,
    textAlign: 'center'
  },
  voiceCopy: { ...typography.body, textAlign: 'center', fontSize: 14 },
  voiceHint: {
    ...typography.caption,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    color: colors.textSecondary
  },
  voiceAnalysisCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(96,175,0,0.24)',
    borderRadius: 20,
    backgroundColor: 'rgba(96,175,0,0.10)',
    padding: 16,
    gap: 8
  },
  voiceAnalysisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center'
  },
  voiceAnalysisTitle: {
    ...typography.bodyStrong,
    fontSize: 16,
    color: colors.textPrimary,
    flex: 1
  },
  voiceAnalysisConfidence: {
    ...typography.caption,
    color: '#509512'
  },
  voiceAnalysisMood: {
    ...typography.caption,
    fontSize: 13,
    color: '#F5E1E1'
  },
  voiceAnalysisSummary: {
    ...typography.body,
    color: colors.textPrimary
  }
});
