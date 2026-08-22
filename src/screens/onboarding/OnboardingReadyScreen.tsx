import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OnboardingAction, OnboardingShell } from '../../components/onboarding/OnboardingShell';
import { colors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingReady'>;

export const OnboardingReadyScreen = ({ navigation }: Props) => {
  const { onboarding, assessment, wearableSetupCompleted, setWearableSetupCompleted } = useAppContext();
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(reveal, { toValue: 1, duration: 500, useNativeDriver: true }).start(); }, [reveal]);
  const healthReady = Boolean(onboarding?.dateOfBirthISO && onboarding?.gender);
  const recoveryReady = Boolean(assessment?.completedAtISO);
  const nutritionReady = Boolean(onboarding?.primaryGoal || onboarding?.healthGoals.length);
  const healthConnected = onboarding?.wearablePreference === 'sync';
  const consultantReady = Boolean(onboarding?.assignedConsultantId);
  const enter = () => { setWearableSetupCompleted(true); navigation.reset({ index: 0, routes: [{ name: 'Main' }] }); };

  return <OnboardingShell phase="READY" step={1} total={1} onBack={() => navigation.goBack()} scroll action={<View><OnboardingAction title="Enter Fiteatsy" onPress={enter} /><OnboardingAction title="Review my answers" secondary onPress={() => navigation.navigate('OnboardingBasics')} /></View>}>
    <Animated.View style={[styles.hero, { opacity: reveal, transform: [{ scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}>
      <View style={styles.checkHero}><Ionicons name="checkmark" size={36} color={colors.textPrimary} /></View>
      <Text style={styles.title}>Your Fiteatsy profile is ready</Text><Text style={styles.subtitle}>Here's what we've set up for you</Text>
    </Animated.View>
    <View style={styles.list}>
      <Status icon="person-outline" label="Health profile" status={healthReady ? 'Ready' : 'Needs attention'} tone="green" />
      <Status icon="pulse-outline" label="Recovery baseline" status={recoveryReady ? 'Ready' : 'Needs attention'} tone="green" />
      <Status icon="heart-outline" label="Nutrition profile" status={nutritionReady ? 'Ready' : 'Needs attention'} tone="green" />
      <Status icon="wifi-outline" label="Health data" status={healthConnected ? 'Connected' : wearableSetupCompleted ? 'Skipped' : 'Not connected'} tone="cyan" />
      <Status icon="star-outline" label="Consultant matching" status={consultantReady ? 'Ready' : 'Pending'} tone="yellow" />
    </View>
  </OnboardingShell>;
};

const toneMap = { green: colors.success, cyan: colors.blue, yellow: '#FFBE25' };
const Status = ({ icon, label, status, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; status: string; tone: keyof typeof toneMap }) => {
  const accent = toneMap[tone];
  return <View style={[styles.status, { borderColor: `${accent}55`, backgroundColor: `${accent}0A` }]}><View style={[styles.icon, { backgroundColor: `${accent}16` }]}><Ionicons name={icon} size={20} color={accent} /></View><Text style={styles.statusLabel}>{label}</Text><Text style={[styles.badge, { color: accent, backgroundColor: `${accent}16` }]}>{status}</Text></View>;
};

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.lg }, checkHero: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#37D6CD', alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.sectionTitle, fontSize: 20, lineHeight: 26, color: colors.textPrimary, textAlign: 'center', marginTop: spacing.lg }, subtitle: { ...typography.body, fontSize: 14, color: colors.textSecondary, marginTop: spacing.sm },
  list: { gap: spacing.sm }, status: { minHeight: 64, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, statusLabel: { ...typography.bodyStrong, flex: 1, fontSize: 14, color: colors.textPrimary }, badge: { ...typography.label, fontSize: 11, lineHeight: 14, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill }
});
