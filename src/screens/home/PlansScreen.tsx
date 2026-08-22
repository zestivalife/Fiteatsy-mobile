import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppBackButton } from '../../components/AppBackButton';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { getThemeColors } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { formatPlanDuration, formatPlanPrice, getSubscriptionPlans, SubscriptionPlan } from '../../services/subscriptionService';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'SubscriptionPlans'>;

const dailyCost = (plan: SubscriptionPlan) => formatPlanPrice({ priceMinor: plan.dailyCostMinor ?? Math.ceil(plan.priceMinor / plan.durationDays), currency: plan.currency });

export const PlansScreen = ({ navigation }: Props) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans((await getSubscriptionPlans()).plans.filter((plan) => !plan.developmentOnly));
    } catch {
      setError('Plans are temporarily unavailable. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <Screen scroll contentStyle={styles.screen}>
      <View style={styles.headerRow}>
        <AppBackButton iconOnly onPress={() => navigation.goBack()} />
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: '#B59CFF' }]}>FITEATSY PLANS</Text>
          <Text style={[styles.title, { color: palette.textPrimary }]}>Choose your wellness plan</Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>Clear access, simple validity, and support for your health journey.</Text>
        </View>
      </View>
      <View style={[styles.actionRow, { borderColor: palette.stroke }]}>
        <Pressable onPress={() => navigation.navigate('SubscriptionCompare')} accessibilityRole="button" style={styles.actionButton}>
          <Ionicons name="swap-horizontal-outline" size={17} color="#C9B8FF" /><Text style={styles.actionText}>Compare plans</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('MySubscription')} accessibilityRole="button" style={styles.actionButton}>
          <Ionicons name="card-outline" size={17} color="#C9B8FF" /><Text style={styles.actionText}>My subscription</Text>
        </Pressable>
      </View>
      {loading ? <View style={styles.state}><ActivityIndicator color="#B59CFF" /><Text style={[styles.body, { color: palette.textSecondary }]}>Loading plans...</Text></View> : null}
      {error ? <View style={styles.state}><Text style={[styles.body, { color: palette.textSecondary }]}>{error}</Text><Pressable onPress={() => { void load(); }}><Text style={styles.link}>Retry</Text></Pressable></View> : null}
      {!loading && !error && plans.map((plan) => (
        <View key={plan.id} style={[styles.planCard, { backgroundColor: palette.card, borderColor: plan.recommended ? '#8D72D8' : palette.stroke }]}>
          {plan.recommended ? <Text style={styles.badge}>RECOMMENDED</Text> : null}
          <Text style={[styles.planName, { color: palette.textPrimary }]}>{plan.name}</Text>
          <Text style={[styles.planDescription, { color: palette.textSecondary }]}>{plan.description}</Text>
          <View style={styles.priceRow}><Text style={[styles.price, { color: palette.textPrimary }]}>{formatPlanPrice(plan)}</Text><Text style={[styles.duration, { color: palette.textSecondary }]}>{formatPlanDuration(plan.durationDays)}</Text></View>
          <Text style={styles.daily}>{dailyCost(plan)}/day approximate</Text>
          <View style={styles.benefits}>{plan.benefits.slice(0, 5).map((benefit) => <Text key={benefit} style={[styles.benefit, { color: palette.textSecondary }]}><Text style={styles.check}>✓</Text> {benefit}</Text>)}</View>
          <Pressable onPress={() => navigation.navigate('SubscriptionPlanDetails', { planId: plan.id })} accessibilityRole="button" style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>View details</Text><Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      ))}
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: { gap: 16, paddingBottom: 36 },
  headerRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17131F' },
  headerCopy: { flex: 1, gap: 5 },
  eyebrow: { fontFamily: 'Exo_700Bold', fontSize: 11, letterSpacing: 1.1 },
  title: { fontFamily: 'Exo_700Bold', fontSize: 27, lineHeight: 33 },
  subtitle: { fontFamily: 'Exo_400Regular', fontSize: 14, lineHeight: 20 },
  actionRow: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 4, gap: 4 },
  actionButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  actionText: { color: '#C9B8FF', fontFamily: 'Exo_600SemiBold', fontSize: 12 },
  state: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  body: { fontFamily: 'Exo_400Regular', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  link: { color: '#B59CFF', fontFamily: 'Exo_600SemiBold', fontSize: 14 },
  planCard: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 9 },
  badge: { alignSelf: 'flex-start', color: '#D8C9FF', backgroundColor: '#2B2144', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontFamily: 'Exo_700Bold', fontSize: 10, letterSpacing: 0.8 },
  planName: { fontFamily: 'Exo_700Bold', fontSize: 20, lineHeight: 25 },
  planDescription: { fontFamily: 'Exo_400Regular', fontSize: 13, lineHeight: 18 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4 },
  price: { fontFamily: 'Exo_700Bold', fontSize: 28 },
  duration: { fontFamily: 'Exo_500Medium', fontSize: 14 },
  daily: { color: '#B59CFF', fontFamily: 'Exo_500Medium', fontSize: 12 },
  benefits: { gap: 5, marginTop: 5 },
  benefit: { fontFamily: 'Exo_400Regular', fontSize: 13, lineHeight: 19 },
  check: { color: '#B59CFF', fontFamily: 'Exo_700Bold' },
  primaryButton: { minHeight: 46, borderRadius: 12, backgroundColor: '#6A4FB3', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 6 },
  primaryButtonText: { color: '#FFFFFF', fontFamily: 'Exo_700Bold', fontSize: 14 }
});
