import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { OnboardingAction, OnboardingShell, QuestionHeader } from '../../components/onboarding/OnboardingShell';
import { colors, radius, spacing, typography } from '../../design/tokens';
import type { FoodCatalogueItem, FoodPreferenceProfile } from '../../services/foodPreferenceService';

type Choice = { label: string; value: string; icon?: keyof typeof Ionicons.glyphMap };
type FoodMode = 'dislikedFoodIds' | 'avoidedFoodIds';
const preferenceAccent = '#FF9138';

const diets: Choice[] = [
  { label: 'Vegetarian', value: 'vegetarian', icon: 'leaf-outline' },
  { label: 'Eggetarian', value: 'eggetarian', icon: 'egg-outline' },
  { label: 'Non-Vegetarian', value: 'non_vegetarian', icon: 'restaurant-outline' },
  { label: 'Vegan', value: 'vegan', icon: 'nutrition-outline' },
  { label: 'Jain', value: 'jain', icon: 'star-outline' }
];
const cuisines = ['Maharashtrian', 'North Indian', 'South Indian', 'Gujarati', 'Punjabi', 'Bengali', 'Rajasthani', 'Other Indian', 'International / Other'];
const staples: Choice[] = [{ label: 'Roti', value: 'roti' }, { label: 'Rice', value: 'rice' }, { label: 'Both', value: 'both' }, { label: 'No preference', value: 'none' }];
const dairy: Choice[] = [{ label: 'Yes', value: 'allowed' }, { label: 'Prefer limited', value: 'limited' }, { label: 'No', value: 'avoid' }];
const proteins: Choice[] = [{ label: 'Eggs', value: 'egg' }, { label: 'Chicken', value: 'chicken' }, { label: 'Fish', value: 'fish' }, { label: 'Mutton', value: 'mutton' }, { label: 'Paneer', value: 'paneer' }, { label: 'Dal / Pulses', value: 'dal_pulses' }];

const toggle = (values: string[], value: string) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

