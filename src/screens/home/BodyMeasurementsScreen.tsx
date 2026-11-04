import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { getThemeColors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { normalizeOnboardingProfile } from '../../utils/healthProfile';

type Props = NativeStackScreenProps<RootStackParamList, 'BodyMeasurements'>;
type MeasurementKey = 'heightCm' | 'currentWeightKg' | 'waistCm' | 'hipCm' | 'neckCm' | 'bodyFatPct';

const fields: Array<{ key: MeasurementKey; label: string; unit: string; min: number; max: number }> = [
  { key: 'heightCm', label: 'Height', unit: 'cm', min: 50, max: 250 },
  { key: 'currentWeightKg', label: 'Weight', unit: 'kg', min: 10, max: 500 },
  { key: 'waistCm', label: 'Waist', unit: 'cm', min: 20, max: 250 },
  { key: 'hipCm', label: 'Hip', unit: 'cm', min: 20, max: 300 },
  { key: 'neckCm', label: 'Neck', unit: 'cm', min: 15, max: 100 },
  { key: 'bodyFatPct', label: 'Body fat', unit: '%', min: 1, max: 75 }
];

const initialValues = (profile: ReturnType<typeof useAppContext>['onboarding']) =>
  Object.fromEntries(fields.map(({ key }) => [key, profile?.[key] ? String(profile[key]) : ''])) as Record<MeasurementKey, string>;

const formatUpdatedAt = (value?: string | null) => {
  if (!value) return 'Not synced yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not synced yet';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export const BodyMeasurementsScreen = ({ navigation }: Props) => {
  const { onboarding, setOnboarding, canonicalProfile, themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const [values, setValues] = useState(() => initialValues(onboarding));
  const [saved, setSaved] = useState(false);

  const errors = useMemo(() => Object.fromEntries(fields.map((field) => {
    const raw = values[field.key].trim();
    if (!raw) return [field.key, null];
    const value = Number(raw);
    return [field.key, Number.isFinite(value) && value >= field.min && value <= field.max
      ? null
      : `Enter ${field.min}–${field.max} ${field.unit}.`];
  })) as Record<MeasurementKey, string | null>, [values]);

  const hasMeasurement = Object.values(values).some((value) => value.trim().length > 0);
  const valid = hasMeasurement && Object.values(errors).every((error) => error === null);
  const bmi = (() => {
    const height = Number(values.heightCm);
    const weight = Number(values.currentWeightKg);
    if (!height || !weight || errors.heightCm || errors.currentWeightKg) return null;
    return Math.round((weight / ((height / 100) ** 2)) * 10) / 10;
  })();

  const save = () => {
    if (!onboarding || !valid) return;
    const patch = Object.fromEntries(fields.map(({ key }) => {
      const raw = values[key].trim();
      return [key, raw ? Number(raw) : undefined];
    })) as Partial<NonNullable<typeof onboarding>>;
    setOnboarding(normalizeOnboardingProfile({ ...onboarding, ...patch }));
    setSaved(true);
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Profile" style={[styles.iconButton, { borderColor: palette.stroke, backgroundColor: palette.cardMuted }]} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={palette.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.textPrimary }]}>Body Measurements</Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>Keep your latest measurements in your Health Profile.</Text>
        </View>
      </View>

      <Card style={styles.card}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Current measurements</Text>
        <Text style={[styles.helper, { color: palette.textSecondary }]}>Add what you know. Your consultant can see these values only when Measurements access is active.</Text>
        <View style={styles.form}>
          {fields.map((field) => (
            <View key={field.key} style={styles.fieldGroup}>
              <Text style={[styles.label, { color: palette.textSecondary }]}>{field.label}</Text>
              <View style={[styles.inputRow, { borderColor: errors[field.key] ? palette.danger : palette.stroke, backgroundColor: palette.cardMuted }]}>
                <TextInput
                  accessibilityLabel={`${field.label} in ${field.unit}`}
                  value={values[field.key]}
                  onChangeText={(value) => { setSaved(false); setValues((current) => ({ ...current, [field.key]: value.replace(',', '.') })); }}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  placeholder="Not recorded"
                  placeholderTextColor={palette.textSecondary}
                  style={[styles.input, { color: palette.textPrimary }]}
                />
                <Text style={[styles.unit, { color: palette.textSecondary }]}>{field.unit}</Text>
              </View>
              {errors[field.key] ? <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{errors[field.key]}</Text> : null}
            </View>
          ))}
        </View>
        {bmi !== null ? <View style={[styles.bmiCard, { borderColor: palette.stroke, backgroundColor: palette.cardMuted }]}><Text style={[styles.label, { color: palette.textSecondary }]}>Calculated BMI</Text><Text style={[styles.bmi, { color: palette.textPrimary }]}>{bmi}</Text></View> : null}
        {!hasMeasurement ? <Text style={[styles.empty, { color: palette.textSecondary }]}>No measurements have been recorded yet. Add at least one measurement to save.</Text> : null}
        {saved ? <Text accessibilityRole="alert" style={[styles.success, { color: palette.success }]}>Measurements saved. Secure sync will continue automatically.</Text> : null}
        <Pressable accessibilityRole="button" disabled={!valid} style={[styles.saveButton, !valid && styles.saveButtonDisabled]} onPress={save}>
          <Text style={styles.saveButtonText}>Save measurements</Text>
        </Pressable>
        <Text style={[styles.updated, { color: palette.textSecondary }]}>Last server update: {formatUpdatedAt(canonicalProfile?.profile.updatedAtISO)}</Text>
      </Card>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.lg },
  iconButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: 4 },
  title: { ...typography.screenTitle },
  subtitle: { ...typography.body },
  card: { gap: spacing.md },
  sectionTitle: { ...typography.sectionTitle },
  helper: { ...typography.body },
  form: { gap: spacing.md },
  fieldGroup: { gap: 6 },
  label: { ...typography.label },
  inputRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.lg },
  input: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: 12, ...typography.bodyStrong },
  unit: { width: 48, ...typography.bodyStrong },
  error: { ...typography.caption },
  bmiCard: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, gap: 4 },
  bmi: { ...typography.screenTitle },
  empty: { ...typography.caption },
  success: { ...typography.bodyStrong },
  saveButton: { minHeight: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: '#59BE08' },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonText: { ...typography.bodyStrong, color: '#FFFFFF' },
  updated: { ...typography.caption, textAlign: 'center' }
});
