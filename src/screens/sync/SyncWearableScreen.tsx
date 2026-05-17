import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, radius, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../state/AppContext';
import { connectWearable, syncWearableData } from '../../services/wearableService';

type Props = NativeStackScreenProps<RootStackParamList, 'SyncWearable'>;

export const SyncWearableScreen = ({ navigation }: Props) => {
  const { devices, selectedDeviceId, setSelectedDeviceId, setDevices, setWellness, addWearableSyncData } = useAppContext();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => devices.find((d) => d.id === selectedDeviceId) ?? null, [devices, selectedDeviceId]);

  const handleContinue = async () => {
    if (!selected) {
      setError('Please select a wearable brand to continue.');
      return;
    }

    try {
      setError(null);
      setSyncing(true);
      const connected = await connectWearable(selected);
      const synced = await syncWearableData(connected);
      setDevices((prev) => prev.map((d) => (d.id === connected.id ? connected : d)));
      setWellness(synced.wellness);
      addWearableSyncData(synced.payload);
      navigation.replace('SyncSuccess', { deviceName: connected.model });
    } catch {
      setError('Live wearable sync failed. Please check watch permissions, internet, and try again.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Sync Your Wearable</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close wearable sync" style={styles.closeButton} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={18} color={colors.textPrimary} />
        </Pressable>
      </View>
      <Text style={styles.subTitle}>Wearable sync is optional, but powerful. Connect sleep, heart rate, movement, and recovery data to make your care dashboard more accurate.</Text>

      <View style={styles.list}>
        {devices.map((device) => {
          const isActive = selectedDeviceId === device.id;
          return (
            <Pressable key={device.id} accessibilityRole="radio" accessibilityState={{ selected: isActive }} accessibilityLabel={`${device.brand} ${device.model}`} onPress={() => setSelectedDeviceId(device.id)} style={[styles.option, isActive && styles.optionActive]}>
              <View style={styles.optionLeft}>
                <Ionicons name="watch-outline" size={16} color={colors.textPrimary} />
                <View>
                  <Text style={styles.optionBrand}>{device.brand}</Text>
                  <Text style={styles.optionModel}>{device.model}</Text>
                </View>
              </View>
              {isActive ? <Ionicons name="checkmark-circle" size={20} color={colors.blue} /> : null}
            </Pressable>
          );
        })}
      </View>

      <Card style={styles.infoCard}>
        <Text style={styles.infoTitle}>What gets synced</Text>
        <Text style={styles.infoCopy}>Sleep quality, heart rate, activity, hydration support, and recovery signals. If you do not have a wearable, Fiteatsy will continue with manual assessments and symptom tracking.</Text>
      </Card>

      {error ? (
        <Card style={styles.errorCard}>
          <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
        </Card>
      ) : null}

      <PrimaryButton title={syncing ? 'Syncing...' : 'Continue'} onPress={handleContinue} disabled={syncing} />

      {syncing ? <ActivityIndicator style={styles.loader} color={colors.blue} /> : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  title: {
    ...typography.title,
    marginBottom: 8,
    marginTop: 6,
    flex: 1,
    paddingRight: 12
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.stroke
  },
  subTitle: {
    ...typography.body,
    fontSize: 14,
    marginBottom: 16
  },
  list: {
    gap: 10,
    marginBottom: 16
  },
  option: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  optionActive: {
    borderColor: colors.blue,
    backgroundColor: 'rgba(96,175,0,0.12)'
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  optionBrand: {
    ...typography.bodyStrong,
    fontSize: 15
  },
  optionModel: {
    ...typography.caption
  },
  infoCard: {
    marginBottom: 12
  },
  infoTitle: {
    ...typography.bodyStrong,
    marginBottom: 4,
    color: colors.textPrimary
  },
  infoCopy: {
    ...typography.body
  },
  errorCard: {
    backgroundColor: '#2A2A2A',
    borderColor: '#C9CFD4',
    marginBottom: 12
  },
  errorText: {
    ...typography.body,
    color: '#D04053'
  },
  loader: {
    marginTop: 12
  }
});
