import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { getThemeColors, radius, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import {
  emptyFoodPreferenceProfile,
  getFoodPreferences,
  saveFoodPreferences,
  searchFoodCatalogue,
  type FoodCatalogueItem,
  type FoodPreferenceProfile
} from '../../services/foodPreferenceService';
import { OnboardingFoodPreferencesFlow } from './OnboardingFoodPreferencesFlow';
import { getOnboardingRuntimeProgress, setOnboardingRuntimeProgress } from '../../services/onboardingRuntimeProgress';

type Props = NativeStackScreenProps<RootStackParamList, 'FoodPreferences'>;
type Choice = { label: string; value: string };

const diets: Choice[] = [
  { label: 'Vegetarian', value: 'vegetarian' },
  { label: 'Eggetarian', value: 'eggetarian' },
  { label: 'Non-Vegetarian', value: 'non_vegetarian' },
  { label: 'Vegan', value: 'vegan' },
  { label: 'Jain', value: 'jain' }
];
const proteins: Choice[] = [
  { label: 'Eggs', value: 'egg' },
  { label: 'Chicken', value: 'chicken' },
  { label: 'Fish', value: 'fish' },
  { label: 'Mutton', value: 'mutton' }
];
const cuisines: Choice[] = ['Maharashtrian', 'North Indian', 'South Indian', 'Gujarati', 'Punjabi', 'Bengali', 'Rajasthani', 'Other Indian', 'International / Other'].map((label) => ({ label, value: label }));
const practicality: Choice[] = ['Home-cooked', 'Office-friendly', 'Quick preparation', 'Travel-friendly', 'Minimal cooking', 'Family-friendly'].map((label) => ({ label, value: label }));

const toggle = (values: string[], value: string) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

export const FoodPreferencesScreen = ({ navigation, route }: Props) => {
  const { themeMode, onboarding, authSession } = useAppContext();
  const palette = getThemeColors(themeMode);
  const mode = route.params?.mode ?? 'profile';
  const [profile, setProfile] = useState<FoodPreferenceProfile>(emptyFoodPreferenceProfile());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [foodQuery, setFoodQuery] = useState('');
  const [foodMode, setFoodMode] = useState<'likedFoodIds' | 'dislikedFoodIds' | 'avoidedFoodIds'>('likedFoodIds');
  const [foodItems, setFoodItems] = useState<FoodCatalogueItem[]>([]);
  const [foodLoading, setFoodLoading] = useState(false);
  const [foodError, setFoodError] = useState<string | null>(null);
  const [initialOnboardingStep, setInitialOnboardingStep] = useState(1);
  const clientId = authSession?.client.fiteatsyClientId;
  const completionStarted = useRef(false);

  useEffect(() => {
    Promise.all([
      getFoodPreferences(),
      mode === 'onboarding' ? getOnboardingRuntimeProgress(clientId) : Promise.resolve(null)
    ])
      .then(([response, progress]) => {
        const source = progress?.phase === 'food' && progress.foodDraft ? progress.foodDraft : response.profile;
        setProfile({ ...emptyFoodPreferenceProfile(), ...source, likedFoodIds: source.likedFoodIds ?? [], dislikedFoodIds: source.dislikedFoodIds ?? [], avoidedFoodIds: source.avoidedFoodIds ?? [] });
        if (progress?.phase === 'food') setInitialOnboardingStep(Math.max(1, Math.min(4, progress.step)));
        setSavedAt(response.updatedAtISO);
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Unable to load food preferences.'))
      .finally(() => setLoading(false));
  }, [clientId, mode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFoodLoading(true);
      setFoodError(null);
      searchFoodCatalogue(foodQuery)
        .then((response) => setFoodItems(response.items))
        .catch((requestError) => setFoodError(requestError instanceof Error ? requestError.message : 'Unable to load foods.'))
        .finally(() => setFoodLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [foodQuery]);

  const proteinVisible = profile.dietType === 'eggetarian' || profile.dietType === 'non_vegetarian';
  const selectedDietLabel = useMemo(() => diets.find((item) => item.value === profile.dietType)?.label ?? 'Not selected', [profile.dietType]);

  const update = <K extends keyof FoodPreferenceProfile>(key: K, value: FoodPreferenceProfile[K]) => setProfile((current) => ({ ...current, [key]: value }));
  const persistOnboardingProgress = useCallback((step: number, foodDraft: FoodPreferenceProfile) => {
    if (completionStarted.current) return;
    void setOnboardingRuntimeProgress(clientId, { phase: 'food', step, lifestyle: route.params?.lifestyle, foodDraft });
  }, [clientId, route.params?.lifestyle]);
  const save = async () => {
    if (!profile.dietType) {
      setError('Choose the diet that best describes you.');
      return;
    }
    completionStarted.current = mode === 'onboarding';
    setSaving(true);
    setSaveFailed(false);
    setError(null);
    try {
      const response = await saveFoodPreferences(profile);
      setProfile(response.profile);
      setSavedAt(response.updatedAtISO);
      if (mode === 'onboarding') {
        await setOnboardingRuntimeProgress(clientId, { phase: 'recovery', step: 1, lifestyle: route.params?.lifestyle, foodDraft: response.profile });
        navigation.push('OnboardingAssessment', { startPhase: 'recovery', lifestyle: route.params?.lifestyle });
      }
      else navigation.goBack();
    } catch (requestError) {
      completionStarted.current = false;
      setSaveFailed(true);
      setError("We couldn't save your preferences.\nYour selections are still here. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Screen><View style={styles.center}><Text style={[styles.body, { color: palette.textSecondary }]}>Loading your food preferences...</Text></View></Screen>;
  }

  if (mode === 'onboarding') {
    return <OnboardingFoodPreferencesFlow
      profile={profile}
      initialStep={initialOnboardingStep}
      onProgress={persistOnboardingProgress}
      update={update}
      foodQuery={foodQuery}
      setFoodQuery={setFoodQuery}
      foodItems={foodItems}
      foodLoading={foodLoading}
      foodError={foodError}
      saving={saving}
      saveFailed={saveFailed}
      error={error}
      onSave={save}
      onExit={() => navigation.goBack()}
    />;
  }

  return (
    <Screen scroll>
      <Text style={[styles.eyebrow, { color: palette.blue }]}>FOOD PREFERENCES</Text>
      <Text style={[styles.title, { color: palette.textPrimary }]}>Food Preferences</Text>
      <Text style={[styles.body, { color: palette.textSecondary }]}>Your choices help your consultant personalise recommendations. Clinical restrictions remain managed separately.</Text>

      <Card>
        <SectionTitle title="Your diet" color={palette.textPrimary} />
        <Text style={[styles.helper, { color: palette.textSecondary }]}>We'll use this to personalise your meal recommendations.</Text>
        <ChoiceGrid choices={diets} selected={profile.dietType ? [profile.dietType] : []} onToggle={(value) => update('dietType', value as FoodPreferenceProfile['dietType'])} palette={palette} />
      </Card>

      {proteinVisible ? <Card>
        <SectionTitle title="Which of these do you eat?" color={palette.textPrimary} />
        <ChoiceGrid choices={proteins} selected={profile.proteins} onToggle={(value) => update('proteins', toggle(profile.proteins, value))} palette={palette} />
      </Card> : null}

      <Card>
        <SectionTitle title="Cuisines you usually prefer" color={palette.textPrimary} />
        <Text style={[styles.helper, { color: palette.textSecondary }]}>We'll prioritise familiar foods where they fit your nutrition plan.</Text>
        <ChoiceGrid choices={cuisines} selected={profile.cuisines} onToggle={(value) => update('cuisines', toggle(profile.cuisines, value))} palette={palette} />
      </Card>

      <Card>
        <SectionTitle title="Main-meal staples" color={palette.textPrimary} />
        <ChoiceGrid choices={[{ label: 'Roti', value: 'roti' }, { label: 'Rice', value: 'rice' }, { label: 'Both', value: 'both' }, { label: 'No preference', value: 'none' }]} selected={profile.staplePreference ? [profile.staplePreference] : []} onToggle={(value) => update('staplePreference', value as FoodPreferenceProfile['staplePreference'])} palette={palette} />
      </Card>

      <Card>
        <SectionTitle title="Dairy" color={palette.textPrimary} />
        <ChoiceGrid choices={[{ label: 'Yes', value: 'allowed' }, { label: 'Prefer limited', value: 'limited' }, { label: 'No', value: 'avoid' }]} selected={profile.dairyPreference ? [profile.dairyPreference] : []} onToggle={(value) => update('dairyPreference', value as FoodPreferenceProfile['dairyPreference'])} palette={palette} />
        <Text style={[styles.helper, { color: palette.textSecondary }]}>Medical intolerances are kept in your Health Profile.</Text>
      </Card>

      <FoodPicker title="Foods you enjoy" helper="Choose foods you'd like us to consider more often." mode="likedFoodIds" activeMode={foodMode} setMode={setFoodMode} query={foodQuery} setQuery={setFoodQuery} items={foodItems} loading={foodLoading} error={foodError} selected={profile.likedFoodIds} onToggle={(id) => update('likedFoodIds', toggle(profile.likedFoodIds, id))} palette={palette} />
      <FoodPicker title="Foods you don't enjoy" helper="Dislikes are different from allergies." mode="dislikedFoodIds" activeMode={foodMode} setMode={setFoodMode} query={foodQuery} setQuery={setFoodQuery} items={foodItems} loading={foodLoading} error={foodError} selected={profile.dislikedFoodIds} onToggle={(id) => update('dislikedFoodIds', toggle(profile.dislikedFoodIds, id))} palette={palette} />
      <FoodPicker title="Anything you specifically avoid?" helper="Avoided foods are not treated as medical allergies." mode="avoidedFoodIds" activeMode={foodMode} setMode={setFoodMode} query={foodQuery} setQuery={setFoodQuery} items={foodItems} loading={foodLoading} error={foodError} selected={profile.avoidedFoodIds} onToggle={(id) => update('avoidedFoodIds', toggle(profile.avoidedFoodIds, id))} palette={palette} />

      <Card>
        <SectionTitle title="What works for your routine?" color={palette.textPrimary} />
        <ChoiceGrid choices={practicality} selected={profile.practicality} onToggle={(value) => update('practicality', toggle(profile.practicality, value))} palette={palette} />
      </Card>

      <Card>
        <SectionTitle title="Health restrictions already considered" color={palette.textPrimary} />
        <Text style={[styles.body, { color: palette.textSecondary }]}>{onboarding?.primaryConditions?.join(', ') || 'Your allergies and clinical restrictions are managed in your Health Profile.'}</Text>
      </Card>

      {savedAt ? <Text style={[styles.saved, { color: palette.textSecondary }]}>Last updated {new Date(savedAt).toLocaleDateString()}</Text> : null}
      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
      <PrimaryButton title={saving ? 'Saving...' : 'Save food preferences'} onPress={save} disabled={saving} />
    </Screen>
  );
};

const SectionTitle = ({ title, color }: { title: string; color: string }) => <Text style={[styles.sectionTitle, { color }]}>{title}</Text>;

const ChoiceGrid = ({ choices, selected, onToggle, palette }: { choices: Choice[]; selected: string[]; onToggle: (value: string) => void; palette: ReturnType<typeof getThemeColors> }) => (
  <View style={styles.choiceGrid}>
    {choices.map((choice) => {
      const active = selected.includes(choice.value);
      return <Pressable key={choice.value} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => onToggle(choice.value)} style={[styles.choice, { backgroundColor: palette.cardMuted, borderColor: palette.stroke }, active && { backgroundColor: palette.blue, borderColor: palette.blue }]}><Text style={[styles.choiceText, { color: active ? '#FFFFFF' : palette.textPrimary }]}>{choice.label}</Text></Pressable>;
    })}
  </View>
);

const FoodPicker = ({ title, helper, mode, activeMode, setMode, query, setQuery, items, loading, error, selected, onToggle, palette }: {
  title: string;
  helper: string;
  mode: 'likedFoodIds' | 'dislikedFoodIds' | 'avoidedFoodIds';
  activeMode: 'likedFoodIds' | 'dislikedFoodIds' | 'avoidedFoodIds';
  setMode: (mode: 'likedFoodIds' | 'dislikedFoodIds' | 'avoidedFoodIds') => void;
  query: string;
  setQuery: (query: string) => void;
  items: FoodCatalogueItem[];
  loading: boolean;
  error: string | null;
  selected: string[];
  onToggle: (id: string) => void;
  palette: ReturnType<typeof getThemeColors>;
}) => {
  return <Card>
    <SectionTitle title={title} color={palette.textPrimary} />
    <Text style={[styles.helper, { color: palette.textSecondary }]}>{helper}</Text>
    <TextInput accessibilityLabel={`Search ${title}`} value={activeMode === mode ? query : ''} onFocus={() => setMode(mode)} onChangeText={(value) => { setMode(mode); setQuery(value); }} placeholder="Search foods" placeholderTextColor={palette.textSecondary} style={[styles.searchInput, { color: palette.textPrimary, backgroundColor: palette.cardMuted, borderColor: palette.stroke }]} />
    {activeMode === mode && loading ? <Text style={[styles.helper, { color: palette.textSecondary }]}>Searching foods...</Text> : null}
    {activeMode === mode && error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
    {activeMode === mode && !loading && !error && !items.length ? <Text style={[styles.helper, { color: palette.textSecondary }]}>No foods found.</Text> : null}
    <View style={styles.choiceGrid}>{(activeMode === mode ? items : []).map((item) => {
      const active = selected.includes(item.id);
      return <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => onToggle(item.id)} style={[styles.choice, { backgroundColor: palette.cardMuted, borderColor: palette.stroke }, active && { backgroundColor: palette.blue, borderColor: palette.blue }]}><Text style={[styles.choiceText, { color: active ? '#FFFFFF' : palette.textPrimary }]}>{item.displayName}</Text></Pressable>;
    })}</View>
    {selected.length ? <Text style={[styles.selectedCount, { color: palette.textSecondary }]}>{selected.length} selected</Text> : null}
  </Card>;
};

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  eyebrow: { ...typography.caption, marginBottom: 8 },
  title: { ...typography.sectionTitle, fontSize: 20, lineHeight: 26, marginBottom: 8 },
  body: { ...typography.body, lineHeight: 22 },
  helper: { ...typography.caption, lineHeight: 18, marginBottom: 12 },
  sectionTitle: { ...typography.bodyStrong, fontSize: 14, lineHeight: 20, marginBottom: 6 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 44, paddingHorizontal: 14, borderWidth: 1, borderRadius: radius.sm, justifyContent: 'center' },
  choiceText: { ...typography.caption },
  searchInput: { minHeight: 46, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12, marginBottom: 10, ...typography.body },
  selectedCount: { ...typography.caption, marginTop: 10 },
  saved: { ...typography.caption, textAlign: 'center', marginVertical: 12 },
  error: { ...typography.caption, textAlign: 'center', marginVertical: 12 }
});
