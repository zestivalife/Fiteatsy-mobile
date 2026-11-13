import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AssistIcon from '../assets/fiteatsy-home/assist.svg';
import type { SvgProps } from 'react-native-svg';

type SvgAsset = React.ComponentType<SvgProps>;
type Props = {
  onAssist: () => void;
  onPlans: () => void;
  onMyFitness: () => void;
  onHealthReports: () => void;
  onCycle: () => void;
};

const Icon = ({ name }: { name: React.ComponentProps<typeof Ionicons>['name'] }) => (
  <Ionicons name={name} size={18} color="#FFFFFF" />
);
const PlansIcon: SvgAsset = () => <Icon name="layers-outline" />;
const HealthDataIcon: SvgAsset = () => <Icon name="heart-outline" />;
const ReportsIcon: SvgAsset = () => <Icon name="document-text-outline" />;
const CycleIcon: SvgAsset = () => <Icon name="calendar-outline" />;

const Action = ({ label, icon: ActionIcon, onPress }: { label: string; icon: SvgAsset; onPress: () => void }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.action}>
    <ActionIcon width={18} height={18} />
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.label}>{label}</Text>
  </Pressable>
);

export const HomeHealthActions = ({ onAssist, onPlans, onMyFitness, onHealthReports, onCycle }: Props) => (
  <View style={styles.row}>
    <Action label="Assist" icon={AssistIcon} onPress={onAssist} />
    <Action label="Plans" icon={PlansIcon} onPress={onPlans} />
    <Action label="My Fitness" icon={HealthDataIcon} onPress={onMyFitness} />
    <Action label="Health Reports" icon={ReportsIcon} onPress={onHealthReports} />
    <Action label="Cycle" icon={CycleIcon} onPress={onCycle} />
  </View>
);

const styles = StyleSheet.create({
  row: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    rowGap: 7
  },
  action: {
    minHeight: 44,
    width: '49%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2B3137',
    backgroundColor: '#171C21',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  label: {
    color: '#FFFFFF',
    fontFamily: 'Exo_700Bold',
    fontSize: 10,
    lineHeight: 13
  }
});
