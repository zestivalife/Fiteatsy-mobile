import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChoiceCard, OnboardingAction, OnboardingShell, QuestionHeader } from '../../components/onboarding/OnboardingShell';
import { colors, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingNotifications'>;

export const OnboardingNotificationsScreen = ({ navigation }: Props) => {
  const { onboarding, setOnboarding, setWearableSetupCompleted } = useAppContext();
  const [allowReminders, setAllowReminders] = useState<'Yes' | 'No'>(onboarding?.notificationPermissionGranted ? 'Yes' : 'No');
  const complete = () => {
    if (onboarding) setOnboarding({ ...onboarding, notificationPermissionGranted: allowReminders === 'Yes' });
    setWearableSetupCompleted(false);
    navigation.navigate('OnboardingReady');
  };
  return <OnboardingShell phase="CONNECT" step={3} total={3} onBack={() => navigation.goBack()} action={<OnboardingAction title="Continue" onPress={complete} />}>
    <QuestionHeader title="Would you like smart health reminders?" description="We’ll only remind you when it supports your recovery. You can change this later." />
    <View style={styles.binary}>
      <ChoiceCard label="Yes, allow reminders" selected={allowReminders === 'Yes'} accent="#FFBE25" onPress={() => setAllowReminders('Yes')} />
      <ChoiceCard label="Not now" selected={allowReminders === 'No'} onPress={() => setAllowReminders('No')} />
    </View>
    <View style={styles.info}><Text style={styles.infoTitle}>Medication stays separate</Text><Text style={styles.infoBody}>Medicines and supplements remain managed by the existing Medication Tracker; onboarding never fabricates a prescription.</Text></View>
  </OnboardingShell>;
};

const styles = StyleSheet.create({
  binary: { gap: spacing.sm },
  info: { marginTop: spacing.lg, borderWidth: 1, borderColor: colors.stroke, borderRadius: 16, padding: spacing.md, backgroundColor: colors.cardMuted },
  infoTitle: { ...typography.bodyStrong, fontSize: 14, color: colors.textPrimary },
  infoBody: { ...typography.caption, fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginTop: spacing.xs }
});
