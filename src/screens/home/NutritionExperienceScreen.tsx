import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Circle } from 'react-native-svg';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Screen } from '../../components/Screen';
import { radius, spacing, typography } from '../../design/tokens';
import { useAppContext } from '../../state/AppContext';
import {
  getCravingSuggestions,
  getEatingOutSuggestions,
  getNutritionExperience,
  getNutritionPattern,
  getWhatCanIEatNow,
  logNutritionEvent,
  logWater,
  NutritionRecommendationItem,
  NutritionRecommendationResponse,
  NutritionExperience,
  NutritionMeal,
} from '../../services/nutritionExperienceService';
import { nutritionDate, subscribeToNutritionDay } from '../../utils/nutritionDate';

const C = { bg: '#07070B', card: '#111117', raised: '#181820', line: '#272733', text: '#F3F2FA', muted: '#898899', blue: '#43C4FA', green: '#4BE38A', yellow: '#FFC229', purple: '#A985FF' };
const fmt = (value: number | null) => value == null ? '—' : Math.round(value).toLocaleString('en-IN');
const ratio = (value: number, target: number | null) => target && target > 0 ? Math.max(0, Math.min(1, value / target)) : 0;
const day = () => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
const isoDay = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
};

type RecommendationMode = 'what-can-eat-now' | 'eating-out' | 'craving' | null;
type PendingRecommendationEvent = {
  item: NutritionRecommendationItem;
  mealKey: string;
};

