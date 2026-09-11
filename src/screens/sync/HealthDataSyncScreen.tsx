import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { getThemeColors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import {
  getHealthSyncActivity,
  getHealthSyncStatus,
  getLatestHealthObservations,
  HealthObservationDto,
  HealthSyncActivity,
  HealthSyncStatus,
  runHealthSync
} from '../../services/healthSyncManager';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'HealthDataSync'>;
type UiState = 'idle'|'syncing'|'success'|'partial'|'error';
type MetricDefinition = { type:string; label:string; icon:keyof typeof Ionicons.glyphMap };

const definitions:MetricDefinition[] = [
  {type:'steps',label:'Steps',icon:'footsteps-outline'},
  {type:'distance',label:'Distance',icon:'navigate-outline'},
  {type:'sleep_minutes',label:'Sleep',icon:'moon-outline'},
  {type:'heart_rate',label:'Heart Rate',icon:'heart-outline'},
  {type:'resting_heart_rate',label:'Resting Heart Rate',icon:'heart-circle-outline'},
  {type:'hrv',label:'HRV',icon:'pulse-outline'},
  {type:'active_energy',label:'Active Energy',icon:'flame-outline'},
  {type:'workout_minutes',label:'Exercise',icon:'fitness-outline'},
  {type:'workout',label:'Workouts',icon:'barbell-outline'},
  {type:'weight',label:'Weight',icon:'scale-outline'},
  {type:'respiratory_rate',label:'Respiratory Rate',icon:'cloud-outline'},
  {type:'blood_oxygen',label:'Blood Oxygen',icon:'water-outline'}
];

const providerName=(provider?:string|null)=>provider==='APPLE_HEALTH'||Platform.OS==='ios'?'Apple Health':'Health Connect';
const formatWhen=(iso?:string|null)=>{
  if(!iso)return 'Not synced yet';
  const date=new Date(iso);if(Number.isNaN(date.getTime()))return 'Not available';
  const minutes=Math.floor((Date.now()-date.getTime())/60_000);
  if(minutes<1)return 'Just now';if(minutes<60)return `${minutes} min ago`;
  return date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
};
const displayValue=(item:HealthObservationDto)=>{
  if(item.metricType==='sleep_minutes')return {value:(item.value/60).toFixed(1),unit:'hr'};
  return {value:new Intl.NumberFormat().format(item.value),unit:item.unit};
};
const metricStatus=(item:HealthObservationDto,status:HealthSyncStatus|null)=>{
  const age=Date.now()-new Date(item.measuredAtISO).getTime();
  if(status?.overallStatus==='NOT_CONNECTED')return 'Permission needed';
  if(age>36*60*60*1000)return 'Last updated earlier';
  return 'Synced';
};

export const HealthDataSyncScreen=({navigation}:Props)=>{
  const {themeMode,wellness,setWellness,addWearableSyncData,setSelectedDeviceId}=useAppContext();
  const palette=getThemeColors(themeMode);const running=useRef(false);
  const mounted=useRef(true);const operationId=useRef(0);
  const [status,setStatus]=useState<HealthSyncStatus|null>(null);
  const [observations,setObservations]=useState<HealthObservationDto[]>([]);
  const [activity,setActivity]=useState<HealthSyncActivity[]>([]);
  const [loading,setLoading]=useState(true);const [uiState,setUiState]=useState<UiState>('idle');
  const [message,setMessage]=useState<string|null>(null);const [selected,setSelected]=useState<HealthObservationDto|null>(null);

  const refresh=useCallback(async()=>{
    const [nextStatus,nextObservations,nextActivity]=await Promise.all([
      getHealthSyncStatus(),getLatestHealthObservations(200),getHealthSyncActivity(8)
    ]);
    setStatus(nextStatus);setObservations(nextObservations.items);setActivity(nextActivity.items);
  },[]);
  useEffect(()=>{mounted.current=true;void refresh().catch(()=>mounted.current&&setMessage('Health sync status is temporarily unavailable.')).finally(()=>mounted.current&&setLoading(false));return()=>{mounted.current=false;operationId.current+=1;running.current=false;};},[refresh]);

  const latestByMetric=useMemo(()=>{
    const map=new Map<string,HealthObservationDto>();
    for(const item of observations){const current=map.get(item.metricType);if(!current||item.measuredAtISO>current.measuredAtISO)map.set(item.metricType,item);}
    return map;
  },[observations]);
  const metrics=definitions.map(definition=>({definition,item:latestByMetric.get(definition.type)})).filter(row=>row.item);
  const connected=status?.overallStatus==='CONNECTED';
  const platformStatus=Platform.OS==='ios'?status?.appleHealth:status?.healthConnect;
  const source=providerName(Platform.OS==='ios'?'APPLE_HEALTH':'HEALTH_CONNECT');

  const syncNow=useCallback(async()=>{
    if(running.current)return;running.current=true;let reachedTerminalState=false;const currentOperation=++operationId.current;
    const isCurrent=()=>mounted.current&&operationId.current===currentOperation;
    setUiState('syncing');setMessage(`Connecting to ${source}…`);
    try{
      const connection=Platform.OS==='ios'?status?.appleHealth:status?.healthConnect;
      const result=await runHealthSync(Platform.OS==='ios'?'apple-health':'health-connect',wellness,
        connection?.connectionId?{connectionId:connection.connectionId,provider:Platform.OS==='ios'?'APPLE_HEALTH':'HEALTH_CONNECT',trigger:'MANUAL'}:undefined);
      if(!isCurrent())return;
      addWearableSyncData(result.payload);setSelectedDeviceId(Platform.OS==='ios'?'apple-health':'health-connect');setWellness(result.wellness);
      const partial=result.rejected>0;setUiState(partial?'partial':'success');
      reachedTerminalState=true;
      setMessage(partial?`Health data partially updated · ${result.accepted} records updated`:`Health data updated · ${result.accepted} records updated`);
      await refresh();
    }catch{if(isCurrent()){reachedTerminalState=true;setUiState('error');setMessage('We couldn’t update your health data. Your previous data is safe.');}}
    finally{if(operationId.current===currentOperation){running.current=false;if(mounted.current&&!reachedTerminalState)setUiState('error');}}
  },[addWearableSyncData,refresh,setSelectedDeviceId,setWellness,source,status,wellness]);

  if(loading)return <Screen><PageHeader title="Health Data Sync" onBack={()=>navigation.goBack()}/><View style={styles.loading}><ActivityIndicator color={palette.blue}/><Text style={[styles.body,{color:palette.textSecondary}]}>Checking your health connection…</Text></View></Screen>;

  return <>
    <Screen scroll contentStyle={styles.content}>
      <PageHeader title="Health Data Sync" onBack={()=>navigation.goBack()}/>
      <Card style={styles.connectionCard}>
        <View style={styles.connectionHeader}><View style={[styles.sourceIcon,{backgroundColor:palette.blueSoft}]}><Ionicons name={Platform.OS==='ios'?'heart':'fitness'} size={24} color={palette.blue}/></View><View style={styles.grow}><Text style={[styles.cardTitle,{color:palette.textPrimary}]}>{source}</Text><Text style={[styles.body,{color:connected?palette.success:palette.warning}]}>{connected?'Connected':'Connection needed'}</Text></View><View style={[styles.chip,{backgroundColor:connected?palette.successSoft:palette.warningSoft}]}><Text style={[styles.chipText,{color:connected?palette.success:palette.warning}]}>{platformStatus?.freshness==='CURRENT'?'Up to date':connected?'Connected':'Action needed'}</Text></View></View>
        <View style={styles.summaryRow}><View><Text style={[styles.caption,{color:palette.textMuted}]}>Last synced</Text><Text style={[styles.valueText,{color:palette.textPrimary}]}>{formatWhen(platformStatus?.lastSuccessISO??status?.lastSyncISO)}</Text></View><View><Text style={[styles.caption,{color:palette.textMuted}]}>Records available</Text><Text style={[styles.valueText,{color:palette.textPrimary}]}>{status?.recordsSynced??0}</Text></View></View>
        <PrimaryButton title={uiState==='syncing'?'Syncing…':uiState==='partial'?'Sync Again':uiState==='error'?'Try Again':uiState==='success'?'Synced':'Sync Now'} loading={uiState==='syncing'} disabled={!connected} onPress={()=>void syncNow()}/>
        {!connected?<PrimaryButton title="Review Permissions" variant="secondary" onPress={()=>navigation.navigate('SyncWearable')}/>:null}
        {message?<Text accessibilityLiveRegion="polite" style={[styles.message,{color:uiState==='error'?palette.danger:palette.textSecondary}]}>{message}</Text>:null}
      </Card>

      <Text style={[styles.sectionTitle,{color:palette.textPrimary}]}>Your Health Data</Text>
      {metrics.length?metrics.map(({definition,item})=>{const shown=displayValue(item!);const label=metricStatus(item!,status);return <Pressable key={definition.type} accessibilityRole="button" accessibilityLabel={`${definition.label}, ${shown.value} ${shown.unit}, ${label}`} onPress={()=>setSelected(item!)}><Card style={styles.metricCard}><View style={[styles.metricIcon,{backgroundColor:palette.surfaceTint}]}><Ionicons name={definition.icon} size={20} color={palette.blue}/></View><View style={styles.grow}><Text style={[styles.cardTitle,{color:palette.textPrimary}]}>{definition.label}</Text><Text style={[styles.metricValue,{color:palette.textPrimary}]}>{shown.value} <Text style={styles.metricUnit}>{shown.unit}</Text></Text><Text style={[styles.caption,{color:palette.textMuted}]}>{source} · Updated {formatWhen(item!.measuredAtISO).toLowerCase()}</Text></View><Text style={[styles.chipText,{color:label==='Synced'?palette.success:palette.warning}]}>{label}</Text></Card></Pressable>;}):<Card><Text style={[styles.cardTitle,{color:palette.textPrimary}]}>No recent health data found</Text><Text style={[styles.body,{color:palette.textSecondary}]}>Your connected health app has not provided recent data for the supported metrics.</Text></Card>}

      <Text style={[styles.sectionTitle,{color:palette.textPrimary}]}>Sync Activity</Text>
      <Card>{activity.length?activity.map((item,index)=><View key={item.id} style={[styles.activityRow,index>0&&{borderTopColor:palette.stroke,borderTopWidth:1}]}><View style={styles.grow}><Text style={[styles.valueText,{color:palette.textPrimary}]}>{formatWhen(item.completedAtISO??item.startedAtISO)}</Text><Text style={[styles.caption,{color:palette.textMuted}]}>{item.status==='SUCCESS'?`${item.metricsUpdated} records updated`:item.status==='PARTIAL'?'Some health data updated':item.status==='RUNNING'?'Syncing health data':'Health data could not be updated'}</Text></View><Text style={[styles.chipText,{color:item.status==='FAILED'?palette.danger:item.status==='PARTIAL'?palette.warning:palette.success}]}>{item.status==='SUCCESS'?'Successful':item.status==='PARTIAL'?'Partial':item.status==='RUNNING'?'Updating':'Couldn’t sync'}</Text></View>):<Text style={[styles.body,{color:palette.textSecondary}]}>Your recent sync activity will appear here.</Text>}</Card>
    </Screen>
    <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={()=>setSelected(null)}><Pressable style={[styles.overlay,{backgroundColor:palette.overlay}]} onPress={()=>setSelected(null)}><Pressable style={[styles.sheet,{backgroundColor:palette.card}]} onPress={()=>undefined}>{selected?<><View style={styles.sheetHandle}/><Text style={[styles.sectionTitle,{color:palette.textPrimary}]}>{definitions.find(item=>item.type===selected.metricType)?.label??selected.metricType}</Text><Text style={[styles.detailValue,{color:palette.textPrimary}]}>{displayValue(selected).value} {displayValue(selected).unit}</Text><View style={styles.detailRow}><Text style={[styles.body,{color:palette.textMuted}]}>Source</Text><Text style={[styles.valueText,{color:palette.textPrimary}]}>{providerName(selected.sourceProvider.toUpperCase())}</Text></View><View style={styles.detailRow}><Text style={[styles.body,{color:palette.textMuted}]}>Last updated</Text><Text style={[styles.valueText,{color:palette.textPrimary}]}>{formatWhen(selected.measuredAtISO)}</Text></View><View style={styles.detailRow}><Text style={[styles.body,{color:palette.textMuted}]}>Sync status</Text><Text style={[styles.valueText,{color:palette.success}]}>Successful</Text></View><PrimaryButton title="Done" onPress={()=>setSelected(null)}/></>:null}</Pressable></Pressable></Modal>
  </>;
};

const styles=StyleSheet.create({content:{paddingBottom:spacing.xxl},loading:{flex:1,alignItems:'center',justifyContent:'center',gap:spacing.sm},connectionCard:{gap:spacing.md,marginTop:spacing.md},connectionHeader:{flexDirection:'row',alignItems:'center',gap:spacing.sm},sourceIcon:{width:48,height:48,borderRadius:radius.md,alignItems:'center',justifyContent:'center'},grow:{flex:1},cardTitle:{...typography.cardTitle},body:{...typography.body},caption:{...typography.caption},chip:{paddingHorizontal:spacing.sm,paddingVertical:spacing.xs,borderRadius:radius.pill},chipText:{...typography.badge},summaryRow:{flexDirection:'row',justifyContent:'space-between'},valueText:{...typography.bodyStrong},message:{...typography.subtext,textAlign:'center'},sectionTitle:{...typography.sectionTitle,marginTop:spacing.xl,marginBottom:spacing.sm},metricCard:{flexDirection:'row',alignItems:'center',gap:spacing.sm,marginBottom:spacing.sm},metricIcon:{width:40,height:40,borderRadius:radius.md,alignItems:'center',justifyContent:'center'},metricValue:{...typography.metricSmall,marginVertical:2},metricUnit:{...typography.subtext},activityRow:{flexDirection:'row',alignItems:'center',paddingVertical:spacing.sm},overlay:{flex:1,justifyContent:'flex-end'},sheet:{borderTopLeftRadius:radius.lg,borderTopRightRadius:radius.lg,padding:spacing.xl,gap:spacing.md},sheetHandle:{width:44,height:4,borderRadius:2,backgroundColor:'#94A3B8',alignSelf:'center'},detailValue:{...typography.metric},detailRow:{flexDirection:'row',justifyContent:'space-between',gap:spacing.md}});
