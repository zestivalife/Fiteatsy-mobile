import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppBackButton } from '../../components/AppBackButton';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { getThemeColors, typography } from '../../design/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { useCanonicalHealthSyncCoordinator } from '../../services/canonicalHealthSyncCoordinator';
import { useAppContext } from '../../state/AppContext';

type Props=NativeStackScreenProps<RootStackParamList,'HealthSyncDebug'>;
export const CanonicalHealthSyncDebugScreen=({navigation}:Props)=>{
  const {themeMode}=useAppContext();const health=useCanonicalHealthSyncCoordinator();const palette=getThemeColors(themeMode);
  return <Screen scroll><AppBackButton onPress={()=>navigation.goBack()}/><Text style={[styles.title,{color:palette.textPrimary}]}>Health Sync Diagnostics</Text><Card><Row label="Provider" value={health.providerState} colors={palette}/><Row label="Upload" value={health.uploadState} colors={palette}/><Row label="Available metrics" value={String(health.availableMetricCount)} colors={palette}/><Row label="Diagnostic events" value={String(health.diagnostics.length)} colors={palette}/></Card>{health.metrics.map(metric=><Card key={metric.definition.metricKey}><Row label={metric.definition.displayName} value={`${metric.queryState} · ${metric.localRecordCount}`} colors={palette}/></Card>)}<PrimaryButton title="Run Canonical Sync" onPress={()=>void health.syncLocalMetrics()}/></Screen>;
};
const Row=({label,value,colors}:{label:string;value:string;colors:ReturnType<typeof getThemeColors>})=><View style={styles.row}><Text style={[styles.label,{color:colors.textSecondary}]}>{label}</Text><Text style={[styles.value,{color:colors.textPrimary}]}>{value}</Text></View>;
const styles=StyleSheet.create({title:{...typography.section,marginVertical:16},row:{flexDirection:'row',justifyContent:'space-between',gap:8},label:{...typography.body},value:{...typography.bodyStrong}});
