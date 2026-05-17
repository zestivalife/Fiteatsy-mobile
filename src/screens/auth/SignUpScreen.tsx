import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, radius, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SignUp'>;

export const SignUpScreen = ({ navigation }: Props) => {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '']);

  const updateOtp = (index: number, value: string) => {
    const sanitized = value.replace(/[^0-9]/g, '').slice(0, 1);
    const next = [...otp];
    next[index] = sanitized;
    setOtp(next);
  };

  return (
    <Screen>
      <View style={styles.container}>
        <TextField
          label="Email Address"
          placeholder="Enter your email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <View style={styles.otpGroup}>
          <Text style={styles.otpLabel}>OTP</Text>
          <View style={styles.otpRow}>
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                accessibilityLabel={`OTP digit ${index + 1}`}
                style={styles.otpInput}
                keyboardType="number-pad"
                value={digit}
                onChangeText={(value) => updateOtp(index, value)}
                maxLength={1}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
              />
            ))}
          </View>
        </View>

        <PrimaryButton title="Sign Up" onPress={() => navigation.navigate('SyncWearable')} />

        <View style={styles.footerLine}>
          <Text style={styles.helper}>Already have an account? </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Go to sign in" onPress={() => navigation.navigate('SignIn')}>
            <Text style={styles.link}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 16
  },
  otpGroup: {
    gap: 8
  },
  otpLabel: {
    ...typography.caption,
    color: colors.textMuted
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
    borderColor: colors.stroke,
    backgroundColor: colors.cardMuted,
    color: colors.textPrimary,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600'
  },
  footerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  helper: {
    ...typography.caption,
    color: colors.textSecondary
  },
  link: {
    ...typography.caption,
    color: colors.pink
  }
});
