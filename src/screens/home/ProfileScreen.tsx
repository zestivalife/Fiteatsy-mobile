import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { colors, typography } from '../../design/tokens';
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

  return (
    <Screen scroll>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Fiteatsy Care Profile</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close profile" style={styles.closeButton} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={18} color={colors.textPrimary} />
        </Pressable>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Member Profile</Text>
        <Text style={styles.valuePrimary}>{onboarding?.name ?? 'Member'}</Text>
        <Text style={styles.valueSecondary}>{onboarding?.careTrack ?? 'Foundational Recovery Care'}</Text>
        <View style={styles.row}><Text style={styles.label}>Age Group</Text><Text style={styles.value}>{onboarding?.ageBracket ?? '25-34'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Primary Conditions</Text><Text style={styles.value}>{onboarding?.primaryConditions?.join(', ') ?? 'Not set'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Health Goals</Text><Text style={styles.value}>{onboarding?.healthGoals?.join(', ') ?? 'Not set'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Member Since</Text><Text style={styles.value}>{formatDate(onboarding?.createdAtISO)}</Text></View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Dietitian Match</Text>
        <View style={styles.row}><Text style={styles.label}>Assigned Dietitian</Text><Text style={styles.value}>{onboarding?.matchedDietitianName ?? 'Pending'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Specialty</Text><Text style={styles.value}>{onboarding?.matchedDietitianSpecialty ?? 'Clinical Nutrition'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Symptoms</Text><Text style={styles.value}>{onboarding?.symptomTags?.join(', ') ?? 'Not set'}</Text></View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Assessment Summary</Text>
        <View style={styles.row}><Text style={styles.label}>Mood</Text><Text style={styles.value}>{assessment?.mood ?? 'Not completed'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Stress Level</Text><Text style={styles.value}>{assessment ? `${assessment.stressLevel}/5` : 'Not completed'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Sleep Quality</Text><Text style={styles.value}>{assessment?.sleepQuality ?? 'Not completed'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Voice Reflection</Text><Text style={styles.value}>{assessment?.voiceReflection ?? 'Not completed'}</Text></View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Care Preferences</Text>
        <View style={styles.row}><Text style={styles.label}>Wearable Mode</Text><Text style={styles.value}>{onboarding?.wearablePreference ?? 'manual'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Schedule Sync</Text><Text style={styles.value}>{onboarding?.calendarProvider ?? 'None'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Notifications</Text><Text style={styles.value}>{onboarding?.notificationPermissionGranted ? 'Enabled' : 'Disabled'}</Text></View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Health Sync</Text>
        <View style={styles.row}><Text style={styles.label}>Connected Device</Text><Text style={styles.value}>{connectedDevice ? `${connectedDevice.brand} ${connectedDevice.model}` : 'Not connected'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Total Syncs</Text><Text style={styles.value}>{wearableSyncData.length}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Check-ins Logged</Text><Text style={styles.value}>{checkIns.length}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Care Nudges</Text><Text style={styles.value}>{nudges.length}</Text></View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Theme</Text>
          <Pressable accessibilityRole="switch" accessibilityLabel="Toggle app theme" accessibilityState={{ checked: themeMode === 'light' }} style={[styles.themeChip, themeMode === 'light' && styles.themeChipLight]} onPress={() => setThemeMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}>
            <Text style={styles.themeChipText}>{themeMode === 'dark' ? 'Dark' : 'Light'}</Text>
          </Pressable>
        </View>
      </Card>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log out"
        style={styles.logoutButton}
        onPress={() => {
          logout();
          navigation.reset({ index: 0, routes: [{ name: 'SignIn' }] });
        }}
      >
        <Ionicons name="log-out-outline" size={16} color={colors.white} />
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
  themeChipLight: {
    backgroundColor: colors.blue,
    borderColor: colors.blue
  },
  themeChipText: {
    ...typography.bodyStrong,
    fontSize: 13
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
