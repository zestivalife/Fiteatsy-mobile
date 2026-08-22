import React, { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppBackButton } from '../../components/AppBackButton';
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
      <AppBackButton onPress={() => navigation.goBack()} />

      <View style={[styles.hero, { borderColor: palette.stroke, backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#101311' }]}>
        <Text style={styles.eyebrow}>Consultant booking</Text>
        <Text style={[styles.title, { color: palette.textPrimary }]}>Book expert support</Text>
        <Text style={[styles.body, { color: palette.textSecondary }]}>
          Choose a preferred window and request a consultation through your assigned consultant channel.
        </Text>
      </View>

      <View style={[styles.card, { borderColor: palette.stroke, backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0F1010' }]}>
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

      <View style={[styles.card, { borderColor: palette.stroke, backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0F1010' }]}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Preferred time</Text>
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
                <Text style={[styles.windowText, { color: selected ? '#FFFFFF' : palette.textSecondary }]}>{window}</Text>
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
        style={[styles.planButton, { borderColor: palette.stroke, backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#0F1010' }]}
        accessibilityRole="button"
      >
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

const styles = StyleSheet.create({
  screen: {
    gap: spacing.md
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
  hero: {
    borderWidth: 1,
    borderRadius: 26,
    padding: spacing.lg,
    gap: 10
  },
  eyebrow: {
    color: '#5FC100',
    fontFamily: 'Exo_700Bold',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  title: {
    fontFamily: 'Exo_700Bold',
    fontSize: 30,
    lineHeight: 36
  },
  body: {
    fontFamily: 'Exo_400Regular',
    fontSize: 15,
    lineHeight: 22
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
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
    backgroundColor: '#153923',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    fontFamily: 'Exo_700Bold',
    fontSize: 24
  },
  consultantMeta: {
    flex: 1,
    gap: 4
  },
  consultantName: {
    fontFamily: 'Exo_700Bold',
    fontSize: 19
  },
  consultantDetail: {
    fontFamily: 'Exo_400Regular',
    fontSize: 13,
    lineHeight: 18
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
    fontFamily: 'Exo_700Bold',
    fontSize: 18
  },
  windowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  windowChip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  windowText: {
    fontFamily: 'Exo_600SemiBold',
    fontSize: 13
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
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md
  },
  planButtonCopy: {
    flex: 1,
    gap: 4
  },
  planButtonTitle: {
    fontFamily: 'Exo_700Bold',
    fontSize: 16
  },
  planButtonBody: {
    fontFamily: 'Exo_400Regular',
    fontSize: 13,
    lineHeight: 18
  }
});
