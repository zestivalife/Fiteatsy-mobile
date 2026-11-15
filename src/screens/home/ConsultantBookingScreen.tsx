import React, { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PageHeader } from '../../components/PageHeader';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { colors, getThemeColors, radius, spacing } from '../../design/tokens';
import { useEntitlementGate } from '../../hooks/useEntitlementGate';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { formatConsultantAvailability, getConsultantProfile } from '../../utils/healthProfile';

type Props = NativeStackScreenProps<RootStackParamList, 'ConsultantBooking'>;

const bookingWindows = [
  'Today evening',
  'Tomorrow morning',
  'Tomorrow evening',
  'This week'
];

export const ConsultantBookingScreen = ({ navigation }: Props) => {
  const { onboarding, themeMode } = useAppContext();
  const palette = getThemeColors(themeMode);
  const { checkingEntitlement, requireEntitlement } = useEntitlementGate(navigation);
  const consultant = useMemo(() => getConsultantProfile(onboarding), [onboarding]);
  const [selectedWindow, setSelectedWindow] = useState(bookingWindows[1]);
  const [requestState, setRequestState] = useState<'idle' | 'sent' | 'blocked'>('idle');
  const isAssigned = consultant.status === 'assigned';

  const requestCopy = [
    `Hi ${consultant.fullName},`,
    `I would like to book a Fiteatsy consultation slot for ${selectedWindow}.`,
    `Goal: ${onboarding?.primaryGoal ?? onboarding?.wellnessGoal ?? 'General wellness'}.`,
    'Please confirm the next available appointment.'
  ].join('\n');

  const openBookingChannel = async () => {
    if (consultant.whatsappNumber) {
      const phone = consultant.whatsappNumber.replace(/\D/g, '');
      await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(requestCopy)}`);
      setRequestState('sent');
      return;
    }

    if (consultant.email) {
      await Linking.openURL(`mailto:${consultant.email}?subject=${encodeURIComponent('Fiteatsy consultation booking request')}&body=${encodeURIComponent(requestCopy)}`);
      setRequestState('sent');
      return;
    }

    setRequestState('blocked');
  };

  const requestBooking = async () => {
    await requireEntitlement({
      source: 'book_consultation',
      entitlement: 'EXPERT_CONSULTATION',
      returnDestination: 'ConsultantBooking',
      onAllowed: openBookingChannel
    });
  };

  return (
    <Screen scroll contentStyle={styles.screen}>
      <PageHeader title="Care" subtitle="Expert support, organised around your health goals." back={false} />

      <CareSectionLabel icon="person-circle-outline" label="YOUR CONSULTANT" color="#46C9FF" />
      <View style={[styles.card, { borderColor: themeMode === 'light' ? palette.stroke : '#2A2932', backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#111016' }]}>
        <View style={styles.consultantHeader}>
          <View style={[styles.avatar, { borderColor: palette.stroke }]}>
            <Text style={[styles.avatarText, { color: palette.textPrimary }]}>{consultant.fullName.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.consultantMeta}>
            <Text style={[styles.consultantName, { color: palette.textPrimary }]}>{consultant.fullName}</Text>
            <Text style={[styles.consultantDetail, { color: palette.textSecondary }]}>{consultant.specialization}</Text>
            <Text style={[styles.consultantDetail, { color: palette.textSecondary }]}>{formatConsultantAvailability(consultant.availability)}</Text>
          </View>
        </View>
        {!isAssigned ? (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingTitle}>Assignment in progress</Text>
            <Text style={styles.pendingText}>Your consultant booking channel will unlock after your consultant is assigned.</Text>
          </View>
        ) : null}
      </View>

      <CareSectionLabel icon="calendar-outline" label="BOOK A SESSION" color="#A87CFF" />
      <View style={[styles.card, { borderColor: themeMode === 'light' ? palette.stroke : '#2A2932', backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#111016' }]}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Preferred time</Text>
        <Text style={[styles.body, { color: palette.textSecondary }]}>Choose a window that works for you. Your consultant will confirm the exact time.</Text>
        <View style={styles.windowGrid}>
          {bookingWindows.map((window) => {
            const selected = selectedWindow === window;
            return (
              <Pressable
                key={window}
                onPress={() => setSelectedWindow(window)}
                style={[styles.windowChip, { borderColor: selected ? '#5FC100' : palette.stroke, backgroundColor: selected ? '#1B3E13' : 'transparent' }]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <View style={styles.windowCopy}>
                  <Ionicons name={selected ? 'checkmark-circle' : 'time-outline'} size={18} color={selected ? '#59E735' : '#8F96A3'} />
                  <Text style={[styles.windowText, { color: selected ? '#FFFFFF' : palette.textSecondary }]}>{window}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {requestState === 'sent' ? (
        <Text style={styles.successText}>Booking request opened in your consultant channel.</Text>
      ) : null}
      {requestState === 'blocked' ? (
        <Text style={styles.errorText}>No consultant booking channel is available yet. Please check your assignment status from Profile.</Text>
      ) : null}

      <Pressable
        onPress={() => navigation.navigate('SubscriptionPlans', { source: 'subscription_management' })}
        style={[styles.planButton, { borderColor: themeMode === 'light' ? palette.stroke : '#2A2932', backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#111016' }]}
        accessibilityRole="button"
      >
        <View style={[styles.planIcon, { backgroundColor: palette.blueSoft }]}>
          <Ionicons name="heart-outline" size={21} color={palette.blue} />
        </View>
        <View style={styles.planButtonCopy}>
          <Text style={[styles.planButtonTitle, { color: palette.textPrimary }]}>View recommended plans</Text>
          <Text style={[styles.planButtonBody, { color: palette.textSecondary }]}>See the best Fiteatsy support option based on your profile and goals.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={palette.textPrimary} />
      </Pressable>

      <PrimaryButton title={checkingEntitlement ? 'Checking access...' : 'Request Booking'} onPress={requestBooking} disabled={!isAssigned || checkingEntitlement} />
    </Screen>
  );
};

const CareSectionLabel = ({
  icon,
  label,
  color
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
}) => (
  <View style={styles.groupLabelRow}>
    <View style={[styles.groupLabelIcon, { backgroundColor: `${color}1F` }]}>
      <Ionicons name={icon} size={15} color={color} />
    </View>
    <Text style={[styles.groupLabel, { color }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    gap: spacing.sm,
    paddingBottom: 136
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  backText: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 15
  },
  largeTitleBlock: {
    gap: 3,
    marginBottom: 16,
    paddingHorizontal: 4
  },
  largeTitle: {
    fontFamily: 'Exo_700Bold',
    fontSize: 34,
    letterSpacing: -1.1,
    lineHeight: 41
  },
  groupLabel: {
    fontFamily: 'Exo_500Medium',
    fontSize: 12,
    letterSpacing: 0.7,
    lineHeight: 17,
  },
  groupLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginLeft: 6,
    marginTop: 8
  },
  groupLabelIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  eyebrow: {
    color: '#5FC100',
    fontFamily: 'Exo_500Medium',
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  title: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 16,
    lineHeight: 22
  },
  body: {
    fontFamily: 'Exo_400Regular',
    fontSize: 14,
    lineHeight: 20
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: spacing.md,
    gap: spacing.md
  },
  consultantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    backgroundColor: '#46C9FF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    color: '#071016',
    fontFamily: 'Exo_700Bold',
    fontSize: 24
  },
  consultantMeta: {
    flex: 1,
    gap: 4
  },
  consultantName: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 14,
    lineHeight: 20
  },
  consultantDetail: {
    fontFamily: 'Exo_400Regular',
    fontSize: 12,
    lineHeight: 17
  },
  pendingBox: {
    borderRadius: 16,
    backgroundColor: '#2D2510',
    padding: spacing.md,
    gap: 5
  },
  pendingTitle: {
    color: colors.warning,
    fontFamily: 'Exo_700Bold',
    fontSize: 14
  },
  pendingText: {
    color: '#F3E2B0',
    fontFamily: 'Exo_400Regular',
    fontSize: 13,
    lineHeight: 18
  },
  sectionTitle: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 16,
    lineHeight: 22
  },
  windowGrid: {
    gap: 8
  },
  windowChip: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  windowText: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 14,
    lineHeight: 18
  },
  windowCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10
  },
  successText: {
    color: colors.success,
    fontFamily: 'Exo_600SemiBold',
    fontSize: 13,
    lineHeight: 18
  },
  errorText: {
    color: colors.danger,
    fontFamily: 'Exo_600SemiBold',
    fontSize: 13,
    lineHeight: 18
  },
  planButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md
  },
  planButtonCopy: {
    flex: 1,
    gap: 4
  },
  planIcon: {
    alignItems: 'center',
    borderRadius: 11,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  planButtonTitle: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 14,
    lineHeight: 20
  },
  planButtonBody: {
    fontFamily: 'Exo_400Regular',
    fontSize: 12,
    lineHeight: 17
  }
});
