import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RootStackParamList } from '../../src/navigation/types';
import { Screen } from '../../src/components/Screen';
import { Card } from '../../src/components/Card';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { colors, typography } from '../../src/design/tokens';
import { useAppContext } from '../../src/state/AppContext';

// Historical reference only. This archived screen is excluded from active navigation.
type ArchivedProps = NativeStackScreenProps<RootStackParamList>;

export const ArchivedSyncSuccessScreen = ({ navigation, route }: ArchivedProps) => {
  const { setWearableSetupCompleted } = useAppContext();
  const deviceName = (route.params as { deviceName?: string } | undefined)?.deviceName ?? 'Health app';
  return (
    <Screen>
      <View style={styles.container}>
        <Card style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark" size={34} color={colors.white} />
          </View>
          <Text style={styles.title}>Sync Successful</Text>
          <Text style={styles.copy}>Your device {deviceName} is connected and wellness metrics are now available.</Text>
          <PrimaryButton
            title="Go To Dashboard"
            style={styles.cta}
            onPress={() => {
              setWearableSetupCompleted(true);
              navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
            }}
          />
        </Card>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  card: { alignItems: 'center', gap: 14, paddingVertical: 22, paddingHorizontal: 20 },
  iconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purple },
  title: { ...typography.section, fontSize: 28, lineHeight: 34 },
  copy: { ...typography.body, textAlign: 'center', marginBottom: 8, lineHeight: 20 },
  cta: { width: '72%' }
});
