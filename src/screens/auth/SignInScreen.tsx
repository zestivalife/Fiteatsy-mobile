import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { TextField } from '../../components/TextField';
import { CountryPicker } from '../../components/CountryPicker';
import { DEFAULT_COUNTRY, type CountryOption } from '../../data/countries';
import { getThemeColors, radius, shadows, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { AuthServiceError, loginWithPin } from '../../services/authService';
import { getPhoneDigits, normalizePhoneNumber } from '../../utils/phone';

type Props = NativeStackScreenProps<RootStackParamList, 'SignIn'>;

const PIN_LENGTH = 6;
const LAST_COUNTRY_KEY = 'fiteatsy.auth.lastCountry';

export const SignInScreen = ({ navigation }: Props) => {
  const { completeAuthentication, themeMode } = useAppContext();
  const themeColors = getThemeColors(themeMode);
  const isLight = themeMode === 'light';
  const darkTextStrong = isLight ? '#000000' : '#FFFFFF';
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [nationalNumber, setNationalNumber] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockUntilMs, setLockUntilMs] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const lockRemainingSec = Math.max(0, Math.ceil((lockUntilMs - nowMs) / 1000));

  const normalizedPhone = useMemo(() => {
    try {
      return normalizePhoneNumber(selectedCountry.dialCode, nationalNumber);
    } catch {
      return null;
    }
  }, [nationalNumber, selectedCountry.dialCode]);

  const canLogin = normalizedPhone !== null && pin.length === PIN_LENGTH && !loading && lockRemainingSec === 0;

  useEffect(() => {
    if (lockRemainingSec === 0) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lockRemainingSec]);

  const submitPinLogin = async () => {
    if (!normalizedPhone) {
      setError('Enter a valid phone number.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await AsyncStorage.setItem(LAST_COUNTRY_KEY, selectedCountry.iso2);
      const session = await loginWithPin({
        mobile: normalizedPhone.normalizedNumber,
        pin
      });
      await completeAuthentication(session);
      if (session.requiresPinChange) {
        navigation.reset({ index: 0, routes: [{ name: 'ChangePin', params: { force: true } }] });
        return;
      }
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
    } catch (e) {
      const err = e as AuthServiceError;
      console.error('[SignInScreen] PIN LOGIN FAILED', {
        errorMessage: err.message,
        code: err.code,
        retryAfterSec: err.retryAfterSec,
        stack: err.stack
      });
      setError(err.message);
      if (typeof err.retryAfterSec === 'number') {
        setLockUntilMs(Date.now() + err.retryAfterSec * 1000);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <View style={[styles.heroCard, { backgroundColor: themeColors.card, borderColor: themeColors.stroke }]}>
          <Text style={[styles.kicker, { color: themeColors.blue }]}>Existing User Login</Text>
          <Text style={[styles.title, { color: darkTextStrong }]}>Login with your temporary 6 digit PIN.</Text>
          <Text style={[styles.subTitle, { color: darkTextStrong }]}>
            OTP remains available, but PIN login helps while WhatsApp delivery is unstable.
          </Text>

          <CountryPicker selectedCountry={selectedCountry} onSelect={setSelectedCountry} />
          <TextField
            label="Mobile Number"
            placeholder={selectedCountry.iso2 === 'IN' ? '9876543210' : 'National phone number'}
            keyboardType="phone-pad"
            value={nationalNumber}
            onChangeText={(value) => setNationalNumber(getPhoneDigits(value))}
            maxLength={14}
          />
          <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>6 digit PIN</Text>
          <TextInput
            value={pin}
            onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={PIN_LENGTH}
            placeholder="123456"
            placeholderTextColor={themeColors.textMuted}
            style={[
              styles.pinInput,
              {
                color: themeColors.textPrimary,
                backgroundColor: themeColors.cardMuted,
                borderColor: themeColors.stroke
              }
            ]}
          />
          {error ? <Text style={[styles.errorText, { color: themeColors.danger }]}>{error}</Text> : null}
          {lockRemainingSec > 0 ? (
            <Text style={[styles.helperText, { color: themeColors.textSecondary }]}>Try again in {lockRemainingSec}s.</Text>
          ) : null}
          <PrimaryButton
            title={loading ? 'Logging in...' : lockRemainingSec > 0 ? `Login in ${lockRemainingSec}s` : 'Login'}
            onPress={submitPinLogin}
            disabled={!canLogin}
          />

          <Pressable accessibilityRole="button" onPress={() => navigation.navigate('SignUp')}>
            <Text style={[styles.otpLink, { color: themeColors.blue }]}>Login with OTP</Text>
          </Pressable>
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
    fontFamily: 'Exo_700Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  title: {
    ...typography.titleXL
  },
  subTitle: {
    ...typography.body,
    fontSize: 14
  },
  inputLabel: {
    ...typography.caption,
    marginBottom: -8
  },
  pinInput: {
    ...typography.bodyStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: 18,
    letterSpacing: 6,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  errorText: {
    ...typography.caption
  },
  helperText: {
    ...typography.caption
  },
  otpLink: {
    ...typography.bodyStrong,
    textAlign: 'center'
  }
});
