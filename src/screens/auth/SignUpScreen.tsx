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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
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

type Props = NativeStackScreenProps<RootStackParamList, 'SignUp'>;
const OTP_LENGTH = 6;

export const SignUpScreen = ({ navigation }: Props) => {
  const { setIsAuthenticated, setOnboarding, themeMode } = useAppContext();
  const themeColors = getThemeColors(themeMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [phase, setPhase] = useState<'collect' | 'verify'>('collect');
  const [challengeId, setChallengeId] = useState('');
  const [otp, setOtp] = useState('');
  const [expiresAtMs, setExpiresAtMs] = useState(0);
  const [resendAtMs, setResendAtMs] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const hiddenOtpRef = useRef<TextInput>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const appState = useRef(AppState.currentState);

  const otpCells = useMemo(() => {
    return Array.from({ length: OTP_LENGTH }, (_, idx) => otp[idx] ?? '');
  }, [otp]);

  const otpExpired = phase === 'verify' && expiresAtMs > 0 && nowMs >= expiresAtMs;
  const resendRemainingSec = Math.max(0, Math.ceil((resendAtMs - nowMs) / 1000));
  const canResend = phase === 'verify' && resendRemainingSec === 0 && !loading;
  const canVerify = otp.length === OTP_LENGTH && !otpExpired && !verifying;
  const canRequestOtp = name.trim().length >= 2 && email.trim().length > 0 && mobileNumber.trim().length >= 10 && !loading;

  useEffect(() => {
    if (phase !== 'verify') return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);

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
    setDebugOtp(response.debugOtp ?? null);
  };

  const requestOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await requestSignupOtp({
        name: name.trim(),
        email: email.trim(),
        mobileNumber: mobileNumber.trim()
      });
      applyOtpMetadata(response);
      setOtp('');
      setPhase('verify');
      setTimeout(() => hiddenOtpRef.current?.focus(), 120);
    } catch (e) {
      const err = e as AuthServiceError;
      setError(err.message);
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
      await verifySignupOtp(challengeId, otp);
      setOnboarding((previous) => ({
        name: name.trim() || previous?.name || 'Member',
        age: previous?.age ?? 28,
        ageBracket: previous?.ageBracket ?? '25-34',
        gender: previous?.gender ?? 'Prefer not to say',
        wellnessGoal: previous?.wellnessGoal,
        primaryConditions: previous?.primaryConditions ?? [],
        symptomTags: previous?.symptomTags ?? ['Fatigue'],
        healthGoals: previous?.healthGoals ?? ['Better Energy'],
        wearablePreference: previous?.wearablePreference ?? 'later',
        careTrack: previous?.careTrack ?? 'Foundational Recovery Care',
        matchedDietitianName: previous?.matchedDietitianName ?? 'Dr. Aisha Menon',
        matchedDietitianSpecialty: previous?.matchedDietitianSpecialty ?? 'Clinical Nutrition & Habit Recovery',
        calendarProvider: previous?.calendarProvider ?? 'None',
        calendarPermissionGranted: previous?.calendarPermissionGranted ?? false,
        notificationPermissionGranted: previous?.notificationPermissionGranted ?? false,
        createdAtISO: previous?.createdAtISO ?? new Date().toISOString(),
        dateOfBirthISO: previous?.dateOfBirthISO
      }));
      setIsAuthenticated(true);
      navigation.reset({ index: 0, routes: [{ name: 'OnboardingAssessment' }] });
    } catch (e) {
      const err = e as AuthServiceError;
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
            <TextField
              label="Mobile Number"
              placeholder="Enter mobile number with country code"
              keyboardType="phone-pad"
              value={mobileNumber}
              onChangeText={setMobileNumber}
            />
            <PrimaryButton title={loading ? 'Sending OTP...' : 'Send OTP'} onPress={requestOtp} disabled={!canRequestOtp} />
          </>
        ) : (
          <>
            <Text style={[styles.verifyTitle, { color: themeColors.textPrimary }]}>Verify OTP</Text>
            <Text style={[styles.verifySubTitle, { color: themeColors.textSecondary }]}>
              Enter the 6-digit code sent to {email.trim().toLowerCase()} and {mobileNumber.trim()}.
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
                    <Text style={[styles.otpDigit, { color: themeColors.textPrimary }]}>{digit || ''}</Text>
                  </View>
                );
              })}
            </Pressable>

            <Text style={[styles.timerText, { color: themeColors.textSecondary }]}>
              {otpExpired ? 'OTP expired. Please resend.' : `Code expires in ${Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000))}s`}
            </Text>
            <Text style={[styles.timerText, { color: themeColors.textSecondary }]}>Attempts remaining: {attemptsRemaining}</Text>

            {debugOtp ? <Text style={[styles.debugOtp, { color: themeColors.warning }]}>Dev OTP: {debugOtp}</Text> : null}

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
          <Text style={[styles.helper, { color: themeColors.textSecondary }]}>Already have an account? </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Go to sign in" onPress={() => navigation.navigate('SignIn')}>
            <Text style={[styles.link, { color: themeColors.blue }]}>Sign In</Text>
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
  debugOtp: {
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