export const OnboardingFoodPreferencesFlow = ({
  profile,
  update,
  foodQuery,
  setFoodQuery,
  foodItems,
  foodLoading,
  foodError,
  saving,
  error,
  onSave,
  onExit
}: {
  profile: FoodPreferenceProfile;
  update: <K extends keyof FoodPreferenceProfile>(key: K, value: FoodPreferenceProfile[K]) => void;
  foodQuery: string;
  setFoodQuery: (query: string) => void;
  foodItems: FoodCatalogueItem[];
  foodLoading: boolean;
  foodError: string | null;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onExit: () => void;
}) => {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [foodMode, setFoodMode] = useState<FoodMode>('dislikedFoodIds');
  const foodLabels = useMemo(() => new Map(foodItems.map((item) => [item.id, item.displayName])), [foodItems]);
  const dietLabel = diets.find((choice) => choice.value === profile.dietType)?.label ?? 'Not selected';
  const stapleLabel = staples.find((choice) => choice.value === profile.staplePreference)?.label ?? 'No preference';
  const dairyLabel = dairy.find((choice) => choice.value === profile.dairyPreference)?.label ?? 'Not selected';
  const selectedFoodIds = foodMode === 'dislikedFoodIds' ? profile.dislikedFoodIds : profile.avoidedFoodIds;

  const go = (next: number) => {
    setDirection(next >= step ? 'forward' : 'back');
    setStep(next);
  };
  const back = () => step === 1 ? onExit() : go(step - 1);
  const skip = () => go(step + 1);

  const action = step === 4 ? (
    <>
      <OnboardingAction title={saving ? 'Saving...' : 'Looks good'} onPress={onSave} disabled={saving || !profile.dietType} />
      <OnboardingAction title="Edit preferences" onPress={() => go(1)} secondary />
    </>
  ) : (
    <>
      <OnboardingAction title="Continue" onPress={() => go(step + 1)} disabled={step === 1 && !profile.dietType} />
      {step > 1 ? <OnboardingAction title="Skip for now" onPress={skip} secondary /> : null}
    </>
  );

  return (
    <OnboardingShell phase="LIFESTYLE" phaseLabel="LIFESTYLE · NUTRITION" step={step} total={4} onBack={back} direction={direction} action={action}>
      {step === 1 ? <>
        <QuestionHeader title="What best describes how you usually eat?" description="We'll use this to recommend meals that already fit your lifestyle." />
        <View style={styles.stack}>{diets.map((choice) => <LargeChoice key={choice.value} choice={choice} selected={profile.dietType === choice.value} onPress={() => update('dietType', choice.value as FoodPreferenceProfile['dietType'])} />)}</View>
        <Info text="Preferences help personalise suggestions. Medical restrictions are managed separately." />
      </> : null}

      {step === 2 ? <>
        <QuestionHeader title="Which cuisines feel most like home?" description="Choose all you enjoy. We'll prioritise familiar foods where they fit your plan." />
        {profile.cuisines.length ? <Text style={styles.count}>{profile.cuisines.length} selected</Text> : null}
        <View style={styles.chips}>
          {cuisines.map((label) => <Chip key={label} label={label} selected={profile.cuisines.includes(label)} onPress={() => update('cuisines', toggle(profile.cuisines, label))} accent={colors.blue} />)}
          <Chip label="No strong preference" selected={profile.cuisines.length === 0} onPress={() => update('cuisines', [])} accent={colors.blue} />
        </View>
        <Info text={profile.cuisines.length ? `We'll prioritise familiar ${dietLabel.toLowerCase()} ${profile.cuisines[0]} meal options.` : 'No cuisine preference will be applied.'} />
      </> : null}

      {step === 3 ? <>
        <QuestionHeader title="What usually works for your meals?" description="A few everyday choices help us make your plan easier to follow." />
        <FieldLabel text="Main-meal staple" />
        <View style={styles.equalRow}>{staples.map((choice) => <Chip key={choice.value} label={choice.label} selected={profile.staplePreference === choice.value} onPress={() => update('staplePreference', choice.value as FoodPreferenceProfile['staplePreference'])} />)}</View>
        <FieldLabel text="Dairy" />
        <View style={styles.equalRow}>{dairy.map((choice) => <Chip key={choice.value} label={choice.label} selected={profile.dairyPreference === choice.value} onPress={() => update('dairyPreference', choice.value as FoodPreferenceProfile['dairyPreference'])} accent={colors.blue} />)}</View>
        <FieldLabel text="Protein choices you enjoy" />
        <View style={styles.chips}>{proteins.map((choice) => <Chip key={choice.value} label={choice.label} selected={profile.proteins.includes(choice.value)} onPress={() => update('proteins', toggle(profile.proteins, choice.value))} />)}</View>
        <Info text={profile.cuisines.length ? `We'll prioritise familiar ${dietLabel.toLowerCase()} ${profile.cuisines[0]} meal options.` : 'These preferences support future consultant-reviewed meal planning.'} />
      </> : null}

      {step === 4 ? <>
        <QuestionHeader title="Anything you prefer not to eat?" description="Tell us what you dislike or normally avoid. Medical allergies and restrictions are handled separately." />
        <View style={styles.modeRow}>
          <Chip label="Don't enjoy" selected={foodMode === 'dislikedFoodIds'} onPress={() => setFoodMode('dislikedFoodIds')} accent={preferenceAccent} />
          <Chip label="Prefer to avoid" selected={foodMode === 'avoidedFoodIds'} onPress={() => setFoodMode('avoidedFoodIds')} accent={preferenceAccent} />
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput accessibilityLabel="Search verified foods" value={foodQuery} onChangeText={setFoodQuery} placeholder="Add food" placeholderTextColor={colors.textSecondary} style={styles.search} />
        </View>
        {foodLoading ? <Text style={styles.helper}>Searching verified foods...</Text> : null}
        {foodError ? <Text style={styles.error}>{foodError}</Text> : null}
        {!foodLoading && !foodError ? <View style={styles.chips}>{foodItems.map((item) => <Chip key={item.id} label={item.displayName} selected={selectedFoodIds.includes(item.id)} onPress={() => update(foodMode, toggle(selectedFoodIds, item.id))} accent={preferenceAccent} />)}</View> : null}
        <Info text="Have an allergy or intolerance? Manage health restrictions separately." />
        <View style={styles.divider} />
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Your food preferences</Text>
          <SummaryRow label="Diet" value={dietLabel} />
          <SummaryRow label="Cuisines" value={profile.cuisines.join(' · ') || 'No strong preference'} />
          <SummaryRow label="Staple" value={stapleLabel} />
          <SummaryRow label="Dairy" value={dairyLabel} />
          <SummaryRow label="Avoids" value={[...profile.dislikedFoodIds, ...profile.avoidedFoodIds].map((id) => foodLabels.get(id)).filter(Boolean).join(', ') || `${profile.dislikedFoodIds.length + profile.avoidedFoodIds.length} verified foods selected`} />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </> : null}
    </OnboardingShell>
  );
};

