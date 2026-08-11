import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { CountryPicker } from '../../components/CountryPicker';
import { DEFAULT_COUNTRY, findCountryByIso2, type CountryOption } from '../../data/countries';
import { getThemeColors, radius, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import {
  AuthServiceError,
  requestSignupOtp,
  resendSignupOtp,
  verifySignupOtp,
  type SignupOtpResponse
} from '../../services/authService';
import { getPhoneDigits, normalizePhoneNumber } from '../../utils/phone';

type Props = NativeStackScreenProps<RootStackParamList, 'SignUp'>;
const OTP_LENGTH = 6;
const LAST_COUNTRY_KEY = 'fiteatsy.auth.lastCountry';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const SignUpScreen = ({ navigation }: Props) => {
  const { completeAuthentication, setOnboarding, themeMode } = useAppContext();
  const themeColors = getThemeColors(themeMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [nationalNumber, setNationalNumber] = useState('');
  const [phase, setPhase] = useState<'collect' | 'verify'>('collect');
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [expiresAtMs, setExpiresAtMs] = useState(0);
  const [resendAtMs, setResendAtMs] = useState(0);
  const [requestCooldownAtMs, setRequestCooldownAtMs] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hiddenOtpRef = useRef<TextInput>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const appState = useRef(AppState.currentState);

  const otpCells = useMemo(() => {
    return Array.from({ length: OTP_LENGTH }, (_, idx) => otp[idx] ?? '');
  }, [otp]);

  const normalizedPhone = useMemo(() => {
    try {
      return normalizePhoneNumber(selectedCountry.dialCode, nationalNumber);
    } catch {
      return null;
    }
  }, [nationalNumber, selectedCountry.dialCode]);
  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const isValidEmail = EMAIL_PATTERN.test(trimmedEmail);

  const otpExpired = phase === 'verify' && expiresAtMs > 0 && nowMs >= expiresAtMs;
  const resendRemainingSec = Math.max(0, Math.ceil((resendAtMs - nowMs) / 1000));
  const requestCooldownRemainingSec = Math.max(0, Math.ceil((requestCooldownAtMs - nowMs) / 1000));
  const canResend = phase === 'verify' && resendRemainingSec === 0 && !loading;
  const canVerify = otp.length === OTP_LENGTH && !otpExpired && !verifying;
  const canRequestOtp =
    trimmedName.length >= 2 && isValidEmail && normalizedPhone !== null && !loading && requestCooldownRemainingSec === 0;

  useEffect(() => {
    AsyncStorage.getItem(LAST_COUNTRY_KEY).then((storedCountry) => {
      setSelectedCountry(findCountryByIso2(storedCountry));
    });
  }, []);

  useEffect(() => {
    if (phase !== 'verify' && requestCooldownRemainingSec === 0) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase, requestCooldownRemainingSec]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        setNowMs(Date.now());
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  const applyOtpMetadata = (response: SignupOtpResponse) => {
    setChallengeId(response.challengeId);
    setExpiresAtMs(new Date(response.expiresAtISO).getTime());
    setResendAtMs(new Date(response.resendAvailableAtISO).getTime());
    setAttemptsRemaining(response.attemptsRemaining);
  };

  const requestOtp = async () => {
    setError(null);
    if (trimmedName.length < 2) {
      setError('Enter your full name.');
      return;
    }
    if (!isValidEmail) {
      setError('Enter a valid email address.');
      return;
    }

    let phone;
    try {
      phone = normalizePhoneNumber(selectedCountry.dialCode, nationalNumber);
    } catch (phoneError) {
      console.error('[SignUpScreen] PHONE NORMALIZATION FAILED', {
        errorMessage: phoneError instanceof Error ? phoneError.message : String(phoneError),
        stack: phoneError instanceof Error ? phoneError.stack : undefined
      });
      setError(phoneError instanceof Error ? phoneError.message : 'Enter a valid phone number.');
      return;
    }

    setLoading(true);
    try {
      await AsyncStorage.setItem(LAST_COUNTRY_KEY, selectedCountry.iso2);
      const response = await requestSignupOtp({
        name: trimmedName,
        email: trimmedEmail,
        mobileNumber: phone.normalizedNumber
      });
      applyOtpMetadata(response);
      setOtp('');
      setRequestCooldownAtMs(0);
      setPhase('verify');
      setTimeout(() => hiddenOtpRef.current?.focus(), 120);
    } catch (e) {
      const err = e as AuthServiceError;
      console.error('[SignUpScreen] OTP REQUEST FAILED', {
        errorMessage: err.message,
        code: err.code,
        retryAfterSec: err.retryAfterSec,
        stack: err.stack
      });
      setError(err.message);
      if (typeof err.retryAfterSec === 'number') {
        setRequestCooldownAtMs(Date.now() + err.retryAfterSec * 1000);
      }
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (!challengeId) return;
    setError(null);
    setLoading(true);
    try {
      const response = await resendSignupOtp(challengeId);
      applyOtpMetadata(response);
      setOtp('');
      setTimeout(() => hiddenOtpRef.current?.focus(), 120);
    } catch (e) {
      const err = e as AuthServiceError;
      console.error('[SignUpScreen] OTP RESEND FAILED', {
        errorMessage: err.message,
        code: err.code,
        retryAfterSec: err.retryAfterSec,
        stack: err.stack
      });
      setError(err.message);
      if (typeof err.retryAfterSec === 'number') {
        setResendAtMs(Date.now() + err.retryAfterSec * 1000);
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!challengeId || otp.length !== OTP_LENGTH) return;
    setError(null);
    setVerifying(true);
    try {
      const session = await verifySignupOtp(challengeId, otp);
      await completeAuthentication(session);
      setOnboarding((previous) => ({
        name: name.trim() || previous?.name || 'Member',
        dateOfBirthISO: previous?.dateOfBirthISO ?? new Date(1996, 0, 1).toISOString(),
        calculatedAge: previous?.calculatedAge ?? 28,
        age: previous?.age ?? 28,
        ageBracket: previous?.ageBracket ?? '25-34',
        gender: previous?.gender ?? 'Prefer not to say',
        wellnessGoal: previous?.wellnessGoal,
        primaryConditions: previous?.primaryConditions ?? [],
        symptomTags: previous?.symptomTags ?? ['Fatigue'],
        healthGoals: previous?.healthGoals ?? ['Better Energy'],
        primaryGoal: previous?.primaryGoal ?? previous?.healthGoals?.[0] ?? previous?.wellnessGoal,
        secondaryGoals: previous?.secondaryGoals ?? [],
        wearablePreference: previous?.wearablePreference ?? 'later',
        careTrack: previous?.careTrack ?? 'Foundational Recovery Care',
        assignedConsultantId: previous?.assignedConsultantId ?? null,
        assignedConsultant: previous?.assignedConsultant ?? null,
        matchedDietitianName: previous?.matchedDietitianName,
        matchedDietitianSpecialty: previous?.matchedDietitianSpecialty,
        calendarProvider: previous?.calendarProvider ?? 'None',
        calendarPermissionGranted: previous?.calendarPermissionGranted ?? false,
        notificationPermissionGranted: previous?.notificationPermissionGranted ?? false,
        createdAtISO: previous?.createdAtISO ?? new Date().toISOString()
      }));
      try {
        navigation.reset({ index: 0, routes: [{ name: 'OnboardingBasics' }] });
      } catch (navigationError) {
        console.error('[SignUpScreen] OTP VERIFY NAVIGATION FAILED', {
          errorMessage: navigationError instanceof Error ? navigationError.message : String(navigationError),
          stack: navigationError instanceof Error ? navigationError.stack : undefined
        });
        throw navigationError;
      }
    } catch (e) {
      const err = e as AuthServiceError;
      console.error('[SignUpScreen] OTP VERIFY FAILED', {
        errorMessage: err.message,
        code: err.code,
        retryAfterSec: err.retryAfterSec,
        stack: err.stack
      });
      setError(err.message);
      if (err.code === 'OTP_EXPIRED') {
        setOtp('');
      }
      if (err.code === 'OTP_TOO_MANY_ATTEMPTS') {
        setOtp('');
      }
      if (typeof err.retryAfterSec === 'number') {
        setResendAtMs(Date.now() + err.retryAfterSec * 1000);
      }
      setAttemptsRemaining((prev) => Math.max(0, prev - 1));
      hiddenOtpRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const handleOtpChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtp(digits);
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        {phase === 'collect' ? (
          <>
            <TextField label="Name" placeholder="Enter your full name" value={name} onChangeText={setName} />
            <TextField
              label="Email Address"
              placeholder="Enter your email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <CountryPicker selectedCountry={selectedCountry} onSelect={setSelectedCountry} />
            <TextField
              label="Phone Number"
              placeholder={selectedCountry.iso2 === 'IN' ? '9876543210' : 'National phone number'}
              keyboardType="phone-pad"
              value={nationalNumber}
              onChangeText={(value) => setNationalNumber(getPhoneDigits(value))}
              maxLength={14}
            />
            <PrimaryButton
              title={
                loading
                  ? 'Sending OTP...'
                  : requestCooldownRemainingSec > 0
                    ? `Send OTP in ${requestCooldownRemainingSec}s`
                    : 'Send OTP'
              }
              onPress={requestOtp}
              disabled={!canRequestOtp}
            />
            {requestCooldownRemainingSec > 0 ? (
              <Text style={[styles.timerText, { color: themeMode === 'light' ? '#334155' : '#FFFFFF' }]}>
                Please wait before requesting another WhatsApp OTP.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={[styles.verifyTitle, { color: themeMode === 'light' ? '#000000' : '#FFFFFF' }]}>Verify OTP</Text>
            <Text style={[styles.verifySubTitle, { color: themeMode === 'light' ? '#334155' : '#FFFFFF' }]}>
              Enter the 6-digit code sent to WhatsApp at {selectedCountry.dialCode} {nationalNumber}.
            </Text>
            <TextInput
              ref={hiddenOtpRef}
              value={otp}
              onChangeText={handleOtpChange}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              returnKeyType="done"
              style={styles.hiddenOtpInput}
              maxLength={OTP_LENGTH}
            />
            <Pressable style={styles.otpRow} onPress={() => hiddenOtpRef.current?.focus()}>
              {otpCells.map((digit, index) => {
                const focused = otp.length === index || (otp.length === OTP_LENGTH && index === OTP_LENGTH - 1);
                return (
                  <View
                    key={index}
                    style={[
                      styles.otpInput,
                      {
                        borderColor: themeColors.stroke,
                        backgroundColor: themeColors.cardMuted
                      },
                      focused && [styles.otpInputActive, { borderColor: themeColors.blueDark }]
                    ]}
                  >
                    <Text style={[styles.otpDigit, { color: themeMode === 'light' ? '#000000' : '#FFFFFF' }]}>{digit || ''}</Text>
                  </View>
                );
              })}
            </Pressable>

            <Text style={[styles.timerText, { color: themeMode === 'light' ? '#334155' : '#FFFFFF' }]}>
              {otpExpired ? 'OTP expired. Please resend.' : `Code expires in ${Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000))}s`}
            </Text>
            <Text style={[styles.timerText, { color: themeMode === 'light' ? '#334155' : '#FFFFFF' }]}>Attempts remaining: {attemptsRemaining}</Text>

            <PrimaryButton title={verifying ? 'Verifying...' : 'Verify OTP'} onPress={verifyOtp} disabled={!canVerify} />
            <PrimaryButton
              title={loading ? 'Resending...' : canResend ? 'Resend OTP' : `Resend in ${resendRemainingSec}s`}
              onPress={resendOtp}
              disabled={!canResend}
              style={[styles.secondaryBtn, { backgroundColor: themeColors.cardMuted, borderColor: themeColors.stroke }]}
            />
            <Pressable onPress={() => setPhase('collect')}>
              <Text style={[styles.backToEdit, { color: themeColors.blue }]}>Edit details</Text>
            </Pressable>
          </>
        )}

        {error ? <Text style={[styles.errorText, { color: themeColors.danger }]}>{error}</Text> : null}

        <View style={styles.footerLine}>
          <Text style={[styles.helper, { color: themeMode === 'light' ? '#334155' : '#FFFFFF' }]}>Returning member? </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back to welcome" onPress={() => navigation.navigate('SignIn')}>
            <Text style={[styles.link, { color: themeColors.blue }]}>Use the same OTP flow</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 16
  },
  verifyTitle: {
    ...typography.title,
    fontSize: 24
  },
  verifySubTitle: {
    ...typography.body
  },
  hiddenOtpInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0
  },
  otpGroup: {
    gap: 8
  },
  otpLabel: {
    ...typography.caption
  },
  otpRow: {
    flexDirection: 'row',
    gap: 8
  },
  otpInput: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  otpInputActive: {
    borderColor: '#2E6B00'
  },
  otpDigit: {
    ...typography.bodyStrong,
    fontSize: 18
  },
  timerText: {
    ...typography.caption
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#C7D2DF'
  },
  backToEdit: {
    ...typography.caption,
    textAlign: 'center'
  },
  errorText: {
    ...typography.caption
  },
  footerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  helper: {
    ...typography.caption
  },
  link: {
    ...typography.caption
  }
});