export const NutritionExperienceScreen = () => {
  useAppContext();
  const [data, setData] = React.useState<NutritionExperience | null>(null);
  const [pattern, setPattern] = React.useState<Awaited<ReturnType<typeof getNutritionPattern>> | null>(null);
  const [tab, setTab] = React.useState<'today' | 'pattern'>('today');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<NutritionMeal | null>(null);
  const [recommendationMode, setRecommendationMode] = React.useState<RecommendationMode>(null);
  const [recommendations, setRecommendations] = React.useState<NutritionRecommendationResponse | null>(null);
  const [recommendationError, setRecommendationError] = React.useState<string | null>(null);
  const [recommendationLoading, setRecommendationLoading] = React.useState(false);
  const [craving, setCraving] = React.useState('sweet');
  const [activeCuisine, setActiveCuisine] = React.useState('north indian');
  const [pendingRecommendation, setPendingRecommendation] = React.useState<PendingRecommendationEvent | null>(null);
  const [selectedDate, setSelectedDate] = React.useState(() => nutritionDate());
  const viewingToday = React.useRef(true);
  const [showCalendar, setShowCalendar] = React.useState(false);
  const [draftDate, setDraftDate] = React.useState(() => new Date());
  const [showWater, setShowWater] = React.useState(false);
  const [waterAmount, setWaterAmount] = React.useState(.25);
  const [waterError, setWaterError] = React.useState<string | null>(null);
  const refresh = React.useCallback(async () => { setError(null); try { setData(await getNutritionExperience(selectedDate)); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load Nutrition.'); } }, [selectedDate]);
  useFocusEffect(React.useCallback(() => {
    const today = nutritionDate();
    if (viewingToday.current && selectedDate !== today) setSelectedDate(today);
    else void refresh();
  }, [refresh, selectedDate]));
  React.useEffect(() => subscribeToNutritionDay((today) => {
    if (viewingToday.current) {
      setSelectedDate(today);
      setPattern(null);
    }
  }), []);

  const loadRecommendations = React.useCallback(async (mode: RecommendationMode, date: string, mealKey?: string) => {
    if (!mode) return;
    setRecommendationLoading(true);
    setRecommendationError(null);
    try {
      if (mode === 'what-can-eat-now') {
        setRecommendations(await getWhatCanIEatNow(mealKey, date));
      } else if (mode === 'eating-out') {
        setRecommendations(await getEatingOutSuggestions({ mealKey, date, cuisine: activeCuisine }));
      } else {
        setRecommendations(await getCravingSuggestions({ mealKey, date, craving }));
      }
    } catch (e) {
      setRecommendations(null);
      setRecommendationError(e instanceof Error ? e.message : 'Unable to load recommendations.');
    } finally {
      setRecommendationLoading(false);
    }
  }, [activeCuisine, craving]);

  const openRecommendation = (mode: RecommendationMode, mealKey?: string) => {
    const currentDate = data?.selectedDate ?? selectedDate;
    setRecommendationError(null);
    setRecommendations(null);
    setRecommendationMode(mode);
    void loadRecommendations(mode, currentDate, mealKey);
  };

  const queueRecommendation = (item: NutritionRecommendationItem, mealKey: string) => {
    if (!data || selectedDate !== nutritionDate()) return;
    setPendingRecommendation({ item, mealKey });
  };

  const confirmRecommendation = async () => {
    if (!data || !pendingRecommendation) return;
    setBusy(true);
    try {
      const isApproved = pendingRecommendation.item.recommendationMode === 'approved';
      setData(await logNutritionEvent({
        planId: data.plan.id,
        versionId: data.version.id,
        mealKey: pendingRecommendation.mealKey,
        state: isApproved ? 'CONSUMED_APPROVED' : 'CONSUMED_OUT_OF_PLAN',
        optionId: isApproved ? pendingRecommendation.item.id ?? null : null,
        mealName: pendingRecommendation.item.mealName,
        calories: pendingRecommendation.item.approxKcal,
        proteinGrams: pendingRecommendation.item.proteinGrams,
        carbsGrams: pendingRecommendation.item.carbsGrams,
        fatGrams: pendingRecommendation.item.fatGrams,
        fibreGrams: pendingRecommendation.item.fibreGrams,
        consumedAtISO: new Date().toISOString(),
      }));
      setPendingRecommendation(null);
      setRecommendationMode(null);
      setRecommendations(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to log this recommendation.');
    } finally {
      setBusy(false);
    }
  };

  const updateMeal = async (meal: NutritionMeal, state: 'CONSUMED_APPROVED' | 'SKIPPED', option = meal.options[0]) => {
    if (!data) return;
    setBusy(true);
    try { setData(await logNutritionEvent({ planId: data.plan.id, versionId: data.version.id, mealKey: meal.key, state, optionId: option?.id ?? null, mealName: option?.meal ?? null, calories: option?.approxKcal ?? null, proteinGrams: option?.proteinGrams ?? null, carbsGrams: option?.carbsGrams ?? null, fatGrams: option?.fatGrams ?? null, fibreGrams: option?.fibreGrams ?? null })); setSelected(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update this meal.'); }
    finally { setBusy(false); }
  };

  if (!data && !error) return <Screen contentStyle={styles.center}><ActivityIndicator color={C.blue} /></Screen>;
  if (!data) return <Screen contentStyle={styles.screen}><Text style={styles.title}>Nutrition</Text><View style={styles.card}><Text style={styles.body}>{error}</Text><Pressable onPress={() => void refresh()}><Text style={styles.blue}>Try again</Text></Pressable></View></Screen>;
  const pending = data.meals.filter(meal => meal.state === 'PENDING').length;
  const recommendedMealKey = data.meals.find(meal => meal.state === 'PENDING')?.key ?? data.meals[0]?.key;
  const isToday = selectedDate === nutritionDate();
  const selectedLabel = isToday ? `Today, ${day()}` : new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const onDateChange = (_event: DateTimePickerEvent, value?: Date) => { if (value) setDraftDate(value); };
  const saveWater = async () => {
    setBusy(true); setWaterError(null);
    try { setData(await logWater({ planId: data.plan.id, versionId: data.version.id, waterMl: Math.round(waterAmount * 1000) })); setShowWater(false); }
    catch { setWaterError('Unable to add water. Please try again.'); }
    finally { setBusy(false); }
  };

  return <Screen scroll contentStyle={styles.screen}>
    <View style={styles.topRow}><View style={styles.tabs}><Tab label="Today's Plan" active={tab === 'today'} onPress={() => setTab('today')} /><Tab label="My Pattern" active={tab === 'pattern'} onPress={async () => { setTab('pattern'); if (!pattern) setPattern(await getNutritionPattern(selectedDate)); }} /></View><Pressable accessibilityRole="button" accessibilityLabel="Select Nutrition date" onPress={() => { setDraftDate(new Date(`${selectedDate}T12:00:00`)); setShowCalendar(true); }} style={styles.calendar}><Ionicons name="calendar-outline" size={20} color={C.text} /></Pressable></View>
    <Text style={styles.date}>{selectedLabel}</Text>
    <Modal visible={showCalendar} transparent animationType="slide" onRequestClose={() => setShowCalendar(false)}><Pressable style={styles.backdrop} onPress={() => setShowCalendar(false)}><Pressable style={styles.pickerSheet} onPress={() => undefined}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><Pressable onPress={() => setShowCalendar(false)}><Text style={styles.sheetCancel}>Cancel</Text></Pressable><Text style={styles.sheetTitle}>Select date</Text><Pressable onPress={() => { const nextDate = isoDay(draftDate); viewingToday.current = nextDate === nutritionDate(); setSelectedDate(nextDate); setPattern(null); setShowCalendar(false); }}><Text style={styles.sheetDone}>Done</Text></Pressable></View><DateTimePicker value={draftDate} mode="date" display="inline" maximumDate={new Date()} onChange={onDateChange} themeVariant="dark" /></Pressable></Pressable></Modal>
    {tab === 'pattern' ? <Pattern pattern={pattern} /> : <>
      {data.consultantNote ? <View style={styles.consultant}><View style={styles.info}><Ionicons name="information-circle-outline" size={25} color={C.blue} /></View><View style={styles.flex}><Text style={styles.consultantLabel}>FROM YOUR CONSULTANT</Text><Text style={styles.consultantText}>{data.consultantNote}</Text></View></View> : null}
      <View style={styles.planStrip}><View style={styles.pill}><Text style={styles.pillText}>Active plan</Text></View><Text style={styles.muted}>·</Text><Text numberOfLines={1} style={[styles.muted, styles.flex]}>{data.version.content.nutritionSnapshot.programmeName}</Text><Text style={styles.muted}>v{data.version.versionNumber}</Text></View>
      <Summary data={data} />
      <View style={styles.twoCol}>
        <View style={[styles.card, styles.metric]}><Text style={[styles.label, styles.blue]}>WATER</Text><Text style={styles.value}>{data.water.litres.toFixed(1)} <Text style={styles.unit}>/ {data.water.targetLitres ?? '—'} L</Text></Text><Progress value={ratio(data.water.litres, data.water.targetLitres)} color={C.blue} /><Pressable disabled={busy || !isToday} onPress={() => { setWaterError(null); setShowWater(true); }} style={[styles.waterButton, !isToday && styles.disabled]}><Text style={styles.waterText}>{isToday ? '+ Add water' : 'History is read-only'}</Text></Pressable>{waterError ? <Text style={styles.errorText}>{waterError}</Text> : null}</View>
        <View style={[styles.card, styles.metric]}><Text style={styles.label}>MEALS LOGGED</Text><Text style={styles.value}>{data.mealsFollowed} <Text style={styles.unit}>of {data.mealCount}</Text></Text><View style={styles.dots}>{data.meals.map(meal => <View key={meal.key} style={[styles.dot, { backgroundColor: meal.state === 'CONSUMED_APPROVED' ? C.green : meal.state === 'CONSUMED_OUT_OF_PLAN' || meal.state === 'SKIPPED' ? C.yellow : C.line }]} />)}</View><Text style={styles.muted}>{pending} pending{data.skippedCount ? ` · ${data.skippedCount} skipped` : ''}{data.outOfPlanCount ? ` · ${data.outOfPlanCount} out of plan` : ''}</Text></View>
      </View>
      <Balance
        data={data}
        onOpenRecommendation={isToday && recommendedMealKey ? () => openRecommendation('what-can-eat-now', recommendedMealKey) : undefined}
        onOpenEatingOut={isToday && recommendedMealKey ? () => openRecommendation('eating-out', recommendedMealKey) : undefined}
        onOpenCraving={isToday && recommendedMealKey ? () => openRecommendation('craving', recommendedMealKey) : undefined}
      />
      <PlannedActual data={data} />
      <Adherence data={data} />
      <Text style={styles.section}>TODAY'S MEALS</Text>
      {data.meals.map(meal => <Meal key={meal.key} meal={meal} busy={busy || !isToday} onChoose={() => setSelected(meal)} onSkip={() => void updateMeal(meal, 'SKIPPED')} />)}
      <Modal visible={selected != null} transparent animationType="slide" onRequestClose={() => setSelected(null)}><View style={styles.backdrop}><View style={styles.modal}><Text style={styles.modalTitle}>Choose your {selected?.label}</Text><Text style={styles.muted}>Consultant-approved options</Text><ScrollView contentContainerStyle={styles.options}>{selected?.options.map(option => <Pressable key={`${selected.key}-${option.id ?? option.slot}`} disabled={busy} onPress={() => void updateMeal(selected, 'CONSUMED_APPROVED', option)} style={styles.option}><Text style={styles.optionName}>{option.meal}</Text><Text style={styles.muted}>{option.portion} · {option.approxKcal ?? '—'} kcal · P {option.proteinGrams ?? '—'}g</Text></Pressable>)}</ScrollView><Pressable onPress={() => setSelected(null)} style={styles.cancel}><Text style={styles.body}>Cancel</Text></Pressable></View></View></Modal>
      <Modal visible={showWater} transparent animationType="slide" onRequestClose={() => setShowWater(false)}><Pressable style={styles.backdrop} onPress={() => setShowWater(false)}><Pressable style={styles.pickerSheet} onPress={() => undefined}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><Pressable onPress={() => setShowWater(false)}><Text style={styles.sheetCancel}>Cancel</Text></Pressable><Text style={styles.sheetTitle}>Add water</Text><View style={styles.sheetHeaderSpacer} /></View><Text style={styles.waterPrompt}>How much water did you drink?</Text><View style={styles.waterAmounts}>{[.25, .5, .75, 1].map(amount => <Pressable key={amount} onPress={() => setWaterAmount(amount)} style={[styles.waterAmount, waterAmount === amount && styles.waterAmountActive]}><Text style={[styles.waterAmountText, waterAmount === amount && styles.waterAmountTextActive]}>{amount < 1 ? `${amount * 1000} ml` : '1 L'}</Text></Pressable>)}</View><Pressable disabled={busy} onPress={() => void saveWater()} style={[styles.saveWater, busy && styles.disabled]}><Text style={styles.saveWaterText}>{busy ? 'Adding…' : 'Add water'}</Text></Pressable></Pressable></Pressable></Modal>
      <RecommendationModal
        visible={Boolean(recommendationMode)}
        mode={recommendationMode}
        recommendations={recommendations}
        loading={recommendationLoading}
        error={recommendationError}
        activeCuisine={activeCuisine}
        craving={craving}
        busy={busy}
        onClose={() => { setRecommendationMode(null); setRecommendations(null); }}
        onCuisine={(cuisine) => {
          setActiveCuisine(cuisine);
          void loadRecommendations('eating-out', data.selectedDate, recommendedMealKey);
        }}
        onCraving={(type) => {
          setCraving(type);
          void loadRecommendations('craving', data.selectedDate, recommendedMealKey);
        }}
        onChoose={(item, mealKey) => queueRecommendation(item, mealKey)}
      />
      <Modal visible={Boolean(pendingRecommendation)} transparent animationType="slide" onRequestClose={() => setPendingRecommendation(null)}><View style={styles.backdrop}><View style={styles.pickerSheet}><View style={styles.sheetHandle} /><Text style={styles.modalTitle}>Confirm logging</Text><Text style={styles.optionName}>{pendingRecommendation?.item.mealName}</Text><Text style={styles.muted}>Portion: {pendingRecommendation?.item.portion}</Text><Text style={styles.muted}>Type: {pendingRecommendation?.item.recommendationMode === 'approved' ? 'Approved meal' : 'Out-of-plan'}</Text><Text style={styles.muted}>Macros: kcal {pendingRecommendation?.item.approxKcal ?? '—'} / P {pendingRecommendation?.item.proteinGrams ?? '—'}g / C {pendingRecommendation?.item.carbsGrams ?? '—'}g / F {pendingRecommendation?.item.fatGrams ?? '—'}g / Fibre {pendingRecommendation?.item.fibreGrams ?? '—'}g</Text><Pressable disabled={busy} onPress={() => void confirmRecommendation()} style={[styles.primary, { marginTop: 12 }, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Logging…' : 'I ate this'}</Text></Pressable><Pressable onPress={() => setPendingRecommendation(null)} style={[styles.cancel, { marginTop: 8 }]}><Text style={styles.body}>Cancel</Text></Pressable></View></View></Modal>
    </>}
  </Screen>;
};

const Tab = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.tab, active && styles.tabActive]}><Text style={[styles.tabText, active && styles.body]}>{label}</Text></Pressable>;
const Progress = ({ value, color }: { value: number; color: string }) => <View style={styles.track}><View style={[styles.fill, { width: `${value * 100}%`, backgroundColor: color }]} /></View>;

const Summary = ({ data }: { data: NutritionExperience }) => {
  const day = () => new Date(`${data.selectedDate}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const targets = data.version.content.dailyTargets;
  const circumference = 2 * Math.PI * 52;
  const rows = [
    ['Protein', data.totals.protein, targets.protein, C.green],
    ['Carbs', data.totals.carbs, data.remaining.carbs == null ? null : data.totals.carbs + data.remaining.carbs, C.yellow],
    ['Fat', data.totals.fat, data.remaining.fat == null ? null : data.totals.fat + data.remaining.fat, C.purple],
    ['Fibre', data.totals.fibre, data.remaining.fibre == null ? null : data.totals.fibre + data.remaining.fibre, C.blue]
  ] as const;
  return <View style={[styles.card, styles.summary]}><View style={styles.between}><Text style={styles.label}>TODAY'S NUTRITION</Text><Text style={styles.muted}>{day()}</Text></View><View style={styles.summaryBody}><View style={styles.ring}><Svg width={132} height={132} viewBox="0 0 120 120"><Circle cx="60" cy="60" r="52" stroke={C.line} strokeWidth="10" fill="none" /><Circle cx="60" cy="60" r="52" stroke={C.green} strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio(data.totals.calories, targets.calories))} transform="rotate(-90 60 60)" /></Svg><View style={styles.ringText}><Text style={styles.kcal}>{fmt(data.totals.calories)}</Text><Text style={styles.muted}>of {fmt(targets.calories)} kcal</Text><Text style={styles.remaining}>{fmt(data.remaining.calories)} remaining</Text></View></View><View style={styles.macros}>{rows.map(([label, value, target, color]) => <View key={label} style={styles.macro}><View style={styles.between}><Text style={styles.macroLabel}>{label}</Text><Text style={[styles.macroValue, { color }]}>{fmt(value)}/{fmt(target)}g</Text></View><Progress value={ratio(value, target)} color={color} /></View>)}</View></View></View>;
};

const Balance = ({ data, onOpenRecommendation, onOpenEatingOut, onOpenCraving }: {
  data: NutritionExperience;
  onOpenRecommendation?: () => void;
  onOpenEatingOut?: () => void;
  onOpenCraving?: () => void;
}) => {
  const needs = [['protein', data.remaining.protein], ['fibre', data.remaining.fibre]].filter(([, v]) => typeof v === 'number' && v > 0).map(([name]) => name);
  return <View style={styles.balance}><View style={styles.balanceIcon}><Ionicons name="git-compare-outline" size={25} color={C.green} /></View><View style={styles.flex}><Text style={styles.balanceTitle}>Balance My Day</Text><Text style={styles.balanceBody}>{needs.length ? `${needs.join(' and ')} still ${needs.length > 1 ? 'need' : 'needs'} attention for the rest of your day.` : 'Your logged nutrition is currently balanced against today’s plan.'}</Text>{data.meals.some(meal => meal.state === 'PENDING') ? <Text style={styles.balanceBody}>Your remaining approved meals have been ranked to help balance the rest of your day.</Text> : null}<View style={styles.recommendationQuickRow}><Pressable disabled={!onOpenRecommendation} onPress={onOpenRecommendation} style={[styles.quickBtn, !onOpenRecommendation && styles.disabled]}><Text style={styles.quickBtnText}>What can I eat now</Text></Pressable><Pressable disabled={!onOpenEatingOut} onPress={onOpenEatingOut} style={[styles.quickBtn, !onOpenEatingOut && styles.disabled]}><Text style={styles.quickBtnText}>Eating Out</Text></Pressable></View><Pressable disabled={!onOpenCraving} onPress={onOpenCraving} style={[styles.quickBtn, styles.quickBtnWide, !onOpenCraving && styles.disabled]}><Text style={styles.quickBtnText}>Craving</Text></Pressable></View></View>;
};

const RecommendationModal = ({
  visible,
  mode,
  recommendations,
  loading,
  error,
  activeCuisine,
  craving,
  busy,
  onClose,
  onCuisine,
  onCraving,
  onChoose,
}: {
  visible: boolean;
  mode: RecommendationMode;
  recommendations: NutritionRecommendationResponse | null;
  loading: boolean;
  error: string | null;
  activeCuisine: string;
  craving: string;
  busy: boolean;
  onClose: () => void;
  onCuisine: (cuisine: string) => void;
  onCraving: (craving: string) => void;
  onChoose: (item: NutritionRecommendationItem, mealKey: string) => void;
}) => <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><View style={styles.modal}><Text style={styles.modalTitle}>{mode === 'what-can-eat-now' ? 'What can I eat now' : mode === 'eating-out' ? 'Eating Out' : 'Craving Suggestions'}</Text>{error ? <Text style={styles.errorText}>{error}</Text> : null}{mode === 'eating-out' ? <ScrollView horizontal style={styles.rowScroll} contentContainerStyle={styles.rowScrollContent}>{['north indian', 'south indian', 'chinese', 'continental', 'fast food'].map(cuisine => <Pressable key={cuisine} onPress={() => onCuisine(cuisine)} style={[styles.chip, activeCuisine === cuisine && styles.chipActive]}><Text style={styles.chipText}>{cuisine}</Text></Pressable>)}</ScrollView> : null}{mode === 'craving' ? <ScrollView horizontal style={styles.rowScroll} contentContainerStyle={styles.rowScrollContent}>{['sweet', 'salty', 'crunchy', 'spicy'].map(type => <Pressable key={type} onPress={() => onCraving(type)} style={[styles.chip, craving === type && styles.chipActive]}><Text style={styles.chipText}>{type}</Text></Pressable>)}</ScrollView> : null}{loading ? <ActivityIndicator color={C.blue} style={{ marginVertical: spacing.md }} /> : <ScrollView contentContainerStyle={styles.options}>{recommendations?.recommendations.map(item => <Pressable key={`${item.slot}-${item.mealName}`} disabled={busy} onPress={() => onChoose(item, recommendations.mealKey)} style={styles.option}><View style={styles.between}><Text style={styles.optionName}>{item.mealName}</Text><Text style={[styles.muted, styles.uppercase]}>{item.recommendationMode === 'approved' ? 'Approved' : 'Out of plan'}</Text></View><Text style={styles.muted}>{item.portion} · {item.approxKcal ?? '—'} kcal · P {item.proteinGrams ?? '—'}g</Text></Pressable>)}</ScrollView>}<Pressable onPress={onClose} style={styles.cancel}><Text style={styles.body}>Close</Text></Pressable></View></View></Modal>;

const PlannedActual = ({ data }: { data: NutritionExperience }) => <View style={[styles.card, styles.compactSection]}><Text style={styles.label}>PLANNED VS ACTUAL</Text>{[
  ['Calories', `${fmt(data.plannedVsActual.calories.planned)} kcal`, `${fmt(data.plannedVsActual.calories.actual)} kcal`],
  ['Meals followed', `${data.plannedVsActual.mealsFollowed.planned} meals`, `${data.plannedVsActual.mealsFollowed.actual} / ${data.plannedVsActual.mealsFollowed.planned}`],
  ['Out-of-plan', '—', `${data.plannedVsActual.outOfPlan} item${data.plannedVsActual.outOfPlan === 1 ? '' : 's'}`],
  ['Skipped', '—', `${data.plannedVsActual.skipped} meal${data.plannedVsActual.skipped === 1 ? '' : 's'}`],
].map(([label, planned, actual]) => <View key={label} style={styles.tableRow}><Text style={styles.macroLabel}>{label}</Text><View style={styles.tableValues}><Text style={styles.muted}>{planned}</Text><Text style={styles.body}>{actual}</Text></View></View>)}</View>;

const Adherence = ({ data }: { data: NutritionExperience }) => {
  return <View style={[styles.card, styles.compactSection]}><View style={styles.between}><Text style={styles.label}>TODAY'S ADHERENCE</Text><Text style={styles.adherenceBadge}>{data.adherence.label}</Text></View>{data.mealStates.map(item => <View key={item.mealHeadId} style={styles.adherenceRow}><View style={[styles.stateDot, item.status === 'CONSUMED_APPROVED' && { backgroundColor: C.green }, item.status === 'CONSUMED_OUT_OF_PLAN' && { backgroundColor: C.yellow }]} /><Text style={[styles.macroLabel, styles.flex]}>{item.mealHeadName}</Text><Text style={[styles.status, item.status === 'CONSUMED_APPROVED' && { color: C.green }, item.status === 'CONSUMED_OUT_OF_PLAN' && { color: C.yellow }]}>{item.status === 'CONSUMED_APPROVED' ? '✓' : item.status === 'CONSUMED_OUT_OF_PLAN' ? 'Out of plan' : item.status === 'SKIPPED' ? 'Skipped' : 'Pending'}</Text></View>)}</View>;
};

const Meal = ({ meal, busy, onChoose, onSkip }: { meal: NutritionMeal; busy: boolean; onChoose: () => void; onSkip: () => void }) => {
  const option = meal.options[0];
  const state = meal.state === 'PENDING' ? 'PENDING' : meal.state === 'SKIPPED' ? 'SKIPPED' : meal.state === 'CONSUMED_OUT_OF_PLAN' ? 'OUT OF PLAN' : 'CONSUMED';
  return <View style={[styles.card, styles.meal]}><View style={styles.between}><View><Text style={styles.mealTitle}>{meal.label}</Text><Text style={styles.muted}>{meal.window}</Text></View><Text style={[styles.status, meal.state === 'CONSUMED_APPROVED' && { color: C.green }, meal.state === 'CONSUMED_OUT_OF_PLAN' && { color: C.yellow }]}>{state}</Text></View>{option ? <><Text style={styles.optionName}>{option.meal}</Text><Text style={styles.muted}>{option.portion} · {option.approxKcal ?? '—'} kcal</Text><Text style={styles.nutrients}>P {option.proteinGrams ?? '—'}g · C {option.carbsGrams ?? '—'}g · F {option.fatGrams ?? '—'}g · Fibre {option.fibreGrams ?? '—'}g</Text></> : <Text style={styles.muted}>No approved options provided.</Text>}{meal.state === 'PENDING' ? <View style={styles.actions}><Pressable disabled={busy} onPress={onChoose} style={styles.primary}><Text style={styles.primaryText}>Choose meal</Text></Pressable><Pressable disabled={busy} onPress={onSkip} style={styles.secondary}><Text style={styles.body}>Skip</Text></Pressable></View> : meal.consumedAtISO ? <Text style={styles.muted}>Logged {new Date(meal.consumedAtISO).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text> : null}</View>;
};

const Pattern = ({ pattern }: { pattern: Awaited<ReturnType<typeof getNutritionPattern>> | null }) => pattern ? <><Text style={styles.section}>MY NUTRITION PATTERN</Text><Text style={styles.muted}>{pattern.startDate} – {pattern.endDate}</Text><View style={styles.patternGrid}><Metric label="Plan adherence" value={pattern.planAdherencePercent == null ? '—' : `${pattern.planAdherencePercent}%`} /><Metric label="Out-of-plan meals" value={String(pattern.outOfPlanMeals)} /><Metric label="Skipped meals" value={String(pattern.skippedMeals)} /><Metric label="Water target days" value={pattern.waterTargetDays == null ? '—' : `${pattern.waterTargetDays}/${pattern.periodDays}`} /></View><View style={[styles.card, styles.compactSection]}><Text style={styles.label}>DAILY ADHERENCE</Text><View style={styles.dailyBars}>{pattern.dailyAdherence.map(day => <View key={day.date} style={styles.dailyBarColumn}><View style={[styles.dailyBar, { height: `${Math.max(day.adherencePercent ?? 0, 8)}%` }]} /><Text style={styles.muted}>{new Date(`${day.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' })}</Text></View>)}</View></View><View style={[styles.card, styles.compactSection]}><Text style={styles.label}>TARGET RANGE DAYS</Text>{[['Protein', pattern.targetRangeDays.protein, C.green], ['Fibre', pattern.targetRangeDays.fibre, C.blue], ['Water', pattern.targetRangeDays.water, C.purple]].map(([label, value, color]) => <View key={String(label)} style={styles.targetRow}><Text style={styles.macroLabel}>{label}</Text><Progress value={Number(value ?? 0) / pattern.periodDays} color={String(color)} /><Text style={[styles.macroValue, { color: String(color) }]}>{value ?? '—'}/{pattern.periodDays}</Text></View>)}</View><PatternCard title="WHAT WORKED" items={pattern.whatWorked} color={C.green} /><PatternCard title="HARDER THIS WEEK" items={pattern.harderThisWeek} color={C.yellow} /><PatternCard title="NEXT FOCUS" items={pattern.nextFocus} color={C.purple} /><PatternCard title="YOUR EATING PATTERN" items={pattern.eatingPattern} color={C.muted} /></> : <ActivityIndicator color={C.blue} />;
const PatternCard = ({ title, items, color }: { title: string; items: string[]; color: string }) => <View style={[styles.card, styles.compactSection]}><Text style={[styles.label, { color }]}>{title}</Text>{items.length ? items.map(item => <Text key={item} style={styles.insight}>• {item}</Text>) : <Text style={styles.muted}>Not enough evidence yet.</Text>}</View>;
const Metric = ({ label, value }: { label: string; value: string }) => <View style={[styles.card, styles.patternMetric]}><Text style={styles.muted}>{label}</Text><Text style={styles.patternValue}>{value}</Text></View>;

const styles = StyleSheet.create({
  screen: { backgroundColor: C.bg, gap: spacing.md, paddingHorizontal: spacing.sm, paddingTop: spacing.sm, paddingBottom: 176 }, center: { backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }, flex: { flex: 1 }, title: { ...typography.title, color: C.text }, date: { ...typography.caption, color: C.muted, marginTop: -8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, tabs: { flex: 1, flexDirection: 'row', borderRadius: radius.pill, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, padding: 4 }, tab: { flex: 1, borderRadius: radius.pill, paddingVertical: 10, alignItems: 'center' }, tabActive: { backgroundColor: C.raised }, tabText: { ...typography.bodyStrong, color: C.muted, fontSize: 14, fontFamily: 'Exo_700Bold' }, calendar: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }, body: { ...typography.body, color: C.text }, muted: { ...typography.caption, color: C.muted }, blue: { color: C.blue }, disabled: { opacity: .5 },
  consultant: { flexDirection: 'row', gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: '#20516F', backgroundColor: '#101722', padding: spacing.sm }, info: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: '#10293A', alignItems: 'center', justifyContent: 'center' }, consultantLabel: { ...typography.caption, color: C.blue, fontSize: 12, lineHeight: 16, fontFamily: 'Exo_600SemiBold', letterSpacing: .8 }, consultantText: { ...typography.caption, color: '#B6DEF3', fontSize: 12, lineHeight: 18, marginTop: 3 }, planStrip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, pill: { borderRadius: radius.pill, backgroundColor: '#0D1D16', borderWidth: 1, borderColor: '#205936', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, pillText: { ...typography.caption, color: C.green, fontFamily: 'Exo_500Medium' },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, padding: spacing.md }, label: { ...typography.caption, color: C.muted, fontFamily: 'Exo_600SemiBold', letterSpacing: 1 }, between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.xs }, summary: { gap: spacing.md }, summaryBody: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }, ring: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center', transform: [{ scale: .88 }] }, ringText: { position: 'absolute', alignItems: 'center' }, kcal: { ...typography.title, color: C.text, fontSize: 26 }, remaining: { ...typography.caption, color: C.green, fontFamily: 'Exo_500Medium', marginTop: spacing.xs }, macros: { flex: 1, gap: spacing.sm }, macro: { gap: spacing.xs }, macroLabel: { ...typography.caption, color: C.muted, fontSize: 11, lineHeight: 14 }, macroValue: { ...typography.caption, fontFamily: 'Exo_500Medium' }, track: { height: 7, borderRadius: radius.pill, backgroundColor: C.line, overflow: 'hidden' }, fill: { height: 7, borderRadius: radius.pill },
  twoCol: { flexDirection: 'row', gap: spacing.xs }, metric: { flex: 1, minWidth: 0, gap: spacing.sm }, value: { ...typography.title, color: C.text, fontSize: 24 }, unit: { ...typography.caption, color: C.muted }, waterButton: { backgroundColor: '#14202A', borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' }, waterText: { ...typography.bodyStrong, color: C.blue, fontSize: 14 }, dots: { flexDirection: 'row', gap: spacing.xs }, dot: { flex: 1, height: 7, borderRadius: radius.pill },
  balance: { flexDirection: 'row', gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: '#205936', backgroundColor: '#0B1B13', padding: spacing.md }, balanceIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: '#10331F', alignItems: 'center', justifyContent: 'center' }, balanceTitle: { ...typography.bodyStrong, color: C.text, fontSize: 15 }, balanceBody: { ...typography.caption, color: '#75B184', fontSize: 12, lineHeight: 18, marginTop: spacing.xs }, recommendationQuickRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm }, quickBtn: { flex: 1, backgroundColor: '#123922', borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' }, quickBtnWide: { marginTop: spacing.xs }, quickBtnText: { ...typography.caption, color: C.green, fontFamily: 'Exo_600SemiBold', fontSize: 11, textAlign: 'center' }, rowScroll: { marginVertical: spacing.sm }, rowScrollContent: { gap: spacing.xs, paddingBottom: spacing.sm }, chip: { borderRadius: radius.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.raised, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, chipActive: { borderColor: C.blue, backgroundColor: '#17364A' }, chipText: { ...typography.caption, color: C.text, textTransform: 'capitalize' }, uppercase: { textTransform: 'uppercase' },
  section: { ...typography.bodyStrong, color: C.muted, fontSize: 14, letterSpacing: 1 }, meal: { gap: spacing.xs, padding: spacing.sm }, mealTitle: { ...typography.bodyStrong, color: C.text, fontSize: 15 }, status: { ...typography.caption, color: C.muted, fontSize: 11, fontFamily: 'Exo_600SemiBold', letterSpacing: .8 }, optionName: { ...typography.bodyStrong, color: C.text, fontSize: 14 }, nutrients: { ...typography.caption, color: C.muted, fontSize: 11 }, actions: { flexDirection: 'row', gap: spacing.xs }, primary: { flex: 1, backgroundColor: C.blue, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' }, primaryText: { ...typography.caption, color: '#071016', fontFamily: 'Exo_600SemiBold' }, secondary: { minWidth: 72, backgroundColor: C.raised, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  compactSection: { gap: spacing.sm }, tableRow: { minHeight: 40, borderBottomWidth: 1, borderBottomColor: C.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, tableValues: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, adherenceBadge: { ...typography.caption, color: C.green, backgroundColor: '#10271A', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 5 }, adherenceRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, stateDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.line }, dailyBars: { height: 116, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }, dailyBarColumn: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.xs }, dailyBar: { width: '100%', minHeight: 8, backgroundColor: C.green, borderRadius: radius.sm }, targetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, patternGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, patternMetric: { flexBasis: '46%', flexGrow: 1, gap: 10 }, patternValue: { color: C.blue, fontFamily: 'Exo_600SemiBold', fontSize: 28 }, insight: { color: C.muted, fontFamily: 'Exo_400Regular', fontSize: 13, lineHeight: 20 }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.75)' }, modal: { maxHeight: '82%', backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: C.line, padding: 22, gap: 12 }, modalTitle: { color: C.text, fontFamily: 'Exo_600SemiBold', fontSize: 22 }, options: { gap: 10 }, option: { backgroundColor: C.raised, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 16, gap: 5 }, cancel: { backgroundColor: C.raised, borderRadius: 14, padding: 14, alignItems: 'center' },
  pickerSheet: { width: '100%', backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: C.line, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: 34, gap: spacing.md }, sheetHandle: { width: 40, height: 4, borderRadius: radius.pill, backgroundColor: C.line, alignSelf: 'center' }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }, sheetTitle: { ...typography.bodyStrong, color: C.text }, sheetCancel: { ...typography.body, color: C.muted }, sheetDone: { ...typography.bodyStrong, color: C.blue }, sheetHeaderSpacer: { width: 48 }, waterPrompt: { ...typography.body, color: C.text, textAlign: 'center' }, waterAmounts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, waterAmount: { flexBasis: '47%', flexGrow: 1, borderRadius: radius.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.raised, paddingVertical: spacing.sm, alignItems: 'center' }, waterAmountActive: { borderColor: C.blue, backgroundColor: '#142A35' }, waterAmountText: { ...typography.bodyStrong, color: C.muted, fontSize: 14 }, waterAmountTextActive: { color: C.blue }, saveWater: { minHeight: 48, borderRadius: radius.md, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }, saveWaterText: { ...typography.bodyStrong, color: '#071016' }, errorText: { ...typography.caption, color: '#FF7187' }
});
