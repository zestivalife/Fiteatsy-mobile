import React, { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { colors, getThemeColors, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { AssessmentGender } from '../../types';
import { useAppContext } from '../../state/AppContext';
import { formatConsultantAvailability, formatDobLabel, getConsultantProfile } from '../../utils/healthProfile';
import { buildHealthProfileCompletion } from '../../utils/healthProfileCompletion';
import { resolveClientName } from '../../utils/clientIdentity';
import { getExternalConsultantFeatureStatus } from '../../services/externalConsultantService';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return 'Not available';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const personalInfoOptions: AssessmentGender[] = ['Male', 'Female', 'Prefer not to say'];

export const ProfileScreen = ({ navigation }: Props) => {
  const [externalConsultantsEnabled, setExternalConsultantsEnabled] = useState(false);
  const {
    onboarding,
    setOnboarding,
    themeMode,
    logout,
    devices,
    selectedDeviceId,
    checkIns,
    wearableSyncData,
    nudges,
    assessment,
    healthProfileSyncDiagnostics,
    retryPendingHealthProfileSync,
    authSession,
    canonicalProfile,
    clientBootstrap
  } = useAppContext();
  const connectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;
  const palette = getThemeColors(themeMode);
  const isLight = themeMode === 'light';
  const consultant = getConsultantProfile(onboarding);
  const localCompletion = buildHealthProfileCompletion(onboarding, assessment, 0);
  const healthProfile = canonicalProfile ? {
    completionPercent: canonicalProfile.nutrition.completionPercent,
    readinessPercent: canonicalProfile.nutrition.readinessScore,
    isAiReady: canonicalProfile.nutrition.aiReady,
    missingItems: canonicalProfile.nutrition.missingFields
  } : clientBootstrap.profile.status === 'NO_DATA' ? localCompletion : null;
  const clientName = resolveClientName(authSession?.user.name);


  useFocusEffect(
    useCallback(() => {
      void retryPendingHealthProfileSync();
      void getExternalConsultantFeatureStatus()
        .then(({ enabled }) => setExternalConsultantsEnabled(enabled))
        .catch(() => setExternalConsultantsEnabled(false));
    }, [retryPendingHealthProfileSync])
  );

  const updateGender = (gender: AssessmentGender) => {
    if (!onboarding) return;
    setOnboarding({
      ...onboarding,
      gender
    });
  };

  const openChannel = async (url: string | null) => {
    if (!url) return;
    await Linking.openURL(url);
  };

  return (
    <Screen scroll contentStyle={styles.screenContent}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: palette.textPrimary }]}>Profile</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close profile"
          style={[styles.closeButton, { backgroundColor: palette.cardMuted, borderColor: palette.stroke }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={18} color={palette.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.identityHeader}>
        <View style={styles.identityAvatar}>
          <Text style={styles.identityAvatarText}>{clientName.slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={[styles.identityName, { color: palette.textPrimary }]}>{clientName}</Text>
        <Text style={[styles.identityDetail, { color: palette.textSecondary }]}>{onboarding?.careTrack ?? 'Foundational Recovery Care'}</Text>
      </View>

      <ProfileSectionLabel icon="heart-outline" label="HEALTH SUMMARY" color="#FF4F7B" />
      <Card style={styles.groupCard}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Health Profile Completion</Text>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Completion</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{healthProfile ? `${healthProfile.completionPercent}%` : clientBootstrap.profile.status === 'ERROR' ? 'Unavailable' : 'Loading'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Nutrition Profile Readiness</Text><Text style={[styles.value, { color: healthProfile?.isAiReady ? '#59BE08' : '#F0B44C' }]}>{healthProfile ? `${healthProfile.readinessPercent}%` : clientBootstrap.profile.status === 'ERROR' ? 'Unavailable' : 'Loading'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Missing</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{healthProfile ? healthProfile.missingItems.slice(0, 3).join(', ') || 'Nothing important missing' : clientBootstrap.profile.status === 'ERROR' ? 'Could not load profile' : 'Loading profile'}</Text></View>
      </Card>

      <ProfileSectionLabel icon="card-outline" label="MEMBERSHIP" color="#A87CFF" />
      <Card style={styles.groupCard}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Subscription</Text>
        <Text style={[styles.valueSecondary, { color: palette.textSecondary }]}>
          Manage your Fiteatsy plan, premium access, and payment history from the backend-controlled subscription centre.
        </Text>
        <Pressable
          accessibilityRole="button"
          style={styles.securityRow}
          onPress={() => navigation.navigate('MySubscription')}
        >
          <View>
            <Text style={[styles.securityTitle, { color: palette.textPrimary }]}>Plan and Entitlements</Text>
            <Text style={[styles.securitySubtitle, { color: palette.textSecondary }]}>View active access or choose a plan</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
        </Pressable>
      </Card>

      <ProfileSectionLabel icon="person-outline" label="ABOUT YOU" color="#46C9FF" />
      <Card style={styles.groupCard}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Member Profile</Text>
        <Text style={[styles.valuePrimary, { color: palette.textPrimary }]}>{clientName}</Text>
        <Text style={[styles.valueSecondary, { color: palette.textSecondary }]}>{onboarding?.careTrack ?? 'Foundational Recovery Care'}</Text>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Primary Conditions</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.primaryConditions?.join(', ') || 'Not set'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Primary Goal</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.primaryGoal ?? 'Not set'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Secondary Goals</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.secondaryGoals?.join(', ') || 'None'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Member Since</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{formatDate(authSession?.user.createdAtISO)}</Text></View>
      </Card>

      <Card style={styles.groupCard}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Personal Information</Text>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Date of Birth</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.dateOfBirthISO ? formatDobLabel(onboarding.dateOfBirthISO) : 'Not set'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Calculated Age</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.calculatedAge ? `${onboarding.calculatedAge} yrs` : 'Not set'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Age Group</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.ageBracket ?? 'Not set'}</Text></View>
        <Text style={[styles.inlineLabel, { color: palette.textSecondary }]}>Gender</Text>
        <View style={styles.chipRow}>
          {personalInfoOptions.map((option) => {
            const active = onboarding?.gender === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.genderChip,
                  { backgroundColor: palette.cardMuted, borderColor: palette.stroke },
                  active && styles.genderChipActive
                ]}
                onPress={() => updateGender(option)}
              >
                <Text style={[styles.genderChipText, { color: palette.textPrimary }, active && styles.genderChipTextActive]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <ProfileSectionLabel icon="people-outline" label="YOUR CARE TEAM" color="#59E735" />
      {externalConsultantsEnabled ? (
        <Card style={styles.groupCard}>
          <Pressable accessibilityRole="button" style={styles.securityRow} onPress={() => navigation.navigate('MyConsultants')}>
            <View>
              <Text style={[styles.securityTitle, { color: palette.textPrimary }]}>My Consultants</Text>
              <Text style={[styles.securitySubtitle, { color: palette.textSecondary }]}>Connect by PIN and manage shared access</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
          </Pressable>
        </Card>
      ) : null}
      <Card style={styles.groupCard}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Consultant Assignment</Text>
        <View style={styles.consultantHeader}>
          <View style={[styles.consultantAvatar, { backgroundColor: palette.cardMuted, borderColor: palette.stroke }]}>
            <Text style={[styles.consultantAvatarText, { color: palette.textPrimary }]}>{consultant.fullName.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.consultantMeta}>
            <Text style={[styles.consultantName, { color: palette.textPrimary }]}>{consultant.fullName}</Text>
            <Text style={[styles.consultantSpecialty, { color: palette.textSecondary }]}>{consultant.specialization}</Text>
          </View>
        </View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Availability</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{formatConsultantAvailability(consultant.availability)}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Last Consultation</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{formatDate(consultant.lastConsultationISO)}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Next Appointment</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{formatDate(consultant.nextAppointmentISO)}</Text></View>
        <View style={styles.channelRow}>
          <Pressable style={[styles.channelChip, { borderColor: palette.stroke }]} disabled={!consultant.chatEnabled}><Text style={[styles.channelChipText, { color: consultant.chatEnabled ? palette.textPrimary : palette.textSecondary }]}>Chat</Text></Pressable>
          <Pressable style={[styles.channelChip, { borderColor: palette.stroke }]} disabled={!consultant.callEnabled} onPress={() => openChannel(consultant.callEnabled ? 'tel:' : null)}><Text style={[styles.channelChipText, { color: consultant.callEnabled ? palette.textPrimary : palette.textSecondary }]}>Call</Text></Pressable>
          <Pressable style={[styles.channelChip, { borderColor: palette.stroke }]} disabled={!consultant.whatsappNumber} onPress={() => openChannel(consultant.whatsappNumber ? `https://wa.me/${consultant.whatsappNumber.replace(/\D/g, '')}` : null)}><Text style={[styles.channelChipText, { color: consultant.whatsappNumber ? palette.textPrimary : palette.textSecondary }]}>WhatsApp</Text></Pressable>
          <Pressable style={[styles.channelChip, { borderColor: palette.stroke }]} disabled={!consultant.email} onPress={() => openChannel(consultant.email ? `mailto:${consultant.email}` : null)}><Text style={[styles.channelChipText, { color: consultant.email ? palette.textPrimary : palette.textSecondary }]}>Email</Text></Pressable>
        </View>
      </Card>

      <ProfileSectionLabel icon="sparkles-outline" label="WELLNESS" color="#FFB52E" />
      <Card style={styles.groupCard}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Assessment Summary</Text>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Mood</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{assessment?.mood ?? 'Not completed'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Stress Level</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{assessment ? `${assessment.stressLevel}/5` : 'Not completed'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Sleep Quality</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{assessment?.sleepQuality ?? 'Not completed'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Voice Reflection</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{assessment?.voiceReflection ?? 'Not completed'}</Text></View>
      </Card>

      <Card style={styles.groupCard}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Care Preferences</Text>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Wearable Mode</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.wearablePreference ?? 'manual'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Schedule Sync</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.calendarProvider ?? 'None'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Notifications</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.notificationPermissionGranted ? 'Enabled' : 'Disabled'}</Text></View>
      </Card>

      <ProfileSectionLabel icon="pulse-outline" label="CONNECTED HEALTH" color="#FF4F7B" />
      <Card style={styles.groupCard}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Health Sync</Text>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Connected Device</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{connectedDevice ? `${connectedDevice.brand} ${connectedDevice.model}` : 'Not connected'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Total Syncs</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{wearableSyncData.length}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Check-ins Logged</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{checkIns.length}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Care Nudges</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{nudges.length}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Profile Sync Status</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{healthProfileSyncDiagnostics.status}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Last Attempt</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{formatDate(healthProfileSyncDiagnostics.lastAttemptAt)}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Last Success</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{formatDate(healthProfileSyncDiagnostics.lastSuccessAt)}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Retry Count</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{healthProfileSyncDiagnostics.retryCount}</Text></View>
        <Pressable style={styles.metricsLink} onPress={() => { void retryPendingHealthProfileSync(); }}>
          <Text style={[styles.metricsLinkText, { color: palette.blue }]}>Retry Health Profile Sync</Text>
          <Ionicons name="refresh" size={14} color={palette.blue} />
        </Pressable>
        <Pressable style={styles.metricsLink} onPress={() => navigation.navigate('ConnectedMetrics')}>
          <Text style={[styles.metricsLinkText, { color: palette.blue }]}>View Connected Metrics</Text>
          <Ionicons name="chevron-forward" size={14} color={palette.blue} />
        </Pressable>
        {__DEV__ ? (
          <Pressable style={styles.metricsLink} onPress={() => navigation.navigate('HealthSyncDebug')}>
            <Text style={[styles.metricsLinkText, { color: palette.warning }]}>Open Health Sync Debug</Text>
            <Ionicons name="bug-outline" size={14} color={palette.warning} />
          </Pressable>
        ) : null}
      </Card>

      <ProfileSectionLabel icon="settings-outline" label="SETTINGS" color="#8F96A3" />
      <Card style={styles.groupCard}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Preferences</Text>
        <Pressable accessibilityRole="button" style={styles.securityRow} onPress={() => navigation.navigate('FoodPreferences', { mode: 'profile' })}>
          <View>
            <Text style={[styles.securityTitle, { color: palette.textPrimary }]}>Food Preferences</Text>
            <Text style={[styles.securitySubtitle, { color: palette.textSecondary }]}>View or update meal preferences</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.securityRow} onPress={() => navigation.navigate('ChangePin')}>
          <View>
            <Text style={[styles.securityTitle, { color: palette.textPrimary }]}>Security</Text>
            <Text style={[styles.securitySubtitle, { color: palette.textSecondary }]}>Change PIN</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
        </Pressable>
      </Card>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log out"
        style={[styles.logoutButton, { backgroundColor: isLight ? '#334155' : '#323232', borderColor: isLight ? '#64748B' : '#C9CFD4' }]}
        onPress={() => {
          logout();
          navigation.reset({ index: 0, routes: [{ name: 'SignIn' }] });
        }}
      >
        <Ionicons name="log-out-outline" size={16} color="#FFFFFF" />
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </Screen>
  );
};

const ProfileSectionLabel = ({
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
  screenContent: {
    paddingBottom: 144
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18
  },
  title: {
    fontFamily: 'Exo_700Bold',
    fontSize: 34,
    letterSpacing: -1.1,
    lineHeight: 41
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.stroke,
    alignItems: 'center',
    justifyContent: 'center'
  },
  identityHeader: {
    alignItems: 'center',
    marginBottom: 28
  },
  identityAvatar: {
    alignItems: 'center',
    backgroundColor: '#59E735',
    borderRadius: 43,
    height: 86,
    justifyContent: 'center',
    marginBottom: 12,
    width: 86
  },
  identityAvatarText: {
    color: '#071006',
    fontFamily: 'Exo_600SemiBold',
    fontSize: 34,
    lineHeight: 41
  },
  identityName: {
    fontFamily: 'Exo_700Bold',
    fontSize: 22,
    lineHeight: 28
  },
  identityDetail: {
    fontFamily: 'Exo_400Regular',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3
  },
  groupLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 7,
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
  groupLabel: {
    fontFamily: 'Exo_500Medium',
    fontSize: 12,
    letterSpacing: 0.7,
    lineHeight: 17
  },
  groupCard: {
    backgroundColor: '#111016',
    borderColor: '#2A2932',
    borderRadius: 18,
    marginBottom: 16,
    shadowOpacity: 0,
    elevation: 0
  },
  sectionTitle: {
    ...typography.cardTitle,
    marginBottom: 10
  },
  valuePrimary: {
    ...typography.bodyMedium
  },
  valueSecondary: {
    ...typography.body,
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 10
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8
  },
  inlineLabel: {
    ...typography.body,
    fontSize: 14,
    marginTop: 6,
    marginBottom: 8
  },
  label: {
    ...typography.label,
    color: colors.textSecondary
  },
  value: {
    ...typography.bodyStrong,
    fontSize: 14,
    textAlign: 'right',
    flexShrink: 1
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  genderChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  genderChipActive: {
    backgroundColor: 'rgba(96,175,0,0.24)',
    borderColor: colors.blue
  },
  genderChipText: {
    ...typography.caption
  },
  genderChipTextActive: {
    fontFamily: 'Exo_700Bold'
  },
  consultantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12
  },
  consultantAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  consultantAvatarText: {
    ...typography.bodyStrong,
    fontSize: 18
  },
  consultantMeta: {
    flex: 1
  },
  consultantName: {
    ...typography.bodyStrong,
    fontSize: 16
  },
  consultantSpecialty: {
    ...typography.caption,
    marginTop: 2
  },
  channelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6
  },
  channelChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  channelChipText: {
    ...typography.caption
  },
  securityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  securityTitle: {
    ...typography.bodyStrong,
    fontSize: 14
  },
  securitySubtitle: {
    ...typography.caption
  },
  themeChip: {
    borderRadius: 999,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.stroke,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  themeChipActive: {
    backgroundColor: colors.blue,
    borderColor: colors.blue
  },
  themeSwitchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  themeChipText: {
    ...typography.bodyStrong,
    fontSize: 13,
    color: colors.textPrimary
  },
  themeChipTextActive: {
    color: '#000000'
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C9CFD4',
    backgroundColor: '#323232',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 4,
    marginBottom: 24
  },
  logoutText: {
    ...typography.bodyStrong,
    fontSize: 14,
    color: colors.white
  },
  metricsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4
  },
  metricsLinkText: {
    ...typography.bodyStrong,
    fontSize: 13
  }
});
