import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'SignIn'>;

const freeEmailDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com', 'proton.me'];

const isCorporateEmail = (email: string) => {
  const normalized = email.trim().toLowerCase();
  const parts = normalized.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return false;
  }
  if (freeEmailDomains.includes(parts[1])) {
    return false;
  }
  return parts[1].includes('.');
};

export const SignInScreen = ({ navigation }: Props) => {
  const { setIsAuthenticated, onboarding, assessment, wearableSetupCompleted } = useAppContext();
  const [email, setEmail] = useState('care@fiteatsy.com');
  const [password, setPassword] = useState('Demo@123');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => email.trim().length > 0 && password.trim().length > 0, [email, password]);

  const handleSignIn = () => {
    if (!isCorporateEmail(email)) {
      setError('Please sign in with your corporate email (for example: name@company.com).');
      return;
    }

    setError(null);
    setIsAuthenticated(true);
    if (!assessment) {
      navigation.replace('OnboardingAssessment');
      return;
    }
    if (!onboarding) {
      navigation.replace('OnboardingBasics');
      return;
    }
    navigation.replace(wearableSetupCompleted ? 'Main' : 'SyncWearable');
  };

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.form}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subTitle}>Use your corporate email to continue.</Text>
          <Text style={styles.demoHint}>Demo: care@fiteatsy.com  |  Demo@123</Text>

          <TextField
            label="Corporate Email"
            placeholder="name@company.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextField
            label="Password"
            placeholder="Enter password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton title="Sign In" onPress={handleSignIn} disabled={!canSubmit} />

          <View style={styles.footerLine}>
            <Text style={styles.helper}>Don't have an account? </Text>
            <Pressable onPress={() => navigation.navigate('SignUp')}>
              <Text style={styles.link}>Sign Up</Text>
            </Pressable>
          </View>
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
  form: {
    gap: 16
  },
  title: {
    ...typography.title,
    fontSize: 24
  },
  subTitle: {
    ...typography.body,
    fontSize: 14,
    marginTop: -10
  },
  demoHint: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: -8
  },
  error: {
    ...typography.caption,
    fontSize: 13,
    color: colors.danger,
    marginTop: -8
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
    color: colors.blue
  }
});
