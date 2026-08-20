import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { getThemeColors, spacing } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { formatMinorPrice, FoundationSubscription, getMySubscription } from '../../services/subscriptionService';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentSuccess'>;

export const PaymentSuccessScreen = ({ navigation, route }: Props) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const returnDestination = route.params?.returnDestination;
  const priceBreakup = route.params?.priceBreakup;
  const [subscription, setSubscription] = useState<FoundationSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadSubscription = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setSubscription(await getMySubscription());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSubscription(); }, [loadSubscription]);

  const continueFlow = () => {
    if (returnDestination) {
      navigation.replace(returnDestination as never, undefined as never);
      return;
    }
    navigation.replace('Main');
  };

  return (
    <Screen contentStyle={styles.screen}>
      <View style={[styles.card, { backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0E120F', borderColor: palette.stroke }]}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark" size={38} color="#0B2703" />
        </View>
        {loading ? <ActivityIndicator color="#64D900" /> : error ? <>
          <Text style={[styles.title, { color: palette.textPrimary }]}>Payment received</Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>We are confirming your subscription with the backend.</Text>
          <PrimaryButton title="Retry confirmation" onPress={() => { void loadSubscription(); }} />
        </> : subscription?.status === 'ACTIVE' || subscription?.status === 'EXPIRING_SOON' ? <>
          <Text style={[styles.title, { color: palette.textPrimary }]}>You’re all set</Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>Your Fiteatsy subscription is active and premium access follows your account.</Text>
          <Text style={[styles.detail, { color: palette.textPrimary }]}>{subscription.subscription?.planName}</Text>
          {priceBreakup ? <View style={styles.breakup}>
            <Text style={[styles.breakupText, { color: palette.textSecondary }]}>Plan price {formatMinorPrice(priceBreakup.baseAmountMinor)}</Text>
            <Text style={[styles.breakupText, { color: palette.textSecondary }]}>CGST @ 9% {formatMinorPrice(priceBreakup.cgstAmountMinor)}</Text>
            <Text style={[styles.breakupText, { color: palette.textSecondary }]}>SGST @ 9% {formatMinorPrice(priceBreakup.sgstAmountMinor)}</Text>
            <Text style={[styles.total, { color: palette.textPrimary }]}>Total paid {formatMinorPrice(priceBreakup.totalAmountMinor)}</Text>
          </View> : null}
          <Text style={[styles.body, { color: palette.textSecondary }]}>Valid until {subscription.subscription?.expiresAt ? new Date(subscription.subscription.expiresAt).toLocaleDateString() : 'Not available'}</Text>
          <PrimaryButton title="Continue" onPress={continueFlow} />
        </> : <>
          <Text style={[styles.title, { color: palette.textPrimary }]}>Payment is being confirmed</Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>Access will appear here after the backend confirms the payment.</Text>
          <PrimaryButton title="Retry confirmation" onPress={() => { void loadSubscription(); }} />
        </>}
        <Pressable onPress={() => navigation.navigate('SubscriptionPlans', { source: 'subscription_management' })} accessibilityRole="button">
          <Text style={styles.link}>View subscription details</Text>
        </Pressable>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
    padding: spacing.lg
  },
  card: {
    borderWidth: 1,
    borderRadius: 32,
    gap: spacing.md,
    padding: spacing.xl
  },
  iconWrap: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#64D900',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64
  },
  title: {
    fontFamily: 'Exo_700Bold',
    fontSize: 32,
    lineHeight: 38
  },
  body: {
    fontFamily: 'Exo_400Regular',
    fontSize: 16,
    lineHeight: 24
  },
  detail: {
    fontFamily: 'Exo_700Bold',
    fontSize: 20,
    lineHeight: 26
  },
  link: {
    color: '#64D900',
    fontFamily: 'Exo_700Bold',
    fontSize: 15,
    textAlign: 'center'
  },
  breakup: {
    gap: 4,
    marginTop: 4
  },
  breakupText: {
    fontFamily: 'Exo_400Regular',
    fontSize: 14
  },
  total: {
    fontFamily: 'Exo_700Bold',
    fontSize: 18,
    marginTop: 4
  }
});
