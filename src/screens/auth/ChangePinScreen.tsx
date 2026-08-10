import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { getThemeColors, radius, shadows, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { AuthServiceError, changePin } from '../../services/authService';

type Props = NativeStackScreenProps<RootStackParamList, 'ChangePin'>;

const PIN_LENGTH = 6;

export const ChangePinScreen = ({ navigation, route }: Props) => {
  const { authSession, themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const force = route.params?.force === true;
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const valid =
    currentPin.length === PIN_LENGTH &&
    newPin.length === PIN_LENGTH &&
    confirmNewPin.length === PIN_LENGTH &&
    newPin === confirmNewPin &&
    !saving;

  const normalizePin = (value: string) => value.replace(/\D/g, '').slice(0, PIN_LENGTH);

  const submit = async () => {
    if (!authSession?.sessionToken) {
      setError('Please login again before changing your PIN.');
      return;
    }
    if (newPin !== confirmNewPin) {
      setError('PIN confirmation does not match.');
      return;
    }
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await changePin(authSession.sessionToken, {
        currentPin,
        newPin,
        confirmNewPin
      });
      setSuccess('PIN changed successfully.');
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
    } catch (e) {
      const err = e as AuthServiceError;
      console.error('[ChangePinScreen] CHANGE PIN FAILED', {
        errorMessage: err.message,
        code: err.code,
        retryAfterSec: err.retryAfterSec,
        stack: err.stack
      });
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const renderPinInput = (
    label: string,
    value: string,
    onChangeText: (value: string) => void,
    placeholder: string
  ) => (
    <View style={styles.inputGroup}>
      <Text style={[styles.inputLabel, { color: palette.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(next) => onChangeText(normalizePin(next))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={PIN_LENGTH}
        placeholder={placeholder}
        placeholderTextColor={palette.textMuted}
        style={[
          styles.pinInput,
          {
            color: palette.textPrimary,
            backgroundColor: palette.cardMuted,
            borderColor: palette.stroke
          }
        ]}
      />
    </View>
  );

  return (
    <Screen>
      <View style={styles.container}>
        <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
          <Text style={[styles.kicker, { color: palette.blue }]}>Security</Text>
          <Text style={[styles.title, { color: palette.textPrimary }]}>
            {force ? 'Please create your personal PIN' : 'Change PIN'}
          </Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>
            Use exactly 6 digits. Do not reuse the temporary default PIN.
          </Text>

          {renderPinInput('Current PIN', currentPin, setCurrentPin, force ? '123456' : 'Current PIN')}
          {renderPinInput('New PIN', newPin, setNewPin, 'New 6 digit PIN')}
          {renderPinInput('Confirm New PIN', confirmNewPin, setConfirmNewPin, 'Confirm PIN')}

          {error ? <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text> : null}
          {success ? <Text style={[styles.successText, { color: palette.success }]}>{success}</Text> : null}

          <PrimaryButton title={saving ? 'Saving...' : 'Save PIN'} onPress={submit} disabled={!valid} />
          {!force ? (
            <Pressable accessibilityRole="button" onPress={() => navigation.goBack()}>
              <Text style={[styles.secondaryLink, { color: palette.textSecondary }]}>Cancel</Text>
            </Pressable>
          ) : null}
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
  card: {
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
    ...typography.title,
    fontSize: 24
  },
  body: {
    ...typography.body,
    fontSize: 14
  },
  inputGroup: {
    gap: 6
  },
  inputLabel: {
    ...typography.caption
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
  successText: {
    ...typography.caption
  },
  secondaryLink: {
    ...typography.bodyStrong,
    textAlign: 'center'
  }
});
