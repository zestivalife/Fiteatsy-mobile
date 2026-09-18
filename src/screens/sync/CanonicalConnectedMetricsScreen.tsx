import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { canonicalHealthStatus, canonicalHealthStatusLabel } from '@fiteatsy/health-intelligence';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppBackButton } from '../../components/AppBackButton';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { getThemeColors, typography } from '../../design/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { useCanonicalHealthSyncCoordinator } from '../../services/canonicalHealthSyncCoordinator';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'ConnectedMetrics'>;
const stateLabel = (state:string) => canonicalHealthStatusLabel(state).toUpperCase();

export const CanonicalConnectedMetricsScreen = ({ navigation }: Props) => {
  const { themeMode } = useAppContext();
  const health = useCanonicalHealthSyncCoordinator();
  const palette = getThemeColors(themeMode);
  return <Screen scroll>
    <View style={styles.header}><AppBackButton iconOnly onPress={() => navigation.goBack()} /><Text style={[styles.title,{color:palette.textPrimary}]}>Connected Metrics</Text><View style={styles.spacer}/></View>
    <Card><Text style={[styles.section,{color:palette.textPrimary}]}>Sync Summary</Text><Text style={[styles.text,{color:palette.textSecondary}]}>Provider: {health.sourceName}</Text><Text style={[styles.text,{color:palette.textSecondary}]}>Status: {health.providerLabel}</Text><Text style={[styles.text,{color:palette.textSecondary}]}>Upload: {health.uploadState}</Text></Card>
    <Card><Text style={[styles.section,{color:palette.textPrimary}]}>Metrics Status</Text>{health.metrics.map(metric=>{const available=canonicalHealthStatus(metric.queryState)==='AVAILABLE';return <View key={metric.definition.metricKey} style={styles.row}><Text style={[styles.text,{color:palette.textPrimary}]}>{metric.definition.displayName}</Text><View style={styles.status}><Ionicons name={available?'checkmark-circle':'time-outline'} size={14} color={available?palette.success:palette.textMuted}/><Text style={[styles.value,{color:available?palette.success:palette.textMuted}]}>{stateLabel(metric.queryState)}</Text></View></View>;})}</Card>
  </Screen>;
};
const styles=StyleSheet.create({header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},spacer:{width:34,height:34},title:{...typography.section,fontSize:20},section:{...typography.bodyStrong,fontSize:14,marginBottom:8},text:{...typography.body,fontSize:12,marginBottom:4},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:6,gap:8},status:{flexDirection:'row',alignItems:'center',gap:4},value:{...typography.bodyStrong,fontSize:12}});
