import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { SvgProps } from 'react-native-svg';

type SvgAsset = React.ComponentType<SvgProps>;
type Props = {
  onMyFitness: () => void;
  onHealthReports: () => void;
  onCycle: () => void;
};

const Icon = ({ name }: { name: React.ComponentProps<typeof Ionicons>['name'] }) => (
  <Ionicons name={name} size={18} color="#FFFFFF" />
);
const HealthDataIcon: SvgAsset = () => <Icon name="heart-outline" />;
const ReportsIcon: SvgAsset = () => <Icon name="document-text-outline" />;
const CycleIcon: SvgAsset = () => <Icon name="calendar-outline" />;

const Action = ({ label, icon: ActionIcon, onPress }: { label: string; icon: SvgAsset; onPress: () => void }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.action}>
    <ActionIcon width={18} height={18} />
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.label}>{label}</Text>
  </Pressable>
);

export const HomeHealthActions = ({ onMyFitness, onHealthReports, onCycle }: Props) => (
  <View style={styles.actions}>
    <View style={styles.actionRow}>
      <Action label="My Fitness" icon={HealthDataIcon} onPress={onMyFitness} />
      <Action label="Health Reports" icon={ReportsIcon} onPress={onHealthReports} />
      <Action label="Cycle" icon={CycleIcon} onPress={onCycle} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  actions: {
    marginTop: 8,
    gap: 7
  },
  actionRow: {
    flexDirection: 'row',
    gap: 7
  },
  action: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2B3137',
    backgroundColor: '#171C21',
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5
  },
  label: {
    color: '#FFFFFF',
    fontFamily: 'Exo_700Bold',
    fontSize: 9,
    lineHeight: 11
  }
});
