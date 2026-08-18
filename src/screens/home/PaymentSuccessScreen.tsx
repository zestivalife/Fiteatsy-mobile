import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { getThemeColors, spacing } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentSuccess'>;

export const PaymentSuccessScreen = ({ navigation, route }: Props) => {
  const { themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const returnDestination = route.params?.returnDestination;

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
        <Text style={[styles.title, { color: palette.textPrimary }]}>Plan activated</Text>
        <Text style={[styles.body, { color: palette.textSecondary }]}>
          Your Fiteatsy subscription is active. Premium access now follows your account from the backend.
        </Text>
        <PrimaryButton title="Continue" onPress={continueFlow} />
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
  link: {
    color: '#64D900',
    fontFamily: 'Exo_700Bold',
    fontSize: 15,
    textAlign: 'center'
  }
});
