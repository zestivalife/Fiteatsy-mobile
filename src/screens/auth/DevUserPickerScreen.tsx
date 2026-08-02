import React, { useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { DEVELOPMENT_USERS, type DevelopmentUser } from '../../data/developmentUsers';
import { getThemeColors, radius, shadows, spacing, typography } from '../../design/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'DevUserPicker'>;

const getNextRoute = ({
  onboarding,
  assessment,
  wearableSetupCompleted
}: Pick<ReturnType<typeof useAppContext>, 'onboarding' | 'assessment' | 'wearableSetupCompleted'>): keyof RootStackParamList => {
  if (!onboarding) return 'OnboardingBasics';
  if (!assessment) return 'OnboardingAssessment';
  if (!wearableSetupCompleted) return 'SyncWearable';
  return 'Main';
};

export const DevUserPickerScreen = ({ navigation }: Props) => {
  const {
    assessment,
    completeDevelopmentAuthentication,
    onboarding,
    themeMode,
    wearableSetupCompleted
  } = useAppContext();
  const palette = getThemeColors(themeMode);
  const [selectedUser, setSelectedUser] = useState<DevelopmentUser>(DEVELOPMENT_USERS[0]);

  if (!__DEV__) {
    navigation.replace('SignIn');
    return null;
  }

  const continueWithUser = () => {
    completeDevelopmentAuthentication(selectedUser);
    const nextRoute = getNextRoute({ onboarding, assessment, wearableSetupCompleted });

    if (nextRoute === 'OnboardingBasics') {
      navigation.replace('OnboardingBasics');
      return;
    }
    if (nextRoute === 'OnboardingAssessment') {
      navigation.replace('OnboardingAssessment');
      return;
    }
    if (nextRoute === 'SyncWearable') {
      navigation.replace('SyncWearable');
      return;
    }
    navigation.replace('Main');
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: palette.blue }]}>Development Mode</Text>
        <Text style={[styles.title, { color: palette.textPrimary }]}>Select Development User</Text>
        <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
          Choose a local mock profile to enter the normal Fiteatsy onboarding and home flow without OTP, SMS, or PostgreSQL.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.stroke }]}>
        {DEVELOPMENT_USERS.map((user) => {
          const selected = selectedUser.id === user.id;
          return (
            <Pressable
              key={user.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${user.shortName}, ${user.client.fiteatsyClientId}`}
              onPress={() => setSelectedUser(user)}
              style={({ pressed }) => [
                styles.userRow,
                { borderColor: palette.stroke },
                selected && { backgroundColor: palette.blueSoft, borderColor: palette.blue },
                pressed && styles.pressed
              ]}
            >
              <View
                style={[
                  styles.radio,
                  { borderColor: selected ? palette.blue : palette.strokeStrong },
                  selected && { backgroundColor: palette.blue }
                ]}
              >
                {selected ? <View style={styles.radioDot} /> : null}
              </View>

              <View style={styles.userText}>
                <Text style={[styles.userName, { color: palette.textPrimary }]}>{user.shortName}</Text>
                <Text style={[styles.userMeta, { color: palette.textSecondary }]}>
                  {user.name} - {user.mobileNumber}
                </Text>
                <Text style={[styles.clientId, { color: palette.textMuted }]}>
                  {user.client.fiteatsyClientId} - {user.client.status}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.note, { backgroundColor: palette.surfaceTint, borderColor: palette.stroke }]}>
        <Text style={[styles.noteTitle, { color: palette.textPrimary }]}>Local only</Text>
        <Text style={[styles.noteBody, { color: palette.textSecondary }]}>
          This screen is guarded by __DEV__ and does not alter production authentication.
        </Text>
      </View>

      <PrimaryButton title="Continue" onPress={continueWithUser} />
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    justifyContent: 'center',
    paddingBottom: spacing.xxl
  },
  header: {
    gap: spacing.xs
  },
  kicker: {
    ...typography.caption,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  title: {
    ...typography.titleXL
  },
  subtitle: {
    ...typography.body
  },
  card: {
    ...shadows.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm
  },
  userRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 84,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  pressed: {
    opacity: 0.86
  },
  radio: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24
  },
  radioDot: {
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
    height: 10,
    width: 10
  },
  userText: {
    flex: 1,
    gap: 2
  },
  userName: {
    ...typography.bodyStrong
  },
  userMeta: {
    ...typography.caption
  },
  clientId: {
    ...typography.caption,
    fontFamily: 'Poppins_600SemiBold'
  },
  note: {
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xxs,
    padding: spacing.md
  },
  noteTitle: {
    ...typography.bodyStrong
  },
  noteBody: {
    ...typography.caption
  }
});
