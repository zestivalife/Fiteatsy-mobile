import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppBackButton } from '../../components/AppBackButton';
import { NumericWheelPicker } from '../../components/NumericWheelPicker';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, getThemeColors, radius, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { AssessmentGoal, AssessmentMood, AssessmentPhysicalDistress, AssessmentSleepQuality } from '../../types';
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
const moods: { value: AssessmentMood; label: string; emoji: string }[] = [
  { value: 'Low', label: 'Low', emoji: '☹️' },
  { value: 'Neutral', label: 'Neutral', emoji: '😐' },
  { value: 'Positive', label: 'Positive', emoji: '🙂' }
];
const sleepQualityLevels: AssessmentSleepQuality[] = ['Excellent', 'Good', 'Fair', 'Poor', 'Worst'];
const HEIGHT_MIN = 130;
const HEIGHT_MAX = 220;
const HEIGHT_RULER_ITEM_HEIGHT = 24;
const WEIGHT_MIN = 40;
const WEIGHT_MAX = 160;
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
      summary:
        soughtHelpBefore === 'Yes'
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

const HeightRuler = ({
  value,
  min,
  max,
  textColor,
  mutedTextColor,
  borderColor,
  backgroundColor,
  onChange
}: {
  value: number;
  min: number;
  max: number;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  backgroundColor: string;
  onChange: (value: number) => void;
}) => {
  const scrollRef = useRef<ScrollView>(null);
  const values = useMemo(() => Array.from({ length: max - min + 1 }, (_, index) => max - index), [max, min]);
  const selectedIndex = max - value;
  const sidePadding = HEIGHT_RULER_ITEM_HEIGHT * 4;

  useEffect(() => {
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * HEIGHT_RULER_ITEM_HEIGHT, animated: false });
    }, 20);
    return () => clearTimeout(id);
  }, [selectedIndex]);

  const applyValueFromOffset = (offsetY: number) => {
    const rawIndex = Math.round(offsetY / HEIGHT_RULER_ITEM_HEIGHT);
    const nextIndex = Math.max(0, Math.min(values.length - 1, rawIndex));
    const nextValue = values[nextIndex];
    scrollRef.current?.scrollTo({ y: nextIndex * HEIGHT_RULER_ITEM_HEIGHT, animated: true });
    if (nextValue !== value) {
      onChange(nextValue);
    }
  };

  return (
    <View style={[styles.heightRulerShell, { backgroundColor, borderColor }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={HEIGHT_RULER_ITEM_HEIGHT}
        contentContainerStyle={{ paddingVertical: sidePadding }}
        onMomentumScrollEnd={(event) => applyValueFromOffset(event.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(event) => applyValueFromOffset(event.nativeEvent.contentOffset.y)}
      >
        {values.map((item) => {
          const selected = item === value;
          const major = item % 5 === 0;
          return (
            <View key={`height-ruler-${item}`} style={styles.heightRulerRow}>
              {major ? <Text style={[styles.heightRulerLabel, { color: selected ? textColor : mutedTextColor }]}>{item}</Text> : <View style={styles.heightRulerLabelSpacer} />}
              <View style={[styles.heightRulerTick, major && styles.heightRulerTickMajor, { backgroundColor: selected ? BRAND_GREEN : mutedTextColor }]} />
            </View>
          );
        })}
      </ScrollView>
      <View pointerEvents="none" style={styles.heightRulerSelectionBand}>
        <View style={styles.heightRulerSelectionLine} />
      </View>
    </View>
  );
};

const WeightRuler = ({
  value,
  min,
  max,
  unit,
  textColor,
  mutedTextColor,
  borderColor,
  backgroundColor,
  onChange
}: {
  value: number;
  min: number;
  max: number;
  unit: 'kg' | 'lbs';
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  backgroundColor: string;
  onChange: (value: number) => void;
}) => {
  const scrollRef = useRef<ScrollView>(null);
  const values = useMemo(() => Array.from({ length: max - min + 1 }, (_, index) => max - index), [max, min]);
  const selectedIndex = max - value;
  const sidePadding = HEIGHT_RULER_ITEM_HEIGHT * 4;

  useEffect(() => {
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * HEIGHT_RULER_ITEM_HEIGHT, animated: false });
    }, 20);
    return () => clearTimeout(id);
  }, [selectedIndex]);

  const applyValueFromOffset = (offsetY: number) => {
    const rawIndex = Math.round(offsetY / HEIGHT_RULER_ITEM_HEIGHT);
    const nextIndex = Math.max(0, Math.min(values.length - 1, rawIndex));
    const nextValue = values[nextIndex];
    scrollRef.current?.scrollTo({ y: nextIndex * HEIGHT_RULER_ITEM_HEIGHT, animated: true });
    if (nextValue !== value) {
      onChange(nextValue);
    }
  };

  return (
    <View style={[styles.heightRulerShell, { backgroundColor, borderColor }]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={HEIGHT_RULER_ITEM_HEIGHT}
        contentContainerStyle={{ paddingVertical: sidePadding }}
        onMomentumScrollEnd={(event) => applyValueFromOffset(event.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(event) => applyValueFromOffset(event.nativeEvent.contentOffset.y)}
      >
        {values.map((item) => {
          const selected = item === value;
          const major = item % 5 === 0;
          const display = unit === 'kg' ? `${item}` : `${Math.round(item * 2.20462)}`;
          return (
            <View key={`weight-ruler-${item}`} style={styles.heightRulerRow}>
              {major ? <Text style={[styles.heightRulerLabel, { color: selected ? textColor : mutedTextColor }]}>{display}</Text> : <View style={styles.heightRulerLabelSpacer} />}
              <View style={[styles.heightRulerTick, major && styles.heightRulerTickMajor, { backgroundColor: selected ? BRAND_GREEN : mutedTextColor }]} />
            </View>
          );
        })}
      </ScrollView>
      <View pointerEvents="none" style={styles.heightRulerSelectionBand}>
        <View style={styles.heightRulerSelectionLine} />
      </View>
    </View>
  );
};

export const OnboardingAssessmentScreen = ({ navigation }: Props) => {
  const { onboarding, setAssessment, submitCheckIn, setMood, themeMode } = useAppContext();
  const isLight = themeMode === 'light';
  const palette = getThemeColors(themeMode);
  const surface = isLight ? '#FFFFFF' : colors.cardMuted;
  const surfaceRaised = isLight ? '#EEF2F7' : colors.bgSecondary;
  const selectedLightBg = isLight ? palette.blueDark : undefined;
  const textStrong = isLight ? '#000000' : '#FFFFFF';
  const textSoft = isLight ? '#334155' : '#FFFFFF';
  const textLow = isLight ? '#475569' : '#FFFFFF';

  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<AssessmentGoal>('Reduce Stress');
  const [heightCm, setHeightCm] = useState(170);
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

  const pulse = useRef(new Animated.Value(1)).current;
  const micScale = useRef(new Animated.Value(1)).current;
  const profileGender = onboarding?.gender ?? 'Prefer not to say';
  const profileAge = onboarding?.calculatedAge ?? onboarding?.age ?? null;
  const totalSteps = 9;
  const isLast = step === totalSteps;
  const heightImageUri =
    profileGender === 'Female' ? 'file:///Users/l.paunikar/Downloads/women.jpeg' : 'file:///Users/l.paunikar/Downloads/man.jpeg';

  const weightDisplay = useMemo(() => {
    if (unit === 'kg') return `${weightKg} kg`;
    return `${Math.round(weightKg * 2.20462)} lbs`;
  }, [unit, weightKg]);

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
    if (!isRecordingVoice) return;
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
      gender: onboarding?.gender,
      age: onboarding?.calculatedAge ?? onboarding?.age,
      heightCm,
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

    void submitCheckIn({ mood: moodScore, energy: energyScore, sleepQuality: sleepScore, stressLevel });
    setMood(moodScore >= 4 ? '🙂' : moodScore === 3 ? '😐' : '☹️');

    navigation.reset({ index: 0, routes: [{ name: 'SyncWearable' }] });
  };

  return (
    <Screen>
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <AppBackButton
            iconOnly
            onPress={() => {
              if (step > 1) {
                setStep((current) => current - 1);
                return;
              }
              if (navigation.canGoBack()) {
                navigation.goBack();
                return;
              }
              navigation.navigate('OnboardingNotifications');
            }}
          />
          <Text style={[styles.title, { color: textStrong }]}>Assessment</Text>
          <Text style={[styles.progress, { color: textLow }]}>{step} of {totalSteps}</Text>
        </View>
        <Text style={[styles.profileSourceCopy, { color: textSoft }]}>
          Using profile details from Quick Setup{profileAge ? ` • ${profileGender} • ${profileAge} yrs` : ` • ${profileGender}`}
        </Text>

        <View style={styles.scrollContent}>
          {step === 1 ? (
            <View>
              <Text style={[styles.question, { color: textStrong }]}>What’s your health goal for today?</Text>
              <View style={styles.list}>
                {goals.map((item) => {
                  const active = goal === item;
                  return (
                    <Pressable
                      key={item}
                      style={[
                        styles.optionRow,
                        { backgroundColor: surface, borderColor: palette.stroke },
                        active && styles.optionRowActive,
                        active && isLight && { backgroundColor: selectedLightBg, borderColor: selectedLightBg }
                      ]}
                      onPress={() => {
                        setGoal(item);
                        animatePulse();
                      }}
                    >
                      <View style={[styles.radioDot, { borderColor: textLow }, active && styles.radioDotActive]} />
                      <Text style={[styles.optionLabel, { color: textStrong }, active && styles.optionLabelActive]}>{item}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {step === 2 ? (
            <View>
              <Text style={[styles.question, { color: textStrong }]}>What’s your height?</Text>
              <Text style={[styles.bigNumber, styles.heightBigNumber, { color: textStrong }]}>{heightCm} cm</Text>
              <View style={styles.heightSelectorRow}>
                <Image source={{ uri: heightImageUri }} style={styles.heightFigureImage} resizeMode="cover" />
                <HeightRuler
                  value={heightCm}
                  min={HEIGHT_MIN}
                  max={HEIGHT_MAX}
                  textColor={textStrong}
                  mutedTextColor={textLow}
                  borderColor={palette.stroke}
                  backgroundColor={surface}
                  onChange={setHeightCm}
                />
              </View>
            </View>
          ) : null}

          {step === 3 ? (
            <View>
              <Text style={[styles.question, { color: textStrong }]}>What’s your weight?</Text>
              <View style={styles.unitRow}>
                <Pressable
                  style={[
                    styles.unitChip,
                    { backgroundColor: surface, borderColor: palette.stroke },
                    unit === 'kg' && styles.unitChipActive,
                    unit === 'kg' && isLight && { backgroundColor: selectedLightBg, borderColor: selectedLightBg }
                  ]}
                  onPress={() => setUnit('kg')}
                >
                  <Text style={[styles.unitChipText, { color: textStrong }, unit === 'kg' && styles.unitChipTextActive]}>kg</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.unitChip,
                    { backgroundColor: surface, borderColor: palette.stroke },
                    unit === 'lbs' && styles.unitChipActive,
                    unit === 'lbs' && isLight && { backgroundColor: selectedLightBg, borderColor: selectedLightBg }
                  ]}
                  onPress={() => setUnit('lbs')}
                >
                  <Text style={[styles.unitChipText, { color: textStrong }, unit === 'lbs' && styles.unitChipTextActive]}>lbs</Text>
                </Pressable>
              </View>

              <Text style={[styles.bigNumber, styles.heightBigNumber, { color: textStrong }]}>{weightDisplay}</Text>
              <View style={styles.heightSelectorRow}>
                <Image source={{ uri: heightImageUri }} style={styles.heightFigureImage} resizeMode="cover" />
                <WeightRuler
                  value={weightKg}
                  min={WEIGHT_MIN}
                  max={WEIGHT_MAX}
                  unit={unit}
                  textColor={textStrong}
                  mutedTextColor={textLow}
                  borderColor={palette.stroke}
                  backgroundColor={surface}
                  onChange={setWeightKg}
                />
              </View>
            </View>
          ) : null}

          {step === 4 ? (
            <View>
              <Text style={[styles.question, { color: textStrong }]}>How would you describe your mood?</Text>
              <View style={styles.rowWrap}>
                {moods.map((item) => {
                  const active = mood === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      style={[
                        styles.moodCard,
                        { backgroundColor: surface, borderColor: palette.stroke },
                        active && styles.moodCardActive,
                        active && isLight && { backgroundColor: selectedLightBg, borderColor: selectedLightBg }
                      ]}
                      onPress={() => {
                        setAssessmentMood(item.value);
                        animatePulse();
                      }}
                    >
                      <Text style={styles.moodEmoji}>{item.emoji}</Text>
                      <Text style={[styles.moodLabel, { color: textStrong }, active && styles.optionLabelActive]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {step === 5 ? (
            <View>
              <Text style={[styles.question, { color: textStrong }]}>Have you sought professional help before?</Text>
              <View style={styles.binaryRow}>
                <Pressable
                  style={[
                    styles.binaryOption,
                    { backgroundColor: surface, borderColor: palette.stroke },
                    soughtHelpBefore === 'Yes' && styles.binaryOptionActive,
                    soughtHelpBefore === 'Yes' && isLight && { backgroundColor: selectedLightBg, borderColor: selectedLightBg }
                  ]}
                  onPress={() => setSoughtHelpBefore('Yes')}
                >
                  <Text style={[styles.optionLabel, { color: textStrong }, soughtHelpBefore === 'Yes' && styles.optionLabelActive]}>Yes</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.binaryOption,
                    { backgroundColor: surface, borderColor: palette.stroke },
                    soughtHelpBefore === 'No' && styles.binaryOptionActive,
                    soughtHelpBefore === 'No' && isLight && { backgroundColor: selectedLightBg, borderColor: selectedLightBg }
                  ]}
                  onPress={() => setSoughtHelpBefore('No')}
                >
                  <Text style={[styles.optionLabel, { color: textStrong }, soughtHelpBefore === 'No' && styles.optionLabelActive]}>No</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {step === 6 ? (
            <View>
              <Text style={[styles.question, { color: textStrong }]}>Are you experiencing any physical distress?</Text>
              <View style={styles.binaryRow}>
                <Pressable
                  style={[
                    styles.binaryOption,
                    { backgroundColor: surface, borderColor: palette.stroke },
                    physicalDistress === 'Yes' && styles.binaryOptionActive,
                    physicalDistress === 'Yes' && isLight && { backgroundColor: selectedLightBg, borderColor: selectedLightBg }
                  ]}
                  onPress={() => setPhysicalDistress('Yes')}
                >
                  <Text style={[styles.optionLabel, { color: textStrong }, physicalDistress === 'Yes' && styles.optionLabelActive]}>Yes, one or multiple</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.binaryOption,
                    { backgroundColor: surface, borderColor: palette.stroke },
                    physicalDistress === 'No' && styles.binaryOptionActive,
                    physicalDistress === 'No' && isLight && { backgroundColor: selectedLightBg, borderColor: selectedLightBg }
                  ]}
                  onPress={() => setPhysicalDistress('No')}
                >
                  <Text style={[styles.optionLabel, { color: textStrong }, physicalDistress === 'No' && styles.optionLabelActive]}>No physical pain at all</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {step === 7 ? (
            <View>
              <Text style={[styles.question, { color: textStrong }]}>How would you rate your sleep quality?</Text>
              <View style={[styles.sleepRailWrap, { backgroundColor: surface, borderColor: palette.stroke }]}>
                {sleepQualityLevels.map((item, index) => {
                  const active = sleepQuality === item;
                  const hint = index === 0 ? '7+ hrs' : index === 1 ? '6-7 hrs' : index === 2 ? '5-6 hrs' : index === 3 ? '3-4 hrs' : '<3 hrs';
                  return (
                    <Pressable key={item} style={styles.sleepRow} onPress={() => setSleepQuality(item)}>
                      <Text style={[styles.sleepLabel, { color: textSoft }, active && [styles.sleepLabelActive, { color: textStrong }]]}>{item}</Text>
                      <View style={styles.sleepDotTrack}>
                        <View style={[styles.sleepDot, { backgroundColor: textLow }, active && styles.sleepDotActive]} />
                      </View>
                      <Text style={[styles.sleepHint, { color: textLow }, active && styles.sleepHintActive]}>{hint}</Text>
                    </Pressable>
                  );
                })}
                <View style={[styles.sleepActiveBar, { top: selectedSleepIndex * 52 + 14 }]} />
              </View>
            </View>
          ) : null}

          {step === 8 ? (
            <View>
              <Text style={[styles.question, { color: textStrong }]}>How would you rate your stress level?</Text>
              <Text style={[styles.stressValue, { color: textStrong }]}>{stressLevel}</Text>
              <View style={styles.stressRow}>
                {[1, 2, 3, 4, 5].map((value) => {
                  const level = value as 1 | 2 | 3 | 4 | 5;
                  const active = stressLevel === level;
                  return (
                    <Pressable
                      key={value}
                      style={[
                        styles.stressChip,
                        { backgroundColor: surface, borderColor: palette.stroke },
                        active && styles.stressChipActive,
                        active && isLight && { backgroundColor: selectedLightBg, borderColor: selectedLightBg }
                      ]}
                      onPress={() => setStressLevel(level)}
                    >
                      <Text style={[styles.stressChipText, { color: textStrong }, active && styles.stressChipTextActive]}>{value}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.stressCopy, { color: textLow }]}>{stressCopy}</Text>
            </View>
          ) : null}

          {step === 9 ? (
            <View>
              <Text style={[styles.question, { color: textStrong }]}>AI Sound Analysis</Text>
              <View style={[styles.voiceCard, { backgroundColor: surface, borderColor: palette.stroke }]}>
                <Animated.View style={[styles.micButtonWrap, { transform: [{ scale: isRecordingVoice ? micScale : pulse }] }]}>
                  <Pressable
                    onPressIn={startVoiceCapture}
                    onPressOut={stopVoiceCapture}
                    style={[styles.micButton, { backgroundColor: surfaceRaised }, isRecordingVoice && styles.micButtonActive]}
                  >
                    <Ionicons name="mic" size={34} color={isRecordingVoice ? colors.white : isLight ? '#0F172A' : colors.white} />
                  </Pressable>
                </Animated.View>
                <Text style={[styles.voiceTitle, { color: textStrong }]}>{isRecordingVoice ? 'Listening...' : 'Hold the mic and say the statement'}</Text>
                <Text style={[styles.voiceCopy, { color: textStrong }]}>“{voiceReflection}”</Text>

                {voiceAnalysis ? (
                  <View style={styles.voiceAnalysisCard}>
                    <View style={styles.voiceAnalysisHeader}>
                      <Text style={[styles.voiceAnalysisTitle, { color: textStrong }]}>{voiceAnalysis.title}</Text>
                      <Text style={[styles.voiceAnalysisConfidence, { color: palette.success }]}>{voiceAnalysis.confidence}</Text>
                    </View>
                    <Text style={[styles.voiceAnalysisMood, { color: textSoft }]}>{voiceAnalysis.moodLabel}</Text>
                    <Text style={[styles.voiceAnalysisSummary, { color: textStrong }]}>{voiceAnalysis.summary}</Text>
                  </View>
                ) : (
                  <Text style={[styles.voiceHint, { color: textSoft }]}>Release the mic to let AI read your mood and recovery tone.</Text>
                )}
              </View>
            </View>
          ) : null}
        </View>
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
    marginBottom: 12,
    gap: 10
  },
  title: { ...typography.bodyStrong, fontSize: 16 },
  progress: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginLeft: 'auto' },
  profileSourceCopy: { ...typography.caption, marginBottom: 16 },
  question: { ...typography.title, fontSize: 28, lineHeight: 34, marginBottom: 16 },
  list: { gap: 10, marginBottom: 20 },
  optionRow: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 16,
    backgroundColor: colors.cardMuted,
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
  optionLabelActive: { color: colors.textPrimary, fontFamily: 'Exo_700Bold' },
  unitRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  unitChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.stroke,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.cardMuted
  },
  unitChipActive: { backgroundColor: BRAND_GREEN, borderColor: BRAND_GREEN },
  unitChipText: { ...typography.body, fontSize: 14 },
  unitChipTextActive: { color: '#FFFFFF', fontFamily: 'Exo_700Bold' },
  measurementCard: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 24,
    backgroundColor: colors.cardMuted,
    padding: 16,
    marginBottom: 20,
    alignItems: 'flex-end'
  },
  bigNumber: { ...typography.title, fontSize: 44, lineHeight: 52, marginBottom: 12, alignSelf: 'stretch', textAlign: 'right' },
  heightBigNumber: {
    marginBottom: 18
  },
  measurementWheel: {
    alignSelf: 'flex-end',
    width: 172
  },
  weightWheel: {
    alignSelf: 'stretch',
    width: 120,
    height: 320
  },
  heightSelectorRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    minHeight: 320,
    gap: 16
  },
  heightFigureImage: {
    flex: 1,
    borderRadius: 16,
    minHeight: 320
  },
  heightRulerShell: {
    width: 92,
    height: 320,
    overflow: 'hidden',
    alignSelf: 'stretch'
  },
  heightRulerRow: {
    height: HEIGHT_RULER_ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 8,
    gap: 8
  },
  heightRulerLabel: {
    ...typography.caption,
    fontSize: 12,
    width: 30,
    textAlign: 'right'
  },
  heightRulerLabelSpacer: {
    width: 30
  },
  heightRulerTick: {
    width: 20,
    height: 2,
    borderRadius: 2
  },
  heightRulerTickMajor: {
    width: 34,
    height: 3
  },
  heightRulerSelectionBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    marginTop: -(HEIGHT_RULER_ITEM_HEIGHT / 2),
    height: HEIGHT_RULER_ITEM_HEIGHT,
    justifyContent: 'center'
  },
  heightRulerSelectionLine: {
    height: 2,
    backgroundColor: BRAND_GREEN,
    marginHorizontal: 0,
    borderRadius: 2
  },
  rowWrap: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  moodCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted,
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
    backgroundColor: colors.cardMuted,
    paddingVertical: 14,
    paddingHorizontal: 12
  },
  binaryOptionActive: { borderColor: BRAND_GREEN, backgroundColor: 'rgba(96,175,0,0.28)' },
  sleepRailWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 20,
    position: 'relative'
  },
  sleepRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
  sleepLabel: { ...typography.body, fontSize: 16, width: 88, color: colors.textSecondary },
  sleepLabelActive: { color: colors.textPrimary, fontFamily: 'Exo_700Bold' },
  sleepDotTrack: { width: 24, alignItems: 'center', justifyContent: 'center' },
  sleepDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#939393' },
  sleepDotActive: { backgroundColor: BRAND_GREEN },
  sleepHint: { ...typography.caption, fontSize: 12, color: colors.textMuted, marginLeft: 8 },
  sleepHintActive: { color: colors.success },
  sleepActiveBar: { position: 'absolute', right: 12, width: 4, height: 24, borderRadius: 3, backgroundColor: BRAND_GREEN },
  stressValue: { ...typography.title, fontSize: 72, lineHeight: 76, color: colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  stressRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stressChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted
  },
  stressChipActive: { borderColor: BRAND_GREEN, backgroundColor: BRAND_GREEN },
  stressChipText: { ...typography.bodyStrong, fontSize: 16 },
  stressChipTextActive: { color: '#FFFFFF' },
  stressCopy: { ...typography.body, color: colors.textMuted },
  voiceCard: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 24,
    backgroundColor: colors.cardMuted,
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
    backgroundColor: colors.bgSecondary,
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
    color: colors.success
  },
  voiceAnalysisMood: {
    ...typography.caption,
    fontSize: 13,
    color: colors.textSecondary
  },
  voiceAnalysisSummary: {
    ...typography.body,
    color: colors.textPrimary
  }
});
