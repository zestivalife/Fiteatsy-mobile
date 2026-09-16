import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '../../components/Card';
import { ScreenHeader } from '../../components/PageHeader';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { getThemeColors, spacing, typography } from '../../design/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { useCanonicalHealthSyncCoordinator } from '../../services/canonicalHealthSyncCoordinator';
import { useAppContext } from '../../state/AppContext';

type Props=NativeStackScreenProps<RootStackParamList,'HealthSyncDebug'>;
export const CanonicalHealthSyncDebugScreen=({navigation}:Props)=>{
  const {themeMode}=useAppContext();const health=useCanonicalHealthSyncCoordinator();const palette=getThemeColors(themeMode);
  return <Screen scroll contentStyle={styles.content}><ScreenHeader title="Health Sync Diagnostics" onBack={()=>navigation.goBack()}/><Card style={styles.summary}><Row label="Provider" value={health.providerState} colors={palette}/><Row label="Upload" value={health.uploadState} colors={palette}/><Row label="Available metrics" value={String(health.availableMetricCount)} colors={palette}/><Row label="Diagnostic events" value={String(health.diagnostics.length)} colors={palette}/></Card>{health.metrics.map(metric=><Card key={metric.definition.metricKey} style={styles.metricCard}><Row label={metric.definition.displayName} value={`${metric.queryState} · ${metric.localRecordCount}`} colors={palette}/></Card>)}<PrimaryButton title="Run Canonical Sync" onPress={()=>void health.syncLocalMetrics()}/></Screen>;
};
const statusColor=(value:string,colors:ReturnType<typeof getThemeColors>)=>{const state=value.toUpperCase();if(state.includes('ERROR')||state.includes('FAILED'))return colors.danger;if(state.includes('WARNING')||state.includes('PARTIAL'))return colors.warning;if(state.includes('SYNCING')||state.includes('CALCULATING')||state.includes('READING'))return colors.info;if(state.includes('AVAILABLE')||state.includes('CONNECTED')||state.includes('SUCCESS'))return colors.success;return colors.textSecondary;};
const Row=({label,value,colors}:{label:string;value:string;colors:ReturnType<typeof getThemeColors>})=><View style={styles.row}><Text style={[styles.label,{color:colors.textPrimary}]}>{label}</Text><Text accessibilityLabel={`${label}: ${value}`} style={[styles.value,{color:colors.textSecondary},{color:statusColor(value,colors)}]}>{value}</Text></View>;
const styles=StyleSheet.create({content:{gap:spacing.sm},summary:{gap:spacing.md,marginTop:spacing.sm},metricCard:{minHeight:64,justifyContent:'center'},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:spacing.sm},label:{...typography.bodyMedium,flex:1},value:{...typography.bodyStrong,textAlign:'right',flexShrink:0}});
