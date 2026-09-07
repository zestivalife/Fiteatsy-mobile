import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingAction, OnboardingShell, QuestionHeader } from '../../components/onboarding/OnboardingShell';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { calculateBmi, validateAnthropometrics } from '../../utils/anthropometrics';
import { normalizeOnboardingProfile } from '../../utils/healthProfile';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingAnthropometrics'>;
type FieldKey = 'heightCm' | 'weightKg' | 'armCircumferenceCm' | 'thighCircumferenceCm' | 'calfCircumferenceCm';

const fields: Array<{ key: FieldKey; label: string; placeholder: string }> = [
  { key: 'heightCm', label: 'Height', placeholder: 'e.g. 165' },
  { key: 'weightKg', label: 'Weight', placeholder: 'e.g. 62.5' },
  { key: 'armCircumferenceCm', label: 'Arm circumference', placeholder: 'e.g. 28' },
  { key: 'thighCircumferenceCm', label: 'Thigh circumference', placeholder: 'e.g. 52' },
  { key: 'calfCircumferenceCm', label: 'Calf circumference', placeholder: 'e.g. 36' }
];

export const OnboardingAnthropometricsScreen = ({ navigation }: Props) => {
  const { onboarding, setOnboarding } = useAppContext();
  const [values, setValues] = useState<Record<FieldKey, string>>({
    heightCm: onboarding?.heightCm ? String(onboarding.heightCm) : '',
    weightKg: onboarding?.currentWeightKg ? String(onboarding.currentWeightKg) : '',
    armCircumferenceCm: onboarding?.armCircumferenceCm ? String(onboarding.armCircumferenceCm) : '',
    thighCircumferenceCm: onboarding?.thighCircumferenceCm ? String(onboarding.thighCircumferenceCm) : '',
    calfCircumferenceCm: onboarding?.calfCircumferenceCm ? String(onboarding.calfCircumferenceCm) : ''
  });
  const numeric = useMemo(() => ({
    heightCm: Number(values.heightCm), weightKg: Number(values.weightKg),
    armCircumferenceCm: Number(values.armCircumferenceCm), thighCircumferenceCm: Number(values.thighCircumferenceCm),
    calfCircumferenceCm: Number(values.calfCircumferenceCm)
  }), [values]);
  const errors = validateAnthropometrics(numeric);
  const valid = Object.values(errors).every((error) => error === null);
  const bmi = calculateBmi(numeric.weightKg, numeric.heightCm);

  const next = () => {
    if (!onboarding || !valid) return;
    setOnboarding(normalizeOnboardingProfile({
      ...onboarding,
      heightCm: numeric.heightCm,
      currentWeightKg: numeric.weightKg,
      armCircumferenceCm: numeric.armCircumferenceCm,
      thighCircumferenceCm: numeric.thighCircumferenceCm,
      calfCircumferenceCm: numeric.calfCircumferenceCm
    }));
    navigation.navigate('OnboardingAssessment', { startPhase: 'lifestyle' });
  };

  return <OnboardingShell phase="BASICS" phaseLabel="BASICS · ANTHROPOMETRICS" step={1} total={1} onBack={() => navigation.goBack()} action={<OnboardingAction title="Continue" onPress={next} disabled={!valid} />}>
    <QuestionHeader title="Anthropometric Profile" description="Enter your body measurements. Date of birth and gender stay in Basic Profile." />
    <View style={styles.form}>
      {fields.map((field) => <View key={field.key} style={styles.fieldGroup}>
        <Text style={styles.label}>{field.label.toUpperCase()}</Text>
        <View style={styles.inputRow}>
          <TextInput accessibilityLabel={`${field.label} in ${field.key === 'weightKg' ? 'kilograms' : 'centimetres'}`} value={values[field.key]} onChangeText={(value) => setValues((current) => ({ ...current, [field.key]: value.replace(',', '.') }))} keyboardType="decimal-pad" inputMode="decimal" placeholder={field.placeholder} placeholderTextColor={colors.textMuted} style={styles.input} />
          <Text style={styles.unit}>{field.key === 'weightKg' ? 'kg' : 'cm'}</Text>
        </View>
        {values[field.key] && errors[field.key] ? <Text accessibilityRole="alert" style={styles.error}>{errors[field.key]}</Text> : null}
      </View>)}
    </View>
    {bmi !== null ? <View style={styles.bmiCard} accessible accessibilityLabel={`Body mass index ${bmi}`}><Text style={styles.bmiLabel}>BMI</Text><Text style={styles.bmiValue}>{bmi}</Text><Text style={styles.bmiNote}>Calculated from your current height and weight.</Text></View> : null}
  </OnboardingShell>;
};

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  fieldGroup: { gap: 6 },
  label: { ...typography.label, fontSize: 12, color: colors.textSecondary },
  inputRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.stroke, borderRadius: radius.lg, backgroundColor: colors.cardMuted },
  input: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: 12, ...typography.bodyStrong, color: colors.textPrimary },
  unit: { width: 44, ...typography.bodyStrong, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger },
  bmiCard: { marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.success, backgroundColor: colors.cardMuted },
  bmiLabel: { ...typography.label, color: colors.textSecondary },
  bmiValue: { ...typography.screenTitle, color: colors.success, marginVertical: 4 },
  bmiNote: { ...typography.caption, color: colors.textSecondary }
});
