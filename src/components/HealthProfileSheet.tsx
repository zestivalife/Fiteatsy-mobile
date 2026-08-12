import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, getThemeColors, typography } from '../design/tokens';
import {
  AssessmentProfile,
  HealthCondition,
  HealthGoal,
  HealthProfileSectionKey,
  HealthProfileVerificationState,
  OnboardingProfile,
  ThemeMode
} from '../types';
import { buildHealthProfileCompletion, HealthProfileSectionSummary } from '../utils/healthProfileCompletion';
import {
  calculateBodyFatPercentage,
  deriveApproximateDobFromAge,
  formatConsultantAvailability,
  formatDobLabel
} from '../utils/healthProfile';

type Props = {
  visible: boolean;
  onboarding: OnboardingProfile | null;
  assessment: AssessmentProfile | null;
  reportCount: number;
  reports: Array<{
    id: string;
    labName: string;
    date: string;
    abnormal: number;
    score: number;
    uploadedAtISO?: string;
  }>;
  themeMode: ThemeMode;
  onClose: () => void;
  onOpenReports: () => void;
  onUpdateOnboarding: (patch: Partial<OnboardingProfile>) => void;
  onUpdateAssessment: (patch: Partial<AssessmentProfile>) => void;
};

type FieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  palette: ReturnType<typeof getThemeColors>;
  onChangeText: (value: string) => void;
};

type SingleSelectFieldProps = {
  label: string;
  value?: string | number;
  options: string[];
  palette: ReturnType<typeof getThemeColors>;
  onSelect: (value: string) => void;
};

type MultiSelectFieldProps = {
  label: string;
  values: string[];
  options: string[];
  palette: ReturnType<typeof getThemeColors>;
  onChange: (values: string[]) => void;
};

type SectionShellProps = {
  section: HealthProfileSectionSummary;
  expanded: boolean;
  palette: ReturnType<typeof getThemeColors>;
  themeMode: ThemeMode;
  onToggle: () => void;
  children: React.ReactNode;
};

const HEALTH_CONDITION_OPTIONS: HealthCondition[] = [
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
  'Inflammation',
  'Other'
];

const parseList = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const toggleListValue = (list: string[], value: string) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

