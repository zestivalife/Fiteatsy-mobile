import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SubscriptionPaymentPlaceholder'>;
export const SubscriptionPaymentPlaceholderScreen = ({ navigation, route }: Props) => {
  const status = route.params?.status;
  const title = status === 'PAYMENT_FAILED' ? 'Payment needs attention' : status ? 'Payment is being confirmed' : 'Payment status';
  const body = status === 'PAYMENT_FAILED'
    ? 'The last payment did not complete. No subscription access was activated.'
    : status
      ? 'Your payment is not confirmed yet. Access will begin only after the backend confirms it.'
      : 'No payment has been initiated.';
  return <Screen contentStyle={styles.screen}><Text style={styles.eyebrow}>PAYMENT</Text><Text style={styles.title}>{title}</Text><Text style={styles.body}>{body}</Text><Pressable onPress={() => navigation.navigate('SubscriptionPlans', { source: 'assist', requiredEntitlement: 'AI_ASSIST', returnDestination: route.params?.returnDestination ?? 'AssistHub' })} style={styles.primary}><Text style={styles.primaryText}>{status === 'PAYMENT_FAILED' ? 'Try again' : 'View plans'}</Text></Pressable></Screen>;
};
const styles = StyleSheet.create({ screen: { justifyContent: 'center', gap: 16 }, eyebrow: { color: '#B59CFF', fontFamily: 'Exo_700Bold', fontSize: 11, letterSpacing: 1 }, title: { color: '#FFFFFF', fontFamily: 'Exo_700Bold', fontSize: 28, lineHeight: 34 }, body: { color: '#D0CBD8', fontFamily: 'Exo_400Regular', fontSize: 15, lineHeight: 22 }, primary: { minHeight: 48, borderRadius: 12, backgroundColor: '#6A4FB3', alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#FFFFFF', fontFamily: 'Exo_700Bold', fontSize: 15 } });
