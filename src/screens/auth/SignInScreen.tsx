import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { getThemeColors, radius, shadows, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'SignIn'>;

export const SignInScreen = ({ navigation }: Props) => {
  const { themeMode } = useAppContext();
  const themeColors = getThemeColors(themeMode);
  const isLight = themeMode === 'light';
  const darkTextStrong = isLight ? '#000000' : '#FFFFFF';

  return (
    <Screen>
      <View style={styles.container}>
        <View style={[styles.heroCard, { backgroundColor: themeColors.card, borderColor: themeColors.stroke }]}>
          <Text style={[styles.kicker, { color: themeColors.blue }]}>Welcome to Fiteatsy</Text>
          <Text style={[styles.title, { color: darkTextStrong }]}>Personalized wellness starts with a verified WhatsApp OTP.</Text>
          <Text style={[styles.subTitle, { color: darkTextStrong }]}>
            Sign up or return with your phone number. We will look up your account, resolve your current client profile, and continue the normal onboarding or home flow.
          </Text>
          <PrimaryButton title="Continue with WhatsApp OTP" onPress={() => navigation.navigate('SignUp')} />
        </View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center'
  },
  heroCard: {
    ...shadows.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg
  },
  kicker: {
    ...typography.caption,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  title: {
    ...typography.titleXL
  },
  subTitle: {
    ...typography.body,
    fontSize: 14
  }
});
