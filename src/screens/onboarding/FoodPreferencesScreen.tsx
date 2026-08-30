import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { getThemeColors, radius, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import {
  emptyFoodPreferenceProfile,
  foodPreferencesMatch,
  getFoodPreferences,
  saveFoodPreferences,
  searchFoodCatalogue,
  type FoodCatalogueItem,
  type FoodPreferenceProfile
} from '../../services/foodPreferenceService';
import { OnboardingFoodPreferencesFlow } from './OnboardingFoodPreferencesFlow';
import { getOnboardingRuntimeProgress, setOnboardingRuntimeProgress } from '../../services/onboardingRuntimeProgress';
import { ApiClientError } from '../../services/apiClient';

type Props = NativeStackScreenProps<RootStackParamList, 'FoodPreferences'>;
type Choice = { label: string; value: string };
type SaveState = 'idle' | 'saving' | 'success' | 'error_recoverable' | 'error_nonrecoverable';
type LoadState = 'loading' | 'content' | 'offline' | 'auth_required' | 'error_recoverable';

const OPTIONAL_HYDRATION_TIMEOUT_MS = 2_000;

const resolveOptionalHydration = async <T,>(request: Promise<T>, fallback: T): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), OPTIONAL_HYDRATION_TIMEOUT_MS);
      })
    ]);
  } catch {
    return fallback;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export const classifyFoodPreferenceLoadError = (error: unknown): Exclude<LoadState, 'loading' | 'content'> => {
  if (error instanceof ApiClientError) {
    if (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN') return 'auth_required';
    if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') return 'offline';
  }
  return 'error_recoverable';
};

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
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [saveState, setSaveState] = useState<SaveState>('idle');
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
  const loadInFlight = useRef(false);
  const loadAttempt = useRef(0);
  const saveInFlight = useRef(false);
  const saving = saveState === 'saving';
  const saveFailed = saveState === 'error_recoverable' || saveState === 'error_nonrecoverable';

  const loadPreferences = useCallback(async () => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    const attempt = ++loadAttempt.current;
    setLoadState('loading');
    setError(null);

    const progressRequest = mode === 'onboarding'
      ? resolveOptionalHydration(getOnboardingRuntimeProgress(clientId), null)
      : Promise.resolve(null);

    try {
      const response = await getFoodPreferences();
      const progress = await progressRequest;
      if (attempt !== loadAttempt.current) return;
      const source = progress?.phase === 'food' && progress.foodDraft ? progress.foodDraft : response.profile;
      setProfile({ ...emptyFoodPreferenceProfile(), ...source, likedFoodIds: source.likedFoodIds ?? [], dislikedFoodIds: source.dislikedFoodIds ?? [], avoidedFoodIds: source.avoidedFoodIds ?? [] });
      if (progress?.phase === 'food') setInitialOnboardingStep(Math.max(1, Math.min(4, progress.step)));
      setSavedAt(response.updatedAtISO);
      if (mode === 'onboarding' && progress?.phase === 'food' && progress.foodDraft && (progress.saveState === 'saving' || progress.saveState === 'error_recoverable')) {
        if (foodPreferencesMatch(progress.foodDraft, response.profile)) {
          completionStarted.current = true;
          void setOnboardingRuntimeProgress(clientId, { phase: 'recovery', step: 1, lifestyle: route.params?.lifestyle, foodDraft: response.profile, saveState: 'success' });
          navigation.replace('OnboardingAssessment', { startPhase: 'recovery', resumeStep: 1, lifestyle: route.params?.lifestyle });
        } else {
          setSaveState('error_recoverable');
          setError("We couldn't confirm whether your preferences were saved.\nYour selections are still here. Please try again.");
        }
      }
      setLoadState('content');
    } catch (requestError) {
      if (attempt !== loadAttempt.current) return;
      setLoadState(classifyFoodPreferenceLoadError(requestError));
      setError(requestError instanceof ApiClientError && (requestError.code === 'UNAUTHORIZED' || requestError.code === 'FORBIDDEN')
        ? 'Your session has expired. Please sign in again, then try once more.'
        : "We couldn't load your food preferences.");
    } finally {
      if (attempt === loadAttempt.current) loadInFlight.current = false;
    }
  }, [clientId, mode, navigation, route.params?.lifestyle]);

  useEffect(() => {
    void loadPreferences();
    return () => {
      loadAttempt.current += 1;
      loadInFlight.current = false;
    };
  }, [loadPreferences]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFoodLoading(true);
      setFoodError(null);
      searchFoodCatalogue(foodQuery)
        .then((response) => setFoodItems(response.items))
        .catch(() => setFoodError("Foods couldn't be loaded. Check your connection and try again."))
        .finally(() => setFoodLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [foodQuery]);

  const proteinVisible = profile.dietType === 'eggetarian' || profile.dietType === 'non_vegetarian';
  const selectedDietLabel = useMemo(() => diets.find((item) => item.value === profile.dietType)?.label ?? 'Not selected', [profile.dietType]);

  const update = <K extends keyof FoodPreferenceProfile>(key: K, value: FoodPreferenceProfile[K]) => setProfile((current) => ({ ...current, [key]: value }));
  const persistOnboardingProgress = useCallback((step: number, foodDraft: FoodPreferenceProfile) => {
    if (completionStarted.current) return;
    void setOnboardingRuntimeProgress(clientId, { phase: 'food', step, lifestyle: route.params?.lifestyle, foodDraft, saveState: 'idle' });
  }, [clientId, route.params?.lifestyle]);
  const save = async () => {
    if (saveInFlight.current) return;
    if (!profile.dietType) {
      setSaveState('error_nonrecoverable');
      setError('Choose the diet that best describes you.');
      return;
    }
    saveInFlight.current = true;
    completionStarted.current = mode === 'onboarding';
    setSaveState('saving');
    setError(null);
    try {
      if (mode === 'onboarding') await setOnboardingRuntimeProgress(clientId, { phase: 'food', step: 4, lifestyle: route.params?.lifestyle, foodDraft: profile, saveState: 'saving' });
      const response = await saveFoodPreferences(profile);
      setSaveState('success');
      setProfile(response.profile);
      setSavedAt(response.updatedAtISO);
      if (mode === 'onboarding') {
        await setOnboardingRuntimeProgress(clientId, { phase: 'recovery', step: 1, lifestyle: route.params?.lifestyle, foodDraft: response.profile, saveState: 'success' });
        navigation.push('OnboardingAssessment', { startPhase: 'recovery', resumeStep: 1, lifestyle: route.params?.lifestyle });
      }
      else navigation.goBack();
    } catch (requestError) {
      completionStarted.current = false;
      setSaveState('error_recoverable');
      setError("We couldn't save your preferences.\nYour selections are still here. Please try again.");
      if (mode === 'onboarding') await setOnboardingRuntimeProgress(clientId, { phase: 'food', step: 4, lifestyle: route.params?.lifestyle, foodDraft: profile, saveState: 'error_recoverable' });
    } finally {
      saveInFlight.current = false;
    }
  };

  if (loadState === 'loading') {
    return <Screen><View testID="food.loading" style={styles.center} accessibilityRole="progressbar" accessibilityLabel="Loading your food preferences"><Card><View style={styles.loadCard}><ActivityIndicator color={palette.blue} size="large" /><Text style={[styles.loadTitle, { color: palette.textPrimary }]}>Loading your food preferences</Text><Text style={[styles.body, styles.centerText, { color: palette.textSecondary }]}>Bringing back your saved choices.</Text></View></Card></View></Screen>;
  }

  if (loadState !== 'content') {
    return <Screen>
      <View style={styles.loadHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={[styles.backButton, { borderColor: palette.stroke }]}>
          <Text style={[styles.backLabel, { color: palette.textPrimary }]}>‹</Text>
        </Pressable>
      </View>
      <View style={styles.center}>
        <Card>
          <View testID="food.error" style={styles.loadCard}>
            <Text style={[styles.loadTitle, { color: palette.textPrimary }]}>{error}</Text>
            <Text style={[styles.body, styles.centerText, { color: palette.textSecondary }]}>{loadState === 'offline' ? 'Check your connection and try again.' : loadState === 'auth_required' ? 'Your saved selections are still safe.' : 'Please try again.'}</Text>
            <PrimaryButton testID="food.retry" title="Try again" onPress={loadPreferences} />
          </View>
        </Card>
      </View>
    </Screen>;
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
      <View pointerEvents={saving ? 'none' : 'auto'} accessibilityState={{ disabled: saving }}>
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
      </View>
      {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
      <PrimaryButton testID="food.save" title={saving ? 'Saving...' : 'Save food preferences'} onPress={save} disabled={saving} />
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
    <TextInput testID="food.avoid.search" accessibilityLabel={`Search ${title}`} value={activeMode === mode ? query : ''} onFocus={() => setMode(mode)} onChangeText={(value) => { setMode(mode); setQuery(value); }} placeholder="Search foods" placeholderTextColor={palette.textSecondary} style={[styles.searchInput, { color: palette.textPrimary, backgroundColor: palette.cardMuted, borderColor: palette.stroke }]} />
    {activeMode === mode && loading ? <Text testID="food.loading" style={[styles.helper, { color: palette.textSecondary }]}>Searching foods...</Text> : null}
    {activeMode === mode && error ? <Text testID="food.error" style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
    {activeMode === mode && !loading && !error && !items.length ? <Text style={[styles.helper, { color: palette.textSecondary }]}>No foods found.</Text> : null}
    <View style={styles.choiceGrid}>{(activeMode === mode ? items : []).map((item) => {
      const active = selected.includes(item.id);
      return <Pressable testID={`food.result.${item.id}`} key={item.id} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => onToggle(item.id)} style={[styles.choice, { backgroundColor: palette.cardMuted, borderColor: palette.stroke }, active && { backgroundColor: palette.blue, borderColor: palette.blue }]}><Text style={[styles.choiceText, { color: active ? '#FFFFFF' : palette.textPrimary }]}>{item.displayName}</Text></Pressable>;
    })}</View>
    {selected.length ? <Text style={[styles.selectedCount, { color: palette.textSecondary }]}>{selected.length} selected</Text> : null}
  </Card>;
};

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerText: { textAlign: 'center' },
  loadHeader: { minHeight: 52, alignItems: 'flex-start' },
  backButton: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backLabel: { fontFamily: 'Exo_400Regular', fontSize: 32, lineHeight: 36, marginTop: -4 },
  loadCard: { minWidth: 280, maxWidth: 420, gap: 12, alignItems: 'center', paddingVertical: 12 },
  loadTitle: { ...typography.sectionTitle, textAlign: 'center' },
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
