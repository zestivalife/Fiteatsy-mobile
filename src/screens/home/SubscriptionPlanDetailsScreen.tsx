import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { AppBackButton } from '../../components/AppBackButton';
import { getThemeColors } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { formatPlanDuration, formatPlanPrice, getSubscriptionPlan, SubscriptionPlan } from '../../services/subscriptionService';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'SubscriptionPlanDetails'>;
export const SubscriptionPlanDetailsScreen = ({ navigation, route }: Props) => {
  const { themeMode } = useAppContext(); const palette = getThemeColors(themeMode);
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { void getSubscriptionPlan(route.params.planId).then((result) => setPlan(result.plan)).finally(() => setLoading(false)); }, [route.params.planId]);
  return <Screen scroll contentStyle={styles.screen}>
    <AppBackButton onPress={() => navigation.goBack()} label="Plans" />
    {loading ? <ActivityIndicator color="#B59CFF" /> : plan ? <>
      {plan.recommended ? <Text style={styles.badge}>RECOMMENDED</Text> : null}
      <Text style={[styles.title, { color: palette.textPrimary }]}>{plan.name}</Text>
      <Text style={[styles.body, { color: palette.textSecondary }]}>{plan.description}</Text>
      <View style={[styles.hero, { borderColor: palette.stroke }]}><Text style={[styles.price, { color: palette.textPrimary }]}>{formatPlanPrice(plan)}</Text><Text style={[styles.meta, { color: palette.textSecondary }]}>{formatPlanDuration(plan.durationDays)} · approximately {formatPlanPrice({ priceMinor: plan.dailyCostMinor ?? Math.ceil(plan.priceMinor / plan.durationDays), currency: plan.currency })}/day</Text></View>
      <Text style={[styles.section, { color: palette.textPrimary }]}>Included</Text>
      {plan.benefits.map((item) => <View key={item} style={styles.row}><Ionicons name="checkmark-circle-outline" size={18} color="#B59CFF" /><Text style={[styles.body, { color: palette.textSecondary }]}>{item}</Text></View>)}
      <Text style={[styles.section, { color: palette.textPrimary }]}>Validity and terms</Text>
      <Text style={[styles.body, { color: palette.textSecondary }]}>Valid for {formatPlanDuration(plan.durationDays)} from activation. {plan.version?.termsText ?? 'Taxes, if applicable, will be shown at checkout.'}</Text>
      <Pressable onPress={() => navigation.navigate('SubscriptionCheckout', { planId: plan.id })} style={styles.primary} accessibilityRole="button"><Text style={styles.primaryText}>Review plan</Text></Pressable>
    </> : <Text style={[styles.body, { color: palette.textSecondary }]}>This plan is unavailable.</Text>}
  </Screen>;
};
const styles = StyleSheet.create({ screen: { gap: 16 }, back: { flexDirection: 'row', alignItems: 'center', gap: 4 }, backText: { fontFamily: 'Exo_600SemiBold', fontSize: 14 }, badge: { alignSelf: 'flex-start', color: '#D8C9FF', backgroundColor: '#2B2144', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontFamily: 'Exo_700Bold', fontSize: 10 }, title: { fontFamily: 'Exo_700Bold', fontSize: 28, lineHeight: 34 }, body: { fontFamily: 'Exo_400Regular', fontSize: 14, lineHeight: 21 }, hero: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 5 }, price: { fontFamily: 'Exo_700Bold', fontSize: 32 }, meta: { fontFamily: 'Exo_500Medium', fontSize: 13 }, section: { fontFamily: 'Exo_700Bold', fontSize: 18, marginTop: 5 }, row: { flexDirection: 'row', alignItems: 'center', gap: 9 }, primary: { minHeight: 48, backgroundColor: '#6A4FB3', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 }, primaryText: { color: '#FFFFFF', fontFamily: 'Exo_700Bold', fontSize: 15 } });
