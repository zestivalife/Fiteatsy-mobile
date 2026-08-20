import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { getThemeColors } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { FoundationSubscription, getMySubscription } from '../../services/subscriptionService';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'AssistHub'>;
const dateLabel = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not available';

export const AssistHubScreen = ({ navigation }: Props) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const [data, setData] = useState<FoundationSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getMySubscription();
      if (!next.entitlements.AI_ASSIST?.value) {
        navigation.replace('SubscriptionPlans', { source: 'assist', requiredEntitlement: 'AI_ASSIST', returnDestination: 'AssistHub' });
        return;
      }
      setData(next);
    } catch {
      Alert.alert('Assist unavailable', 'We could not confirm your Assist access right now.');
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useEffect(() => { void load(); }, [load]);
  const subscription = data?.subscription;

  return (
    <Screen scroll contentStyle={styles.screen}>
      <Pressable onPress={() => navigation.goBack()} style={styles.back} accessibilityRole="button">
        <Ionicons name="chevron-back" size={22} color={palette.textPrimary} />
        <Text style={[styles.backText, { color: palette.textPrimary }]}>Home</Text>
      </Pressable>
      <Text style={[styles.title, { color: palette.textPrimary }]}>Assist</Text>
      {loading ? <ActivityIndicator color={palette.blue} /> : data ? <>
        <View style={[styles.hero, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <Ionicons name="sparkles" size={30} color={palette.blue} />
          <Text style={[styles.heroTitle, { color: palette.textPrimary }]}>Your Assist plan is active</Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>Use your included Fiteatsy assistance and keep your wellness journey moving.</Text>
          <Text style={styles.status}>{data.status.replace('_', ' ')}</Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>Valid until {dateLabel(subscription?.expiresAt)}</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('MySubscription')} style={[styles.primary, { backgroundColor: palette.blue }]}>
          <Text style={styles.primaryText}>View subscription</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('ConsultantBooking')} style={[styles.secondary, { borderColor: palette.stroke }]}>
          <Text style={[styles.secondaryText, { color: palette.textPrimary }]}>Consultant support</Text>
        </Pressable>
      </> : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: { gap: 16 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontFamily: 'Exo_600SemiBold', fontSize: 14 },
  title: { fontFamily: 'Exo_700Bold', fontSize: 30 },
  hero: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 10 },
  heroTitle: { fontFamily: 'Exo_700Bold', fontSize: 22 },
  body: { fontFamily: 'Exo_400Regular', fontSize: 15, lineHeight: 22 },
  status: { color: '#B59CFF', fontFamily: 'Exo_700Bold', fontSize: 12, letterSpacing: 1 },
  primary: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontFamily: 'Exo_700Bold', fontSize: 15 },
  secondary: { minHeight: 50, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: 'Exo_700Bold', fontSize: 15 }
});
