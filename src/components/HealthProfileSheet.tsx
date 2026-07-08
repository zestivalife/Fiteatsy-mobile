import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, getThemeColors, typography } from '../design/tokens';
import {
  AssessmentProfile,
  HealthCondition,
  HealthProfileSectionKey,
  HealthProfileVerificationState,
  OnboardingProfile,
  ThemeMode
} from '../types';
import { buildHealthProfileCompletion, HealthProfileSectionSummary } from '../utils/healthProfileCompletion';
import {
  calculateBodyFatPercentage,
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
  const [expandedSection, setExpandedSection] = useState<HealthProfileSectionKey>('basic');
  const foodSuggestions = useMemo(
    () => ({
      liked: ['Paneer', 'Eggs', 'Chicken', 'Rice', 'Curd', 'Dal'],
      disliked: ['Mushroom', 'Bitter Gourd', 'Broccoli', 'Seafood', 'Milk'],
      allergies: ['Peanut', 'Tree Nuts', 'Milk', 'Soy', 'Shellfish', 'Egg'],
      intolerances: ['Lactose', 'Gluten', 'Spicy Food'],
      supplements: ['Vitamin D3', 'Omega-3', 'B12', 'Protein Powder', 'Iron'],
      medicines: ['Metformin', 'Levothyroxine', 'Iron', 'Prenatal Vitamins'],
      cuisines: ['North Indian', 'South Indian', 'Gujarati', 'Maharashtrian', 'Punjabi', 'Bengali'],
      goals: ['Weight Loss', 'Better Energy', 'Better Sleep', 'Sugar Control', 'Hormone Balance']
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

  const consultant = onboarding?.assignedConsultant;

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
              <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>Health Profile Completion</Text>
              <Text style={[styles.headerCopy, { color: palette.textSecondary }]}>
                Structured clinical profile sections for better consultant review and stronger nutrition readiness.
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
              <Text style={[styles.summaryLabel, { color: palette.textSecondary }]}>Profile completion</Text>
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

          <Text style={[styles.missingCopy, { color: palette.textSecondary }]}>
            {completion.missingItems.slice(0, 3).join(' • ') || 'No critical gaps right now.'}
          </Text>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {completion.sections.map((section) => (
              <SectionShell
                key={section.id}
                section={section}
                expanded={expandedSection === section.id}
                palette={palette}
                themeMode={themeMode}
                onToggle={() => setExpandedSection(expandedSection === section.id ? 'basic' : section.id)}
              >
                {section.id === 'basic' ? (
                  <>
                    <View style={styles.metricGrid}>
                      <ReadOnlyMetric
                        label="DOB"
                        value={onboarding?.dateOfBirthISO ? formatDobLabel(onboarding.dateOfBirthISO) : 'Not set'}
                        verification="verified"
                        palette={palette}
                      />
                      <ReadOnlyMetric
                        label="Calculated Age"
                        value={onboarding?.calculatedAge ? `${onboarding.calculatedAge} yrs` : 'Not set'}
                        verification="calculated"
                        palette={palette}
                      />
                    </View>
                    <View style={styles.metricGrid}>
                      <ReadOnlyMetric
                        label="Gender"
                        value={onboarding?.gender ?? 'Not set'}
                        verification="verified"
                        hint="Pulled from Quick Setup. Edit from Personal Information only."
                        palette={palette}
                      />
                      <Field
                        label="Goal Weight (kg)"
                        value={String(onboarding?.goalWeightKg ?? '')}
                        keyboardType="numeric"
                        palette={palette}
                        onChangeText={(value) => updateOnboardingSection('basic', { goalWeightKg: Number(value) || undefined })}
                      />
                    </View>
                    <Field
                      label="Occupation"
                      value={onboarding?.occupation ?? ''}
                      placeholder="e.g. Software engineer"
                      palette={palette}
                      onChangeText={(value) => updateOnboardingSection('basic', { occupation: value })}
                    />
                    <SingleSelectField
                      label="Work Mode"
                      value={onboarding?.workMode}
                      options={['Office', 'Hybrid', 'Remote']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('basic', { workMode: value })}
                    />
                    <SingleSelectField
                      label="Working Hours"
                      value={onboarding?.workingHoursLabel ?? onboarding?.workHours}
                      options={['6am-2pm', '7am-3pm', '9am-6pm', '10am-7pm', '12pm-9pm', 'Flexible']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('basic', { workingHoursLabel: value })}
                    />
                    <SingleSelectField
                      label="Shift Type"
                      value={onboarding?.shiftType}
                      options={['Day', 'Night', 'Rotational']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('basic', { shiftType: value })}
                    />
                    <SingleSelectField
                      label="Travel Frequency"
                      value={onboarding?.travelFrequency}
                      options={['Rarely', 'Monthly', 'Weekly', 'Frequent']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('basic', { travelFrequency: value })}
                    />
                    <SingleSelectField
                      label="Activity Level"
                      value={onboarding?.activityLevel}
                      options={['Sedentary', 'Light', 'Moderate', 'Active']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('basic', { activityLevel: value })}
                    />
                  </>
                ) : null}

                {section.id === 'body' ? (
                  <>
                    <View style={styles.metricGrid}>
                      <Field
                        label="Height (cm)"
                        value={String(assessment?.heightCm ?? onboarding?.heightCm ?? '')}
                        keyboardType="numeric"
                        palette={palette}
                        onChangeText={(value) => updateAssessmentSection('body', { heightCm: Number(value) || 0 })}
                      />
                      <Field
                        label="Current Weight (kg)"
                        value={String(assessment?.weightKg ?? onboarding?.currentWeightKg ?? '')}
                        keyboardType="numeric"
                        palette={palette}
                        onChangeText={(value) => updateAssessmentSection('body', { weightKg: Number(value) || 0 })}
                      />
                    </View>
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
                    <Field
                      label="Neck (cm)"
                      value={String(onboarding?.neckCm ?? '')}
                      keyboardType="numeric"
                      palette={palette}
                      onChangeText={(value) => updateBodyComposition({ neckCm: Number(value) || undefined })}
                    />
                    <View style={styles.metricGrid}>
                      <ReadOnlyMetric
                        label="BMI"
                        value={completion.bmi ? `${completion.bmi}` : 'Calculates automatically'}
                        palette={palette}
                      />
                      <ReadOnlyMetric
                        label="Body Fat %"
                        value={
                          bodyFatValue
                            ? `${bodyFatValue}%`
                            : onboarding?.gender === 'Female'
                              ? 'Needs height, waist, hip, neck'
                              : 'Needs height, waist, neck'
                        }
                        hint="Derived from body composition entries."
                        palette={palette}
                      />
                    </View>
                    <ReadOnlyMetric
                      label="Waist-Hip Ratio"
                      value={completion.waistHipRatio ? `${completion.waistHipRatio}` : 'Needs waist and hip'}
                      hint="Useful for metabolic risk screening."
                      palette={palette}
                    />
                  </>
                ) : null}

                {section.id === 'lifestyle' ? (
                  <>
                    <View style={styles.metricGrid}>
                      <SingleSelectField
                        label="Sleep Hours"
                        value={onboarding?.sleepHours}
                        options={['5', '6', '7', '8', '9']}
                        palette={palette}
                        onSelect={(value) => updateOnboardingSection('lifestyle', { sleepHours: Number(value) })}
                      />
                      <SingleSelectField
                        label="Sleep Goal"
                        value={onboarding?.sleepGoalHours}
                        options={['7', '8', '9']}
                        palette={palette}
                        onSelect={(value) => updateOnboardingSection('lifestyle', { sleepGoalHours: Number(value) })}
                      />
                    </View>
                    <View style={styles.metricGrid}>
                      <SingleSelectField
                        label="Water Intake (L)"
                        value={onboarding?.waterIntakeLiters}
                        options={['1.5', '2', '2.5', '3', '3.5']}
                        palette={palette}
                        onSelect={(value) => updateOnboardingSection('lifestyle', { waterIntakeLiters: Number(value) })}
                      />
                      <SingleSelectField
                        label="Meals Per Day"
                        value={onboarding?.mealsPerDay}
                        options={['2', '3', '4', '5']}
                        palette={palette}
                        onSelect={(value) => updateOnboardingSection('lifestyle', { mealsPerDay: Number(value) })}
                      />
                    </View>
                    <SingleSelectField
                      label="Smoking Status"
                      value={onboarding?.smokingStatus}
                      options={['Never', 'Occasional', 'Daily', 'Quit']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('lifestyle', { smokingStatus: value })}
                    />
                    <SingleSelectField
                      label="Alcohol Frequency"
                      value={onboarding?.alcoholFrequency}
                      options={['Never', 'Monthly', 'Weekly', 'Socially']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('lifestyle', { alcoholFrequency: value })}
                    />
                    <SingleSelectField
                      label="Exercise Frequency"
                      value={onboarding?.exerciseFrequency}
                      options={['Never', '1-2x/week', '3-4x/week', '5x+/week']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('lifestyle', { exerciseFrequency: value })}
                    />
                    <SingleSelectField
                      label="Stress Level"
                      value={onboarding?.stressLevelLabel}
                      options={['Low', 'Moderate', 'High', 'Very High']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('lifestyle', { stressLevelLabel: value })}
                    />
                  </>
                ) : null}

                {section.id === 'nutrition' ? (
                  <>
                    <SingleSelectField
                      label="Diet Type"
                      value={onboarding?.dietType}
                      options={['Vegetarian', 'Eggetarian', 'Vegan', 'Jain', 'Pescatarian', 'Mixed']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('nutrition', { dietType: value })}
                    />
                    <SingleSelectField
                      label="Regional Cuisine"
                      value={onboarding?.regionalCuisine}
                      options={foodSuggestions.cuisines}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('nutrition', { regionalCuisine: value })}
                    />
                    <MultiSelectField
                      label="Preferred Cuisines"
                      values={onboarding?.preferredCuisines ?? []}
                      options={foodSuggestions.cuisines}
                      palette={palette}
                      onChange={(value) => updateOnboardingSection('nutrition', { preferredCuisines: value })}
                    />
                    <ListSuggestionField
                      label="Foods You Like"
                      value={onboarding?.foodsLiked ?? []}
                      placeholder="comma separated"
                      suggestions={foodSuggestions.liked}
                      palette={palette}
                      onChange={(value) => updateOnboardingSection('nutrition', { foodsLiked: value })}
                    />
                    <ListSuggestionField
                      label="Foods You Dislike"
                      value={onboarding?.foodsDisliked ?? []}
                      placeholder="comma separated"
                      suggestions={foodSuggestions.disliked}
                      palette={palette}
                      onChange={(value) => updateOnboardingSection('nutrition', { foodsDisliked: value })}
                    />
                    <ListSuggestionField
                      label="Food Allergies"
                      value={onboarding?.foodAllergies ?? []}
                      placeholder="comma separated"
                      suggestions={foodSuggestions.allergies}
                      palette={palette}
                      onChange={(value) => updateOnboardingSection('nutrition', { foodAllergies: value })}
                    />
                    <ListSuggestionField
                      label="Food Intolerances"
                      value={onboarding?.foodIntolerances ?? []}
                      placeholder="comma separated"
                      suggestions={foodSuggestions.intolerances}
                      palette={palette}
                      onChange={(value) => updateOnboardingSection('nutrition', { foodIntolerances: value })}
                    />
                    <SingleSelectField
                      label="Outside Food Frequency"
                      value={onboarding?.outsideFoodFrequency}
                      options={['Rarely', '1-2 times/week', '3-4 times/week', 'Daily']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('nutrition', { outsideFoodFrequency: value })}
                    />
                    <SingleSelectField
                      label="Cooking At Home"
                      value={onboarding?.cookingAtHome}
                      options={['Always', 'Sometimes', 'Rarely']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('nutrition', { cookingAtHome: value })}
                    />
                    <SingleSelectField
                      label="Who Cooks"
                      value={onboarding?.whoCooks}
                      options={['Self', 'Family', 'Cook', 'Hostel/Cafeteria']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('nutrition', { whoCooks: value })}
                    />
                    <SingleSelectField
                      label="Meal Timing Preference"
                      value={onboarding?.mealTimingPreference}
                      options={['Early', 'Regular', 'Late', 'Irregular']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('nutrition', { mealTimingPreference: value })}
                    />
                    <ListSuggestionField
                      label="Current Supplements"
                      value={onboarding?.currentSupplements ?? []}
                      placeholder="comma separated"
                      suggestions={foodSuggestions.supplements}
                      palette={palette}
                      onChange={(value) => updateOnboardingSection('nutrition', { currentSupplements: value })}
                    />
                    <ListSuggestionField
                      label="Current Medicines"
                      value={onboarding?.currentMedicines ?? []}
                      placeholder="comma separated"
                      suggestions={foodSuggestions.medicines}
                      palette={palette}
                      onChange={(value) => updateOnboardingSection('nutrition', { currentMedicines: value })}
                    />
                  </>
                ) : null}

                {section.id === 'medical' ? (
                  <>
                    <MultiSelectField
                      label="Current Conditions"
                      values={onboarding?.primaryConditions ?? []}
                      options={HEALTH_CONDITION_OPTIONS}
                      palette={palette}
                      onChange={(value) => updateOnboardingSection('medical', { primaryConditions: value as HealthCondition[] })}
                    />
                    <MultiSelectField
                      label="Previous Conditions"
                      values={onboarding?.previousConditions ?? []}
                      options={HEALTH_CONDITION_OPTIONS}
                      palette={palette}
                      onChange={(value) => updateOnboardingSection('medical', { previousConditions: value as HealthCondition[] })}
                    />
                    <MultiSelectField
                      label="Family History"
                      values={onboarding?.familyHistoryConditions ?? []}
                      options={HEALTH_CONDITION_OPTIONS}
                      palette={palette}
                      onChange={(value) => updateOnboardingSection('medical', { familyHistoryConditions: value as HealthCondition[] })}
                    />
                    <SingleSelectField
                      label="PCOS"
                      value={onboarding?.pcosStatus}
                      options={['No', 'Suspected', 'Diagnosed']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('medical', { pcosStatus: value })}
                    />
                    <SingleSelectField
                      label="Thyroid"
                      value={onboarding?.thyroidStatus}
                      options={['No', 'Hypothyroid', 'Hyperthyroid', 'Under evaluation']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('medical', { thyroidStatus: value })}
                    />
                    <SingleSelectField
                      label="Diabetes"
                      value={onboarding?.diabetesStatus}
                      options={['No', 'Prediabetes', 'Type 2', 'Under evaluation']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('medical', { diabetesStatus: value })}
                    />
                    <SingleSelectField
                      label="Hypertension"
                      value={onboarding?.hypertensionStatus}
                      options={['No', 'Borderline', 'Diagnosed']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('medical', { hypertensionStatus: value })}
                    />
                    <SingleSelectField
                      label="Pregnancy"
                      value={onboarding?.pregnancyStatus}
                      options={['Not applicable', 'No', 'Trying to conceive', 'Pregnant']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('medical', { pregnancyStatus: value })}
                    />
                    <SingleSelectField
                      label="Breastfeeding"
                      value={onboarding?.breastfeedingStatus}
                      options={['Not applicable', 'No', 'Yes']}
                      palette={palette}
                      onSelect={(value) => updateOnboardingSection('medical', { breastfeedingStatus: value })}
                    />
                    <Field
                      label="Clinical Notes"
                      value={onboarding?.medicalNotes ?? ''}
                      placeholder="Anything the consultant should know"
                      palette={palette}
                      onChangeText={(value) => updateOnboardingSection('medical', { medicalNotes: value })}
                    />
                  </>
                ) : null}

                {section.id === 'reports' ? (
                  <>
                    <View style={[styles.reportSummary, { borderColor: palette.stroke, backgroundColor: palette.cardMuted }]}>
                      <Text style={[styles.reportSummaryTitle, { color: palette.textPrimary }]}>
                        {reportCount > 0 ? `${reportCount} reports available` : 'No blood reports uploaded yet'}
                      </Text>
                      <Text style={[styles.reportSummaryCopy, { color: palette.textSecondary }]}>
                        Recent uploads stay separate from profile data. Select which reports should be visible to consultants.
                      </Text>
                    </View>
                    <View style={styles.dualButtonRow}>
                      <Pressable style={styles.primaryBtn} onPress={onOpenReports}>
                        <Text style={styles.primaryBtnText}>{reportCount > 0 ? 'View Reports' : 'Upload Report'}</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.secondaryBtn, { borderColor: palette.stroke, backgroundColor: palette.cardMuted }]}
                        onPress={onOpenReports}
                      >
                        <Text style={[styles.secondaryBtnText, { color: palette.textPrimary }]}>Manage Access</Text>
                      </Pressable>
                    </View>
                    {reports.length > 0 ? (
                      <View style={styles.reportList}>
                        {reports.map((report) => {
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
                                  {report.date} • Score {report.score} • {report.abnormal} flagged
                                </Text>
                                <View style={styles.reportMetaPills}>
                                  <VerificationPill state="lab_verified" palette={palette} />
                                  <VerificationPill state={active ? 'consultant_verified' : 'self_reported'} palette={palette} />
                                </View>
                              </View>
                              <View style={[styles.toggleIndicator, active && styles.toggleIndicatorActive]}>
                                {active ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </>
                ) : null}

                {section.id === 'sharing' ? (
                  <>
                    <View style={[styles.consultantCard, { borderColor: palette.stroke, backgroundColor: palette.cardMuted }]}>
                      <Text style={[styles.consultantName, { color: palette.textPrimary }]}>
                        {consultant?.fullName ?? 'Consultant assignment in progress'}
                      </Text>
                      <Text style={[styles.consultantMeta, { color: palette.textSecondary }]}>
                        {consultant?.specialization ?? onboarding?.careTrack ?? 'Foundational Recovery Care'} •{' '}
                        {formatConsultantAvailability(consultant?.availability ?? 'awaiting_schedule')}
                      </Text>
                      <Text style={[styles.consultantMeta, { color: palette.textSecondary }]}>
                        Last consultation: {consultant?.lastConsultationISO ? formatDobLabel(consultant.lastConsultationISO) : 'Not available'}
                      </Text>
                      <Text style={[styles.consultantMeta, { color: palette.textSecondary }]}>
                        Next appointment: {consultant?.nextAppointmentISO ? formatDobLabel(consultant.nextAppointmentISO) : 'Not scheduled'}
                      </Text>
                    </View>
                    <ToggleRow
                      label="Share measurements"
                      value={onboarding?.shareMeasurementsWithConsultant ?? true}
                      palette={palette}
                      onToggle={() =>
                        updateOnboardingSection('sharing', {
                          shareMeasurementsWithConsultant: !(onboarding?.shareMeasurementsWithConsultant ?? true)
                        })
                      }
                    />
                    <ToggleRow
                      label="Share nutrition profile"
                      value={onboarding?.shareNutritionWithConsultant ?? true}
                      palette={palette}
                      onToggle={() =>
                        updateOnboardingSection('sharing', {
                          shareNutritionWithConsultant: !(onboarding?.shareNutritionWithConsultant ?? true)
                        })
                      }
                    />
                    <ToggleRow
                      label="Share medications"
                      value={onboarding?.shareMedicationWithConsultant ?? true}
                      palette={palette}
                      onToggle={() =>
                        updateOnboardingSection('sharing', {
                          shareMedicationWithConsultant: !(onboarding?.shareMedicationWithConsultant ?? true)
                        })
                      }
                    />
                    <ToggleRow
                      label="Share lifestyle data"
                      value={onboarding?.shareLifestyleWithConsultant ?? true}
                      palette={palette}
                      onToggle={() =>
                        updateOnboardingSection('sharing', {
                          shareLifestyleWithConsultant: !(onboarding?.shareLifestyleWithConsultant ?? true)
                        })
                      }
                    />
                    <ReadOnlyMetric
                      label="Reports shared"
                      value={`${selectedSharedReportIds.length} selected`}
                      verification="consultant_verified"
                      palette={palette}
                    />
                  </>
                ) : null}
              </SectionShell>
            ))}
          </ScrollView>
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
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 48
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