const LargeChoice = ({ choice, selected, onPress }: { choice: Choice; selected: boolean; onPress: () => void }) => <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.largeChoice, selected && styles.selectedChoice, pressed && styles.pressed]}>
  {choice.icon ? <View style={[styles.icon, selected && styles.selectedIcon]}><Ionicons name={choice.icon} size={20} color={selected ? colors.success : colors.textSecondary} /></View> : null}
  <Text style={styles.choiceText}>{choice.label}</Text><View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <Ionicons name="checkmark" size={16} color="#06100B" /> : null}</View>
</Pressable>;

const Chip = ({ label, selected, onPress, accent = colors.success }: { label: string; selected: boolean; onPress: () => void; accent?: string }) => <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => [styles.chip, selected && { borderColor: accent, backgroundColor: `${accent}12` }, pressed && styles.pressed]}><Text style={[styles.chipText, selected && { color: accent }]}>{selected ? '✓  ' : ''}{label}</Text></Pressable>;
const FieldLabel = ({ text }: { text: string }) => <Text style={styles.fieldLabel}>{text}</Text>;
const Info = ({ text }: { text: string }) => <View style={styles.info}><Ionicons name="information-circle-outline" size={18} color={colors.blue} /><Text style={styles.infoText}>{text}</Text></View>;
const SummaryRow = ({ label, value }: { label: string; value: string }) => <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  largeChoice: { minHeight: 76, borderWidth: 1, borderColor: colors.stroke, borderRadius: radius.lg, backgroundColor: colors.cardMuted, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  selectedChoice: { borderColor: colors.success, backgroundColor: 'rgba(73,223,134,0.08)' },
  icon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center' },
  selectedIcon: { backgroundColor: 'rgba(73,223,134,0.14)' },
  choiceText: { ...typography.bodyStrong, color: colors.textPrimary, flex: 1 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.stroke, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.success, backgroundColor: colors.success },
  pressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
  count: { ...typography.caption, color: colors.blue, alignSelf: 'flex-start', backgroundColor: 'rgba(53,207,239,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  equalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 44, borderWidth: 1, borderColor: colors.stroke, borderRadius: radius.pill, backgroundColor: colors.cardMuted, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  chipText: { ...typography.caption, color: colors.textSecondary },
  fieldLabel: { ...typography.bodyStrong, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderWidth: 1, borderColor: 'rgba(53,207,239,0.22)', backgroundColor: 'rgba(53,207,239,0.06)', borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  infoText: { ...typography.caption, color: colors.textSecondary, flex: 1, lineHeight: 19 },
  modeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  searchWrap: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.cardMuted, borderRadius: radius.pill, paddingHorizontal: spacing.md },
  search: { ...typography.body, color: colors.textPrimary, flex: 1, minHeight: 46 },
  helper: { ...typography.caption, color: colors.textSecondary, marginVertical: spacing.sm },
  error: { ...typography.caption, color: colors.danger, marginVertical: spacing.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.stroke, marginVertical: spacing.lg },
  summary: { borderWidth: 1, borderColor: colors.stroke, backgroundColor: colors.cardMuted, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  summaryTitle: { ...typography.bodyStrong, color: colors.textPrimary, marginBottom: spacing.xs },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  summaryLabel: { ...typography.caption, color: colors.textSecondary, width: 72 },
  summaryValue: { ...typography.caption, color: colors.textPrimary, flex: 1 }
});
