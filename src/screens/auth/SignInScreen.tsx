import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { getThemeColors, typography } from '../../design/tokens';
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
  const { themeMode } = useAppContext();
  const themeColors = getThemeColors(themeMode);
  const isLight = themeMode === 'light';
  const darkTextStrong = isLight ? '#000000' : '#FFFFFF';
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
    navigation.navigate('SignUp');
  };

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.form}>
          <Text style={[styles.title, { color: darkTextStrong }]}>Sign in</Text>
          <Text style={[styles.subTitle, { color: darkTextStrong }]}>Corporate access routes through verified OTP in this build.</Text>
          <Text style={[styles.demoHint, { color: darkTextStrong }]}>Enter your email, then continue to the OTP verification flow.</Text>

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

          {error ? <Text style={[styles.error, { color: themeColors.danger }]}>{error}</Text> : null}

          <PrimaryButton title="Continue to OTP" onPress={handleSignIn} disabled={!canSubmit} />

          <View style={styles.footerLine}>
            <Text style={[styles.helper, { color: darkTextStrong }]}>Don't have an account? </Text>
            <Pressable onPress={() => navigation.navigate('SignUp')}>
              <Text style={[styles.link, { color: themeColors.blue }]}>Sign Up</Text>
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
    marginTop: -8
  },
  error: {
    ...typography.caption,
    fontSize: 13,
    marginTop: -8
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