const formatUpdatedLabel = (dateISO?: string | null) => {
  if (!dateISO) return 'Not updated yet';
  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) return 'Not updated yet';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Updated today';
  if (diffDays === 1) return 'Updated yesterday';
  if (diffDays < 7) return `Updated ${diffDays} days ago`;
  return `Updated ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
};

const verificationLabel: Record<HealthProfileVerificationState, string> = {
  self_reported: 'Self reported',
  verified: 'Verified',
  consultant_verified: 'Consultant verified',
  lab_verified: 'Lab verified',
  calculated: 'Calculated'
};

const statusLabel = {
  complete: 'Complete',
  in_progress: 'In progress',
  needs_attention: 'Needs info'
} as const;

const statusColor = (status: HealthProfileSectionSummary['status']) => {
  if (status === 'complete') return '#59BE08';
  if (status === 'in_progress') return '#F0B44C';
  return '#FF6B6B';
};

const VerificationPill = ({
  state,
  palette
}: {
  state: HealthProfileVerificationState;
  palette: ReturnType<typeof getThemeColors>;
}) => (
  <View
    style={[
      styles.verificationPill,
      {
        borderColor: palette.stroke,
        backgroundColor: state === 'lab_verified' ? 'rgba(89, 190, 8, 0.14)' : palette.cardMuted
      }
    ]}
  >
    <Text style={[styles.verificationPillText, { color: palette.textSecondary }]}>{verificationLabel[state]}</Text>
  </View>
);

const Field = ({ label, value, placeholder, keyboardType = 'default', palette, onChangeText }: FieldProps) => (
  <View style={styles.fieldWrap}>
    <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>{label}</Text>
    <TextInput
      value={value}
      placeholder={placeholder}
      placeholderTextColor="#7C8794"
      keyboardType={keyboardType}
      onChangeText={onChangeText}
      style={[
        styles.fieldInput,
        {
          borderColor: palette.stroke,
          backgroundColor: palette.cardMuted,
          color: palette.textPrimary
        }
      ]}
    />
    <VerificationPill state="self_reported" palette={palette} />
  </View>
);

const ReadOnlyMetric = ({
  label,
  value,
  hint,
  verification = 'calculated',
  palette
}: {
  label: string;
  value: string;
  hint?: string;
  verification?: HealthProfileVerificationState;
  palette: ReturnType<typeof getThemeColors>;
}) => (
  <View style={[styles.readOnlyBox, { borderColor: palette.stroke, backgroundColor: palette.cardMuted }]}>
    <View style={styles.readOnlyTopRow}>
      <Text style={[styles.readOnlyLabel, { color: palette.textSecondary }]}>{label}</Text>
      <VerificationPill state={verification} palette={palette} />
    </View>
    <Text style={[styles.readOnlyValue, { color: palette.textPrimary }]}>{value}</Text>
    {hint ? <Text style={[styles.readOnlyHint, { color: palette.textSecondary }]}>{hint}</Text> : null}
  </View>
);

const SingleSelectField = ({ label, value, options, palette, onSelect }: SingleSelectFieldProps) => (
  <View style={styles.fieldWrap}>
    <View style={styles.fieldHead}>
      <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>{label}</Text>
      <VerificationPill state="self_reported" palette={palette} />
    </View>
    <View style={styles.optionsWrap}>
      {options.map((option) => {
        const active = String(value ?? '') === option;
        return (
          <Pressable
            key={option}
            style={[
              styles.optionChip,
              { borderColor: palette.stroke, backgroundColor: palette.cardMuted },
              active && styles.optionChipActive
            ]}
            onPress={() => onSelect(option)}
          >
            <Text style={[styles.optionChipText, { color: active ? colors.white : palette.textSecondary }]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  </View>
);

const MultiSelectField = ({ label, values, options, palette, onChange }: MultiSelectFieldProps) => (
  <View style={styles.fieldWrap}>
    <View style={styles.fieldHead}>
      <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>{label}</Text>
      <VerificationPill state="self_reported" palette={palette} />
    </View>
    <View style={styles.optionsWrap}>
      {options.map((option) => {
        const active = values.includes(option);
        return (
          <Pressable
            key={option}
            style={[
              styles.optionChip,
              { borderColor: palette.stroke, backgroundColor: palette.cardMuted },
              active && styles.optionChipActive
            ]}
            onPress={() => onChange(toggleListValue(values, option))}
          >
            <Text style={[styles.optionChipText, { color: active ? colors.white : palette.textSecondary }]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  </View>
);

const ListSuggestionField = ({
  label,
  value,
  suggestions,
  placeholder,
  palette,
  onChange
}: {
  label: string;
  value: string[];
  suggestions: string[];
  placeholder?: string;
  palette: ReturnType<typeof getThemeColors>;
  onChange: (next: string[]) => void;
}) => (
  <View style={styles.fieldWrap}>
    <Field
      label={label}
      value={value.join(', ')}
      placeholder={placeholder}
      palette={palette}
      onChangeText={(next) => onChange(parseList(next))}
    />
    <View style={styles.optionsWrap}>
      {suggestions.map((suggestion) => {
        const active = value.includes(suggestion);
        return (
          <Pressable
            key={suggestion}
            style={[
              styles.optionChip,
              { borderColor: palette.stroke, backgroundColor: palette.cardMuted },
              active && styles.optionChipActive
            ]}
            onPress={() => onChange(toggleListValue(value, suggestion))}
          >
            <Text style={[styles.optionChipText, { color: active ? colors.white : palette.textSecondary }]}>{suggestion}</Text>
          </Pressable>
        );
      })}
    </View>
  </View>
);

const ToggleRow = ({
  label,
  value,
  palette,
  onToggle
}: {
  label: string;
  value: boolean;
  palette: ReturnType<typeof getThemeColors>;
  onToggle: () => void;
}) => (
  <Pressable
    style={[styles.toggleRow, { borderColor: palette.stroke, backgroundColor: palette.cardMuted }]}
    onPress={onToggle}
  >
    <View style={{ flex: 1 }}>
      <Text style={[styles.toggleTitle, { color: palette.textPrimary }]}>{label}</Text>
      <Text style={[styles.toggleCopy, { color: palette.textSecondary }]}>
        {value ? 'Shared with your assigned consultant' : 'Not shared with consultant yet'}
      </Text>
    </View>
    <View style={[styles.toggleIndicator, value && styles.toggleIndicatorActive]}>
      {value ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
    </View>
  </Pressable>
);

const SectionShell = ({ section, expanded, palette, themeMode, onToggle, children }: SectionShellProps) => (
  <View
    style={[
      styles.sectionCard,
      {
        backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#141414',
        borderColor: palette.stroke
      }
    ]}
  >
    <Pressable style={styles.sectionHeader} onPress={onToggle}>
      <View style={{ flex: 1 }}>
        <View style={styles.sectionHeaderTop}>
          <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>{section.title}</Text>
          <Text style={[styles.sectionPercent, { color: statusColor(section.status) }]}>{section.percent}%</Text>
        </View>
        <View style={styles.sectionMetaRow}>
          <View style={[styles.statusPill, { backgroundColor: `${statusColor(section.status)}22` }]}>
            <Text style={[styles.statusPillText, { color: statusColor(section.status) }]}>{statusLabel[section.status]}</Text>
          </View>
          <Text style={[styles.sectionFreshness, { color: palette.textSecondary }]}>{formatUpdatedLabel(section.updatedAtISO)}</Text>
        </View>
        <Text style={[styles.sectionSummary, { color: palette.textSecondary }]}>{section.summary}</Text>
      </View>
      <View style={[styles.expandBtn, { borderColor: palette.stroke, backgroundColor: palette.cardMuted }]}>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textPrimary} />
      </View>
    </Pressable>
    {expanded ? <View style={styles.sectionBody}>{children}</View> : null}
  </View>
);

export const HealthProfileSheet = ({
  visible,
  onboarding,
  assessment,
  reportCount,
  reports,
  themeMode,
  onClose,
  onOpenReports,
  onUpdateOnboarding,
  onUpdateAssessment
}: Props) => {
  const palette = getThemeColors(themeMode);
  const [activeStep, setActiveStep] = useState(0);
  const foodSuggestions = useMemo(
    () => ({
      liked: ['Paneer', 'Eggs', 'Chicken', 'Rice', 'Curd', 'Dal'],
      disliked: ['Mushroom', 'Bitter Gourd', 'Broccoli', 'Seafood', 'Milk'],
      allergies: ['Peanut', 'Tree Nuts', 'Milk', 'Soy', 'Shellfish', 'Egg'],
      intolerances: ['Lactose', 'Gluten', 'Spicy Food'],
      supplements: ['Vitamin D3', 'Omega-3', 'B12', 'Protein Powder', 'Iron'],
      medicines: ['Metformin', 'Levothyroxine', 'Iron', 'Prenatal Vitamins'],
      cuisines: ['North Indian', 'South Indian', 'Gujarati', 'Maharashtrian', 'Punjabi', 'Bengali'],
      goals: ['Weight Loss', 'Weight Gain', 'Muscle Building', 'Diabetes Management', 'PCOS Management', 'General Wellness', 'Fitness Improvement', 'Recovery']
    }),
    []
  );

  const completion = useMemo(
    () => buildHealthProfileCompletion(onboarding, assessment, reportCount),
    [assessment, onboarding, reportCount]
  );

  const calculatedBodyFat = useMemo(
    () =>
      calculateBodyFatPercentage({
        gender: onboarding?.gender,
        heightCm: assessment?.heightCm ?? onboarding?.heightCm,
        waistCm: onboarding?.waistCm,
        neckCm: onboarding?.neckCm,
        hipCm: onboarding?.hipCm
      }),
    [assessment?.heightCm, onboarding?.gender, onboarding?.heightCm, onboarding?.hipCm, onboarding?.neckCm, onboarding?.waistCm]
  );

  const bodyFatValue = completion.bodyFatPct ?? calculatedBodyFat;
  const selectedSharedReportIds = onboarding?.consultantSharedReportIds ?? [];
  const visibleReports = reports.slice(0, 3);

  const touchSection = (section: HealthProfileSectionKey) => {
    const nextStamp = new Date().toISOString();
    onUpdateOnboarding({
      healthProfileSectionUpdatedAt: {
        ...(onboarding?.healthProfileSectionUpdatedAt ?? {}),
        [section]: nextStamp
      }
    });
  };

  const updateOnboardingSection = (section: HealthProfileSectionKey, patch: Partial<OnboardingProfile>) => {
    const nextStamp = new Date().toISOString();
    onUpdateOnboarding({
      ...patch,
      healthProfileSectionUpdatedAt: {
        ...(onboarding?.healthProfileSectionUpdatedAt ?? {}),
        [section]: nextStamp
      }
    });
  };

  const updateAssessmentSection = (section: HealthProfileSectionKey, patch: Partial<AssessmentProfile>) => {
    touchSection(section);
    onUpdateAssessment(patch);
  };

  const updateBodyComposition = (patch: Partial<OnboardingProfile>) => {
    const next = { ...onboarding, ...patch };
    const computedBodyFat = calculateBodyFatPercentage({
      gender: next?.gender,
      heightCm: assessment?.heightCm ?? next?.heightCm,
      waistCm: next?.waistCm,
      neckCm: next?.neckCm,
      hipCm: next?.hipCm
    });

    updateOnboardingSection('body', {
      ...patch,
      bodyFatPct: computedBodyFat ?? next?.bodyFatPct
    });
  };

  const updateAge = (value: string) => {
    const age = Number(value);
    if (!age || age < 10 || age > 120) return;
    updateOnboardingSection('basic', {
      age,
      calculatedAge: age,
      dateOfBirthISO: deriveApproximateDobFromAge(age).toISOString()
    });
    updateAssessmentSection('basic', { age });
  };

  const toggleConditionCard = (condition: HealthCondition) => {
    const current = onboarding?.primaryConditions ?? [];
    updateOnboardingSection('medical', {
      primaryConditions: toggleListValue(current, condition) as HealthCondition[]
    });
  };

  const clearConditions = () => {
    updateOnboardingSection('medical', {
      primaryConditions: [],
      diabetesStatus: 'No',
      thyroidStatus: 'No',
      pcosStatus: 'No',
      hypertensionStatus: 'No',
      cholesterolStatus: 'No',
      heartConditionStatus: 'No'
    });
  };

  const stepCount = 7;
  const canGoBack = activeStep > 0;
  const canGoNext = activeStep < stepCount - 1;
  const goNext = () => (canGoNext ? setActiveStep((step) => step + 1) : onClose());
  const goBack = () => (canGoBack ? setActiveStep((step) => step - 1) : onClose());

  const goalCards: Array<{ label: string; value: HealthGoal; icon: keyof typeof Ionicons.glyphMap }> = [
    { label: 'Weight Loss', value: 'Weight Loss', icon: 'walk-outline' },
    { label: 'Muscle Gain', value: 'Muscle Building', icon: 'barbell-outline' },
    { label: 'Diabetes Management', value: 'Diabetes Management', icon: 'medical-outline' },
    { label: 'Heart Health', value: 'General Wellness', icon: 'heart-outline' },
    { label: 'PCOS Recovery', value: 'PCOS Management', icon: 'flower-outline' },
    { label: 'Energy Improvement', value: 'Better Energy', icon: 'flash-outline' },
    { label: 'Stress Recovery', value: 'Recovery', icon: 'leaf-outline' }
  ];

  const unlockedItems = [
    'Basic health insights',
    completion.bmi ? 'BMI analysis' : null,
    completion.readinessPercent >= 40 ? 'Energy requirement' : null,
    reportCount > 0 ? 'Report-aware insights' : null
  ].filter(Boolean);

  const journeySteps = [
    { key: 'about', label: 'About You' },
    { key: 'goal', label: 'Your Goal' },
    { key: 'lifestyle', label: 'Lifestyle' },
    { key: 'medical', label: 'Medical History' },
    { key: 'reports', label: 'Reports' },
    { key: 'body', label: 'Measurements' },
    { key: 'summary', label: 'Summary' }
  ];

  const StepIntro = ({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) => (
    <View style={styles.journeyIntro}>
      <Text style={[styles.journeyEyebrow, { color: '#59BE08' }]}>{eyebrow}</Text>
      <Text style={[styles.journeyTitle, { color: palette.textPrimary }]}>{title}</Text>
      <Text style={[styles.journeyCopy, { color: palette.textSecondary }]}>{copy}</Text>
    </View>
  );

  const SelectCard = ({
    label,
    icon,
    active,
    onPress
  }: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    active: boolean;
    onPress: () => void;
  }) => (
    <Pressable
      style={[
        styles.journeySelectCard,
        { borderColor: palette.stroke, backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#202020' },
        active && styles.journeySelectCardActive
      ]}
      onPress={onPress}
    >
      <View style={[styles.journeyIconBubble, active && styles.journeyIconBubbleActive]}>
        <Ionicons name={icon} size={20} color={active ? '#FFFFFF' : '#59BE08'} />
      </View>
      <Text style={[styles.journeySelectText, { color: active ? '#FFFFFF' : palette.textPrimary }]}>{label}</Text>
    </Pressable>
  );

  const MiniOption = ({
    label,
    active,
    onPress
  }: {
    label: string;
    active: boolean;
    onPress: () => void;
  }) => (
    <Pressable
      style={[
        styles.journeyMiniOption,
        { borderColor: palette.stroke, backgroundColor: palette.cardMuted },
        active && styles.journeyMiniOptionActive
      ]}
      onPress={onPress}
    >
      <Text style={[styles.journeyMiniOptionText, { color: active ? '#FFFFFF' : palette.textPrimary }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: themeMode === 'light' ? '#F8FBFF' : '#171717',
              borderColor: palette.stroke
            }
          ]}
        >
          <View style={[styles.handle, { backgroundColor: palette.stroke }]} />
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>Your Health Story</Text>
              <Text style={[styles.headerCopy, { color: palette.textSecondary }]}>
                A guided journey that turns your profile into personalised nutrition, recovery, and consultant context.
              </Text>
            </View>
            <Pressable
              style={[styles.closeBtn, { borderColor: palette.stroke, backgroundColor: palette.cardMuted }]}
              onPress={onClose}
            >
              <Ionicons name="close" size={18} color={palette.textPrimary} />
            </Pressable>
          </View>

          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#202020',
                borderColor: palette.stroke
              }
            ]}
          >
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: palette.textSecondary }]}>Profile strength</Text>
              <Text style={[styles.summaryValue, { color: palette.textPrimary }]}>{completion.completionPercent}%</Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: palette.textSecondary }]}>Readiness score</Text>
              <Text style={[styles.summaryValue, { color: completion.isAiReady ? '#59BE08' : '#F0B44C' }]}>
                {completion.readinessPercent}%
              </Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: palette.textSecondary }]}>Reports linked</Text>
              <Text style={[styles.summaryValue, { color: palette.textPrimary }]}>{reportCount}</Text>
            </View>
          </View>

          <View style={styles.journeyStepTrack}>
            {journeySteps.map((step, index) => (
              <Pressable
                key={step.key}
                style={[
                  styles.journeyStepDot,
                  { backgroundColor: index <= activeStep ? '#59BE08' : palette.stroke }
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${step.label}`}
                onPress={() => setActiveStep(index)}
              />
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View
              style={[
                styles.journeyCard,
                {
                  borderColor: palette.stroke,
                  backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#141414'
                }
              ]}
            >
              {activeStep === 0 ? (
                <>
                  <StepIntro
                    eyebrow="Step 1"
                    title="Tell us about yourself"
                    copy="This helps us understand your body and create a personalised plan."
                  />
                  <View style={styles.metricGrid}>
                    <Field
                      label="Age"
                      value={String(onboarding?.calculatedAge ?? onboarding?.age ?? assessment?.age ?? '')}
                      keyboardType="numeric"
                      palette={palette}
                      onChangeText={updateAge}
                    />
                    <Field
                      label="Height (cm)"
                      value={String(assessment?.heightCm ?? onboarding?.heightCm ?? '')}
                      keyboardType="numeric"
                      palette={palette}
                      onChangeText={(value) => {
                        const heightCm = Number(value) || 0;
                        updateAssessmentSection('body', { heightCm });
                        updateOnboardingSection('body', { heightCm });
                      }}
                    />
                  </View>
                  <Text style={[styles.fieldLabel, { color: palette.textSecondary }]}>Gender</Text>
                  <View style={styles.journeyCardGrid}>
                    {([
                      { label: 'Female', value: 'Female' },
                      { label: 'Male', value: 'Male' },
                      { label: 'Other', value: 'Prefer not to say' }
                    ] as Array<{ label: string; value: NonNullable<AssessmentProfile['gender']> }>).map((gender) => (
                      <SelectCard
                        key={gender.label}
                        label={gender.label}
                        icon={gender.value === 'Female' ? 'female-outline' : gender.value === 'Male' ? 'male-outline' : 'person-outline'}
                        active={onboarding?.gender === gender.value}
                        onPress={() => {
                          updateOnboardingSection('basic', { gender: gender.value });
                          updateAssessmentSection('basic', { gender: gender.value });
                        }}
                      />
                    ))}
                  </View>
                  <Field
                    label="Weight (kg)"
                    value={String(assessment?.weightKg ?? onboarding?.currentWeightKg ?? '')}
                    keyboardType="numeric"
                    palette={palette}
                    onChangeText={(value) => {
                      const weight = Number(value) || 0;
                      updateAssessmentSection('body', { weightKg: weight });
                      updateOnboardingSection('body', { currentWeightKg: weight });
                    }}
                  />
                </>
              ) : null}

              {activeStep === 1 ? (
                <>
                  <StepIntro
                    eyebrow="Step 2"
                    title="What is your primary goal?"
                    copy="Pick the one outcome you most want Fiteatsy and your consultant to optimise for first."
                  />
                  <View style={styles.journeyCardGrid}>
                    {goalCards.map((goal) => (
                      <SelectCard
                        key={goal.label}
                        label={goal.label}
                        icon={goal.icon}
                        active={(onboarding?.primaryGoal ?? onboarding?.wellnessGoal ?? onboarding?.healthGoals?.[0]) === goal.value}
                        onPress={() =>
                          updateOnboardingSection('basic', {
                            primaryGoal: goal.value,
                            wellnessGoal: goal.value,
                            healthGoals: [goal.value]
                          })
                        }
                      />
                    ))}
                  </View>
                </>
              ) : null}

              {activeStep === 2 ? (
                <>
                  <StepIntro
                    eyebrow="Step 3"
                    title="Your lifestyle rhythm"
                    copy="A few everyday signals help us tune recovery, calories, and nutrition timing."
                  />
                  <Text style={[styles.journeyQuestion, { color: palette.textPrimary }]}>How is your sleep usually?</Text>
                  <View style={styles.journeyMiniGrid}>
                    {['Poor', 'Average', 'Good', 'Excellent'].map((value) => (
                      <MiniOption
                        key={value}
                        label={value}
                        active={onboarding?.sleepQualityLabel === value}
                        onPress={() => updateOnboardingSection('lifestyle', { sleepQualityLabel: value })}
                      />
                    ))}
                  </View>
                  <Text style={[styles.journeyQuestion, { color: palette.textPrimary }]}>Your daily movement?</Text>
                  <View style={styles.journeyMiniGrid}>
                    {[
                      ['Mostly sitting', 'Sedentary'],
                      ['Light activity', 'Lightly active'],
                      ['Active', 'Moderately active'],
                      ['Highly active', 'Very active']
                    ].map(([label, value]) => (
                      <MiniOption
                        key={label}
                        label={label}
                        active={onboarding?.activityLevel === value}
                        onPress={() => updateOnboardingSection('lifestyle', { activityLevel: value })}
                      />
                    ))}
                  </View>
                  <Text style={[styles.journeyQuestion, { color: palette.textPrimary }]}>Your eating preference?</Text>
                  <View style={styles.journeyMiniGrid}>
                    {[
                      ['Indian Vegetarian', 'Vegetarian'],
                      ['Non Vegetarian', 'Non vegetarian'],
                      ['Vegan', 'Vegan'],
                      ['Mixed', 'Other']
                    ].map(([label, value]) => (
                      <MiniOption
                        key={label}
                        label={label}
                        active={onboarding?.dietType === value}
                        onPress={() =>
                          updateOnboardingSection('nutrition', {
                            dietType: value,
                            regionalCuisine: label === 'Indian Vegetarian' ? 'North Indian' : onboarding?.regionalCuisine
                          })
                        }
                      />
                    ))}
                  </View>
                  <View style={styles.metricGrid}>
                    <SingleSelectField
                      label="Stress"
                      value={onboarding?.stressLevelLabel}
                      options={['Low', 'Moderate', 'High', 'Very High']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('lifestyle', { stressLevelLabel: value })}
                    />
                    <SingleSelectField
                      label="Exercise"
                      value={onboarding?.exerciseFrequency}
                      options={['Never', '1-2x/week', '3-4x/week', '5x+/week']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('lifestyle', { exerciseFrequency: value })}
                    />
                  </View>
                </>
              ) : null}

              {activeStep === 3 ? (
                <>
                  <StepIntro
                    eyebrow="Step 4"
                    title="Do you have any health conditions?"
                    copy="Select all that apply. This keeps recommendations safer and more relevant."
                  />
                  <View style={styles.journeyCardGrid}>
                    {[
                      ['Diabetes', 'Diabetes', 'medical-outline'],
                      ['Thyroid', 'Thyroid', 'pulse-outline'],
                      ['PCOS', 'PCOS', 'flower-outline'],
                      ['Heart condition', 'High Cholesterol', 'heart-outline'],
                      ['Blood pressure', 'Hypertension', 'fitness-outline'],
                      ['Cholesterol', 'High Cholesterol', 'analytics-outline']
                    ].map(([label, value, icon]) => (
                      <SelectCard
                        key={`${label}-${value}`}
                        label={label}
                        icon={icon as keyof typeof Ionicons.glyphMap}
                        active={(onboarding?.primaryConditions ?? []).includes(value as HealthCondition)}
                        onPress={() => toggleConditionCard(value as HealthCondition)}
                      />
                    ))}
                    <SelectCard
                      label="None"
                      icon="checkmark-done-outline"
                      active={(onboarding?.primaryConditions ?? []).length === 0}
                      onPress={clearConditions}
                    />
                  </View>
                  <ListSuggestionField
                    label="Family medical history"
                    value={onboarding?.familyHistoryConditions ?? []}
                    placeholder="comma separated"
                    suggestions={HEALTH_CONDITION_OPTIONS.slice(0, 8)}
                    palette={palette}
                    onChange={(value) => updateOnboardingSection('medical', { familyHistoryConditions: value as HealthCondition[] })}
                  />
                  <ListSuggestionField
                    label="Previous surgeries"
                    value={onboarding?.previousSurgeries ?? []}
                    placeholder="comma separated"
                    suggestions={['None', 'Appendix', 'Gallbladder', 'C-section', 'Orthopedic', 'Cardiac']}
                    palette={palette}
                    onChange={(value) => updateOnboardingSection('medical', { previousSurgeries: value })}
                  />
                </>
              ) : null}

              {activeStep === 4 ? (
                <>
                  <StepIntro
                    eyebrow="Step 5"
                    title="Do you have recent reports?"
                    copy="Upload blood reports and Fiteatsy will extract health markers into your profile."
                  />
                  <View style={[styles.reportSummary, { borderColor: palette.stroke, backgroundColor: palette.cardMuted }]}>
                    <Text style={[styles.reportSummaryTitle, { color: palette.textPrimary }]}>
                      AI can extract HbA1c, vitamin levels, lipid profile, thyroid markers, and CBC values.
                    </Text>
                    <Text style={[styles.reportSummaryCopy, { color: palette.textSecondary }]}>
                      {reportCount > 0
                        ? `${reportCount} reports are already connected to this profile.`
                        : 'No reports yet. Your profile still works, and reports can unlock deeper biomarker intelligence later.'}
                    </Text>
                  </View>
                  <Pressable style={styles.primaryBtn} onPress={onOpenReports}>
                    <Text style={styles.primaryBtnText}>{reportCount > 0 ? 'View Reports' : 'Upload Report'}</Text>
                  </Pressable>
                  {visibleReports.map((report) => {
                    const active = selectedSharedReportIds.includes(report.id);
                    return (
                      <Pressable
                        key={report.id}
                        style={[
                          styles.reportRow,
                          { borderColor: palette.stroke, backgroundColor: palette.cardMuted },
                          active && styles.reportRowActive
                        ]}
                        onPress={() =>
                          updateOnboardingSection('reports', {
                            consultantSharedReportIds: active
                              ? selectedSharedReportIds.filter((id) => id !== report.id)
                              : [...selectedSharedReportIds, report.id]
                          })
                        }
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.reportRowTitle, { color: palette.textPrimary }]}>{report.labName}</Text>
                          <Text style={[styles.reportRowMeta, { color: palette.textSecondary }]}>
                            {report.date} | Score {report.score} | {report.abnormal} flagged
                          </Text>
                        </View>
                        <View style={[styles.toggleIndicator, active && styles.toggleIndicatorActive]}>
                          {active ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              ) : null}

              {activeStep === 5 ? (
                <>
                  <StepIntro
                    eyebrow="Step 6"
                    title="To improve accuracy of your plan"
                    copy="Body measurements make calorie, protein, and metabolic recommendations more precise."
                  />
                  <View style={styles.metricGrid}>
                    <Field
                      label="Waist (cm)"
                      value={String(onboarding?.waistCm ?? '')}
                      keyboardType="numeric"
                      palette={palette}
                      onChangeText={(value) => updateBodyComposition({ waistCm: Number(value) || undefined })}
                    />
                    <Field
                      label="Hip (cm)"
                      value={String(onboarding?.hipCm ?? '')}
                      keyboardType="numeric"
                      palette={palette}
                      onChangeText={(value) => updateBodyComposition({ hipCm: Number(value) || undefined })}
                    />
                  </View>
                  <View style={styles.metricGrid}>
                    <Field
                      label="Neck (cm)"
                      value={String(onboarding?.neckCm ?? '')}
                      keyboardType="numeric"
                      palette={palette}
                      onChangeText={(value) => updateBodyComposition({ neckCm: Number(value) || undefined })}
                    />
                    <Field
                      label="Body Fat %"
                      value={String(onboarding?.bodyFatPct ?? bodyFatValue ?? '')}
                      keyboardType="numeric"
                      palette={palette}
                      onChangeText={(value) => updateOnboardingSection('body', { bodyFatPct: Number(value) || undefined })}
                    />
                  </View>
                  <View style={styles.metricGrid}>
                    <ReadOnlyMetric label="BMI" value={completion.bmi ? `${completion.bmi}` : 'Calculates automatically'} palette={palette} />
                    <ReadOnlyMetric label="Daily Energy" value={completion.readinessPercent >= 40 ? 'Calculates after save' : 'Needs profile basics'} palette={palette} />
                  </View>
                </>
              ) : null}

              {activeStep === 6 ? (
                <>
                  <StepIntro
                    eyebrow="Final"
                    title="Your Health Profile"
                    copy="This is your current profile strength. Keep going when you are ready; every section improves your plan."
                  />
                  <View style={[styles.journeyStrengthPanel, { backgroundColor: palette.cardMuted, borderColor: palette.stroke }]}>
                    <Text style={[styles.journeyStrengthLabel, { color: palette.textSecondary }]}>Strength</Text>
                    <Text style={[styles.journeyStrengthValue, { color: palette.textPrimary }]}>{completion.completionPercent}%</Text>
                    <View style={[styles.journeyStrengthTrack, { backgroundColor: themeMode === 'light' ? '#DDE8D7' : '#2A3326' }]}>
                      <View style={[styles.journeyStrengthFill, { width: `${completion.completionPercent}%` }]} />
                    </View>
                  </View>
                  <Text style={[styles.journeyQuestion, { color: palette.textPrimary }]}>You unlocked:</Text>
                  {unlockedItems.map((item) => (
                    <View key={String(item)} style={styles.journeyCheckRow}>
                      <Ionicons name="checkmark-circle" size={18} color="#59BE08" />
                      <Text style={[styles.journeyCheckText, { color: palette.textPrimary }]}>{item}</Text>
                    </View>
                  ))}
                  <Text style={[styles.journeyQuestion, { color: palette.textPrimary }]}>Complete next:</Text>
                  {(completion.missingItems.slice(0, 4).length ? completion.missingItems.slice(0, 4) : ['No critical gaps right now.']).map((item) => (
                    <View key={item} style={styles.journeyCheckRow}>
                      <Ionicons name="ellipse-outline" size={16} color={palette.textSecondary} />
                      <Text style={[styles.journeyCheckText, { color: palette.textSecondary }]}>{item}</Text>
                    </View>
                  ))}
                </>
              ) : null}
            </View>
          </ScrollView>
          <View style={styles.journeyFooter}>
            <Pressable
              style={[styles.secondaryBtn, { borderColor: palette.stroke, backgroundColor: palette.cardMuted }]}
              onPress={goBack}
            >
              <Text style={[styles.secondaryBtnText, { color: palette.textPrimary }]}>{canGoBack ? 'Back' : 'Close'}</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={goNext}>
              <Text style={styles.primaryBtnText}>{canGoNext ? 'Continue' : 'Continue Journey'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)'
  },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24
  },
  handle: {
    alignSelf: 'center',
    width: 56,
    height: 5,
    borderRadius: 999,
    marginBottom: 14
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  headerTitle: {
    ...typography.section,
    fontSize: 22
  },
  headerCopy: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    marginRight: 12
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  summaryCard: {
    marginTop: 16,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  summaryCol: {
    flex: 1
  },
  summaryLabel: {
    ...typography.caption,
    fontSize: 12,
    marginBottom: 4
  },
  summaryValue: {
    ...typography.bodyStrong,
    fontSize: 20
  },
  missingCopy: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12
  },
  nextStepCard: {
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center'
  },
  nextStepEyebrow: {
    ...typography.caption,
    fontSize: 11,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  nextStepTitle: {
    ...typography.bodyStrong,
    fontSize: 15
  },
  nextStepCopy: {
    ...typography.body,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4
  },
  nextStepButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#59BE08',
    marginLeft: 12
  },
  nextStepButtonText: {
    ...typography.bodyStrong,
    color: '#FFFFFF',
    fontSize: 13
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 48
  },
  journeyStepTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 14
  },
  journeyStepDot: {
    flex: 1,
    height: 5,
    borderRadius: 999
  },
  journeyCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 18,
    marginBottom: 12
  },
  journeyIntro: {
    marginBottom: 18
  },
  journeyEyebrow: {
    ...typography.caption,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 8
  },
  journeyTitle: {
    ...typography.section,
    fontSize: 24,
    lineHeight: 30
  },
  journeyCopy: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8
  },
  journeyCardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14
  },
  journeySelectCard: {
    width: '48%',
    minHeight: 116,
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    justifyContent: 'space-between'
  },
  journeySelectCardActive: {
    backgroundColor: '#59BE08',
    borderColor: '#59BE08'
  },
  journeyIconBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(89, 190, 8, 0.14)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  journeyIconBubbleActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)'
  },
  journeySelectText: {
    ...typography.bodyStrong,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 14
  },
  journeyQuestion: {
    ...typography.bodyStrong,
    fontSize: 15,
    marginTop: 8,
    marginBottom: 10
  },
  journeyMiniGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14
  },
  journeyMiniOption: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  journeyMiniOptionActive: {
    backgroundColor: '#59BE08',
    borderColor: '#59BE08'
  },
  journeyMiniOptionText: {
    ...typography.bodyStrong,
    fontSize: 13
  },
  journeyStrengthPanel: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16
  },
  journeyStrengthLabel: {
    ...typography.caption,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  journeyStrengthValue: {
    ...typography.section,
    fontSize: 38,
    marginTop: 4
  },
  journeyStrengthTrack: {
    height: 9,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 12
  },
  journeyStrengthFill: {
    height: 9,
    borderRadius: 999,
    backgroundColor: '#59BE08'
  },
  journeyCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 9
  },
  journeyCheckText: {
    ...typography.body,
    fontSize: 14,
    flex: 1
  },
  journeyFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 8
  },
  sectionCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    marginBottom: 14
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  sectionHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sectionTitle: {
    ...typography.bodyStrong,
    fontSize: 16
  },
  sectionPercent: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  sectionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statusPillText: {
    ...typography.caption,
    fontSize: 11
  },
  sectionFreshness: {
    ...typography.caption,
    fontSize: 11,
    marginLeft: 10
  },
  sectionSummary: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
    paddingRight: 12
  },
  expandBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12
  },
  sectionBody: {
    marginTop: 16
  },
  metricGrid: {
    flexDirection: 'row',
    marginBottom: 12
  },
  fieldWrap: {
    marginBottom: 12,
    flex: 1
  },
  fieldHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  fieldLabel: {
    ...typography.caption,
    fontSize: 12,
    marginBottom: 6
  },
  fieldInput: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6
  },
  verificationPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start'
  },
  verificationPillText: {
    ...typography.caption,
    fontSize: 10
  },
  optionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  optionChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8
  },
  optionChipActive: {
    borderColor: '#59BE08',
    backgroundColor: 'rgba(89, 190, 8, 0.18)'
  },
  optionChipText: {
    ...typography.caption,
    fontSize: 12
  },
  readOnlyBox: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14
  },
  readOnlyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  readOnlyLabel: {
    ...typography.caption,
    fontSize: 12
  },
  readOnlyValue: {
    ...typography.bodyStrong,
    fontSize: 14,
    marginTop: 6
  },
  readOnlyHint: {
    ...typography.caption,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6
  },
  reportSummary: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14
  },
  reportSummaryTitle: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  reportSummaryCopy: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6
  },
  dualButtonRow: {
    flexDirection: 'row',
    marginTop: 12,
    marginBottom: 12
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: '#59BE08',
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8
  },
  primaryBtnText: {
    ...typography.bodyStrong,
    color: '#FFFFFF',
    fontSize: 14
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center'
  },
  secondaryBtnText: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  reportList: {
    marginTop: 6
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10
  },
  reportRowActive: {
    borderColor: '#59BE08',
    backgroundColor: 'rgba(89, 190, 8, 0.12)'
  },
  reportRowTitle: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  reportRowMeta: {
    ...typography.body,
    fontSize: 12,
    marginTop: 4
  },
  reportMetaPills: {
    flexDirection: 'row',
    marginTop: 8
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10
  },
  toggleTitle: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  toggleCopy: {
    ...typography.body,
    fontSize: 12,
    marginTop: 4
  },
  toggleIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4B5563',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12
  },
  toggleIndicatorActive: {
    backgroundColor: '#59BE08',
    borderColor: '#59BE08'
  },
  consultantCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12
  },
  consultantName: {
    ...typography.bodyStrong,
    fontSize: 15
  },
  consultantMeta: {
    ...typography.body,
    fontSize: 12,
    marginTop: 4
  }
});
