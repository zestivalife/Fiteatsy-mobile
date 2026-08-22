import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChoiceCard, OnboardingAction, OnboardingShell, QuestionHeader } from '../../components/onboarding/OnboardingShell';
import { spacing } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { CalendarProvider } from '../../types';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingCalendar'>;

export const OnboardingCalendarScreen = ({ navigation }: Props) => {
  const { onboarding, setOnboarding } = useAppContext();
  const selected = onboarding?.calendarProvider ?? 'None';
  const select = (provider: CalendarProvider) => {
    if (!onboarding) return;
    setOnboarding({ ...onboarding, calendarProvider: provider, calendarPermissionGranted: provider !== 'None' });
  };
  return <OnboardingShell phase="CONNECT" step={2} total={3} onBack={() => navigation.goBack()} action={<OnboardingAction title="Continue" onPress={() => navigation.navigate('OnboardingNotifications')} />}>
    <QuestionHeader title="Fit recovery around your day" description="Helps Fiteatsy time meals, hydration, medication and recovery nudges around your day." />
    <View style={styles.list}>
      <ChoiceCard icon="logo-google" label="Google Calendar" description="Uses the existing calendar preference" selected={selected === 'Google'} onPress={() => select('Google')} />
      <ChoiceCard icon="calendar-outline" label="Outlook" description="Uses the existing calendar preference" selected={selected === 'Outlook'} onPress={() => select('Outlook')} />
      <ChoiceCard icon="create-outline" label="Set manually" description="Continue with manual planning" selected={selected === 'None'} onPress={() => select('None')} />
    </View>
  </OnboardingShell>;
};

const styles = StyleSheet.create({ list: { gap: spacing.sm } });
