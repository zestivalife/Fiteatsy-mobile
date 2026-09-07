import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppBackButton } from '../../components/AppBackButton';
import { Screen } from '../../components/Screen';
import { getThemeColors } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { ApiClientError } from '../../services/apiClient';
import { runVerifiedSubscriptionCheckout } from '../../services/razorpayCheckoutService';
import { formatMinorPrice, formatPlanDuration, formatPlanPrice, getSubscriptionPlan, SubscriptionPlan } from '../../services/subscriptionService';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'SubscriptionCheckout'>;
const createIdempotencyKey = (planId: string) => `${planId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const SubscriptionCheckoutScreen = ({ navigation, route }: Props) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlan((await getSubscriptionPlan(route.params.planId)).plan);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Unable to load this plan right now.');
    } finally {
      setLoading(false);
    }
  }, [route.params.planId]);

  useEffect(() => { void load(); }, [load]);

  const pay = async () => {
    if (!plan || paying) return;
    setPaying(true);
    setError(null);
    try {
      const result = await runVerifiedSubscriptionCheckout({
        plan,
        source: 'subscription_management',
        idempotencyKey: createIdempotencyKey(plan.id)
      });
      navigation.replace('PaymentSuccess', { priceBreakup: result.priceBreakup });
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : cause instanceof Error ? cause.message : 'Payment could not be completed.');
    } finally {
      setPaying(false);
    }
  };

  return <Screen scroll contentStyle={styles.screen}>
    <AppBackButton onPress={() => navigation.goBack()} label="Plan details" />
    <Text style={[styles.title, { color: palette.textPrimary }]}>Review your plan</Text>
    {loading ? <View style={styles.state}><ActivityIndicator color="#64D900" /><Text style={[styles.body, { color: palette.textSecondary }]}>Loading plan details…</Text></View> : null}
    {!loading && error && !plan ? <View style={styles.state}><Text style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { void load(); }} style={styles.primary}><Text style={styles.primaryText}>Retry</Text></Pressable></View> : null}
    {!loading && plan ? <>
      <View style={[styles.card, { borderColor: palette.stroke }]}>
        <Text style={[styles.plan, { color: palette.textPrimary }]}>{plan.name}</Text>
        <Text style={[styles.body, { color: palette.textSecondary }]}>{formatPlanDuration(plan.durationDays)} · {formatPlanPrice(plan)}</Text>
        <View style={styles.line}><Text style={[styles.body, { color: palette.textSecondary }]}>Plan price</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{formatMinorPrice(plan.priceMinor, plan.currency)}</Text></View>
        <View style={styles.line}><Text style={[styles.body, { color: palette.textSecondary }]}>CGST</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{formatMinorPrice(plan.cgstAmountMinor ?? 0, plan.currency)}</Text></View>
        <View style={styles.line}><Text style={[styles.body, { color: palette.textSecondary }]}>SGST</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{formatMinorPrice(plan.sgstAmountMinor ?? 0, plan.currency)}</Text></View>
        <View style={styles.totalLine}><Text style={[styles.body, { color: palette.textSecondary }]}>Total payable</Text><Text style={[styles.total, { color: palette.textPrimary }]}>{formatMinorPrice(plan.totalAmountMinor ?? plan.priceMinor, plan.currency)}</Text></View>
      </View>
      <Text style={[styles.note, { color: palette.textSecondary }]}>Payment is completed securely through Razorpay. Access activates only after server verification.</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: paying }} disabled={paying} onPress={() => { void pay(); }} style={[styles.primary, paying && styles.disabled]}><Text style={styles.primaryText}>{paying ? 'Opening secure checkout…' : `Pay ${formatMinorPrice(plan.totalAmountMinor ?? plan.priceMinor, plan.currency)}`}</Text></Pressable>
    </> : null}
  </Screen>;
};

const styles = StyleSheet.create({
  screen: { gap: 16 }, title: { fontFamily: 'Exo_700Bold', fontSize: 28 }, card: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 10 },
  plan: { fontFamily: 'Exo_700Bold', fontSize: 21 }, body: { fontFamily: 'Exo_400Regular', fontSize: 14, lineHeight: 20 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, totalLine: { borderTopWidth: 1, borderTopColor: '#302B3C', paddingTop: 12, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  value: { fontFamily: 'Exo_600SemiBold', fontSize: 14 }, total: { fontFamily: 'Exo_700Bold', fontSize: 22 }, note: { fontFamily: 'Exo_400Regular', fontSize: 13, lineHeight: 19 },
  state: { alignItems: 'center', gap: 14, paddingVertical: 28 }, error: { color: '#F5A3AE', fontFamily: 'Exo_500Medium', fontSize: 14, lineHeight: 20 },
  primary: { minHeight: 48, borderRadius: 12, backgroundColor: '#6A4FB3', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }, primaryText: { color: '#FFFFFF', fontFamily: 'Exo_700Bold', fontSize: 15 }, disabled: { opacity: 0.6 }
});
