import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { getThemeColors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { getFoodPreferences, FoodPreferenceProfile } from '../../services/foodPreferenceService';
import { isFoodPreferenceProfileComplete } from '../../utils/foodPreferenceCompletion';
import { useAppContext } from '../../state/AppContext';
import { getNutritionPlanDeliveryStatus, NutritionPlanDeliveryStatus } from '../../services/nutritionPlanService';
import { NutritionExperienceScreen } from './NutritionExperienceScreen';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const NutritionHubScreen = () => {
  const navigation = useNavigation<Nav>();
  const { themeMode, publishedNutritionPlan, refreshPublishedNutritionPlan } = useAppContext();
  const palette = getThemeColors(themeMode);
  const [profile, setProfile] = React.useState<FoodPreferenceProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [deliveryStatus, setDeliveryStatus] = React.useState<NutritionPlanDeliveryStatus['status']>('NO_PLAN');

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getFoodPreferences();
      setProfile(response.profile);
      const status = await getNutritionPlanDeliveryStatus();
      setDeliveryStatus(status.status);
      await refreshPublishedNutritionPlan();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Unable to load your nutrition profile right now.');
    } finally {
      setLoading(false);
    }
  }, [refreshPublishedNutritionPlan]);

  useFocusEffect(React.useCallback(() => {
    void refresh();
  }, [refresh]));

  const preferencesComplete = isFoodPreferenceProfileComplete(profile);
  const hasPlan = Boolean(publishedNutritionPlan);
  const hasLifecyclePlan = deliveryStatus !== 'NO_PLAN';

  if (hasPlan || deliveryStatus === 'ACTIVE_PUBLISHED') {
    return <NutritionExperienceScreen />;
  }

  return (
    <Screen scroll contentStyle={styles.screen}>
      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={palette.blue} /><Text style={[styles.loadingText, { color: palette.textMuted }]}>Loading your nutrition profile...</Text></View>
      ) : null}

      {error ? (
        <View style={[styles.message, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <Text style={[styles.messageText, { color: palette.textSecondary }]}>{error}</Text>
          <Pressable onPress={() => void refresh()} accessibilityRole="button"><Text style={[styles.retry, { color: palette.blue }]}>Try again</Text></Pressable>
        </View>
      ) : null}

      {!loading && !error && !preferencesComplete && !hasLifecyclePlan && !hasPlan ? (
        <Card style={[styles.card, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <View style={[styles.iconCircle, { backgroundColor: palette.cardMuted }]}><Ionicons name="nutrition-outline" size={26} color={palette.blue} /></View>
          <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>Personalise your nutrition</Text>
          <Text style={[styles.cardBody, { color: palette.textSecondary }]}>Food preferences are optional. Add what you enjoy, avoid, and prefer so future recommendations can fit your routine.</Text>
          <PrimaryButton title="Set food preferences" onPress={() => navigation.navigate('FoodPreferences', { mode: 'profile' })} />
          <Text style={[styles.optional, { color: palette.textMuted }]}>You can continue without adding preferences.</Text>
        </Card>
      ) : null}

      {!loading && !error && hasPlan ? (
        <Card style={[styles.card, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <View style={[styles.iconCircle, { backgroundColor: palette.cardMuted }]}><Ionicons name="restaurant-outline" size={26} color={palette.blue} /></View>
          <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>Published nutrition plan</Text>
          <Text style={[styles.cardBody, { color: palette.textSecondary }]}>Your current plan is ready. Preference updates apply to future planning and do not change this published version.</Text>
          <PrimaryButton title="Open nutrition plan" onPress={() => navigation.navigate('NutritionPlan')} />
          {!preferencesComplete ? <Text style={[styles.optional, { color: palette.textMuted }]}>Preferences are optional. Add them when you are ready for future recommendations.</Text> : null}
        </Card>
      ) : null}

      {!loading && !error && deliveryStatus === 'PREPARING' ? (
        <Card style={[styles.card, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <View style={[styles.iconCircle, { backgroundColor: palette.cardMuted }]}><Ionicons name="time-outline" size={26} color={palette.blue} /></View>
          <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>Your nutrition plan is being prepared</Text>
          <Text style={[styles.cardBody, { color: palette.textSecondary }]}>Your care team is preparing your approved nutrition experience.</Text>
        </Card>
      ) : null}

      {!loading && !error && deliveryStatus === 'PENDING_APPROVAL' ? (
        <Card style={[styles.card, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <View style={[styles.iconCircle, { backgroundColor: palette.cardMuted }]}><Ionicons name="time-outline" size={26} color={palette.blue} /></View>
          <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>Your nutrition plan is awaiting approval</Text>
          <Text style={[styles.cardBody, { color: palette.textSecondary }]}>Your consultant has submitted the plan for Senior Consultant review.</Text>
        </Card>
      ) : null}

      {!loading && !error && deliveryStatus === 'APPROVED_NOT_PUBLISHED' ? (
        <Card style={[styles.card, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <View style={[styles.iconCircle, { backgroundColor: palette.cardMuted }]}><Ionicons name="checkmark-circle-outline" size={26} color={palette.blue} /></View>
          <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>Your nutrition plan has been approved</Text>
          <Text style={[styles.cardBody, { color: palette.textSecondary }]}>It will be available here once your care team publishes it.</Text>
        </Card>
      ) : null}

      {!loading && !error && preferencesComplete && !hasLifecyclePlan && !hasPlan ? (
        <Card style={[styles.card, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <View style={[styles.iconCircle, { backgroundColor: palette.cardMuted }]}><Ionicons name="time-outline" size={26} color={palette.blue} /></View>
          <Text style={[styles.cardTitle, { color: palette.textPrimary }]}>Your preferences are saved</Text>
          <Text style={[styles.cardBody, { color: palette.textSecondary }]}>Your consultant can use them when preparing your next nutrition plan.</Text>
        </Card>
      ) : null}

      {!loading && !error ? (
        <Pressable onPress={() => navigation.navigate('FoodPreferences', { mode: 'profile' })} style={[styles.preferenceLink, { borderColor: palette.stroke, backgroundColor: palette.card }]} accessibilityRole="button">
          <View style={styles.preferenceCopy}><Text style={[styles.preferenceTitle, { color: palette.textPrimary }]}>Food preferences</Text><Text style={[styles.preferenceBody, { color: palette.textMuted }]}>{preferencesComplete ? 'Update your saved preferences' : 'Not provided yet'}</Text></View>
          <Ionicons name="chevron-forward" size={20} color={palette.textPrimary} />
        </Pressable>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: { gap: spacing.md, paddingBottom: 120 },
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  loadingText: { ...typography.body },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  iconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { ...typography.section, fontSize: 21 },
  cardBody: { ...typography.body, lineHeight: 22 },
  optional: { ...typography.caption, textAlign: 'center', lineHeight: 18 },
  message: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  messageText: { ...typography.body, lineHeight: 21 },
  retry: { ...typography.bodyStrong },
  preferenceLink: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  preferenceCopy: { flex: 1, gap: 4 },
  preferenceTitle: { ...typography.bodyStrong },
  preferenceBody: { ...typography.caption }
});
