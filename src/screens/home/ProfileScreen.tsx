import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { colors, getThemeColors, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

const formatDate = (iso: string | undefined) => {
  if (!iso) return 'Not available';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export const ProfileScreen = ({ navigation }: Props) => {
  const { onboarding, themeMode, setThemeMode, logout, devices, selectedDeviceId, checkIns, wearableSyncData, nudges, assessment } = useAppContext();
  const connectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;
  const palette = getThemeColors(themeMode);
  const isLight = themeMode === 'light';

  return (
    <Screen scroll>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: palette.textPrimary }]}>Fiteatsy Care Profile</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close profile" style={[styles.closeButton, { backgroundColor: palette.cardMuted, borderColor: palette.stroke }]} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={18} color={palette.textPrimary} />
        </Pressable>
      </View>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Member Profile</Text>
        <Text style={[styles.valuePrimary, { color: palette.textPrimary }]}>{onboarding?.name ?? 'Member'}</Text>
        <Text style={[styles.valueSecondary, { color: palette.textSecondary }]}>{onboarding?.careTrack ?? 'Foundational Recovery Care'}</Text>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Age Group</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.ageBracket ?? '25-34'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Primary Conditions</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.primaryConditions?.join(', ') ?? 'Not set'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Health Goals</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.healthGoals?.join(', ') ?? 'Not set'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Member Since</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{formatDate(onboarding?.createdAtISO)}</Text></View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Dietitian Match</Text>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Assigned Dietitian</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.matchedDietitianName ?? 'Pending'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Specialty</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.matchedDietitianSpecialty ?? 'Clinical Nutrition'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Symptoms</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.symptomTags?.join(', ') ?? 'Not set'}</Text></View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Assessment Summary</Text>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Mood</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{assessment?.mood ?? 'Not completed'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Stress Level</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{assessment ? `${assessment.stressLevel}/5` : 'Not completed'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Sleep Quality</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{assessment?.sleepQuality ?? 'Not completed'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Voice Reflection</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{assessment?.voiceReflection ?? 'Not completed'}</Text></View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Care Preferences</Text>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Wearable Mode</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.wearablePreference ?? 'manual'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Schedule Sync</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.calendarProvider ?? 'None'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Notifications</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{onboarding?.notificationPermissionGranted ? 'Enabled' : 'Disabled'}</Text></View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Health Sync</Text>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Connected Device</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{connectedDevice ? `${connectedDevice.brand} ${connectedDevice.model}` : 'Not connected'}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Total Syncs</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{wearableSyncData.length}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Check-ins Logged</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{checkIns.length}</Text></View>
        <View style={styles.row}><Text style={[styles.label, { color: palette.textSecondary }]}>Care Nudges</Text><Text style={[styles.value, { color: palette.textPrimary }]}>{nudges.length}</Text></View>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>Preferences</Text>
        <View style={styles.row}>
          <Text style={[styles.label, { color: palette.textSecondary }]}>Theme</Text>
          <View style={styles.themeSwitchWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set dark theme"
              accessibilityState={{ selected: themeMode === 'dark' }}
              style={[styles.themeChip, { backgroundColor: palette.cardMuted, borderColor: palette.stroke }, themeMode === 'dark' && styles.themeChipActive]}
              onPress={() => setThemeMode('dark')}
            >
              <Text style={[styles.themeChipText, { color: palette.textPrimary }, themeMode === 'dark' && styles.themeChipTextActive]}>Dark</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set light theme"
              accessibilityState={{ selected: themeMode === 'light' }}
              style={[styles.themeChip, { backgroundColor: palette.cardMuted, borderColor: palette.stroke }, themeMode === 'light' && styles.themeChipActive]}
              onPress={() => setThemeMode('light')}
            >
              <Text style={[styles.themeChipText, { color: palette.textPrimary }, themeMode === 'light' && styles.themeChipTextActive]}>Light</Text>
            </Pressable>
          </View>
        </View>
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

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  title: {
    ...typography.section,
    fontSize: 22
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.stroke,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sectionTitle: {
    ...typography.bodyStrong,
    fontSize: 14,
    marginBottom: 10
  },
  valuePrimary: {
    ...typography.bodyStrong,
    fontSize: 18
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
  label: {
    ...typography.body,
    fontSize: 14,
    color: colors.textSecondary
  },
  value: {
    ...typography.bodyStrong,
    fontSize: 14,
    textAlign: 'right',
    flexShrink: 1
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
  }
});
