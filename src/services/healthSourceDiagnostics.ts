import type { HealthObservationDraft, WearableSyncPayload } from '../types';
import { HEALTH_METRIC_REGISTRY } from './healthMetricRegistry';

export type HealthSourceDiagnosticState = 'NOT_STARTED'|'SUPPORTED'|'REQUESTABLE'|'QUERYING'|'DATA_AVAILABLE'|'NO_VISIBLE_DATA'|'PENDING'|'SUCCESS'|'PARTIAL'|'ERROR'|'TIMEOUT'|'NOT_APPLICABLE';
export type HealthSourceMetricDiagnostic = {
  sourcePlatform:'APPLE_HEALTH'|'HEALTH_CONNECT';metricKey:string;supported:boolean;
  healthSourceIdentifier:string|null;queryWindowDays:number;queryExecuted:boolean;nativeRecordCount:number;normalizedRecordCount:number;droppedRecordCount:number;
  permissionState:HealthSourceDiagnosticState;requestState:HealthSourceDiagnosticState;localQueryState:HealthSourceDiagnosticState;
  localRecordCount:number;latestLocalTimestamp:string|null;normalisationState:HealthSourceDiagnosticState;dedupState:HealthSourceDiagnosticState;
  uploadState:HealthSourceDiagnosticState;backendPersistenceState:HealthSourceDiagnosticState;dailyAggregateState:HealthSourceDiagnosticState;
  calculationState:HealthSourceDiagnosticState;trackerState:HealthSourceDiagnosticState;orbState:HealthSourceDiagnosticState;
  lastErrorClass:string|null;lastErrorMessageSafe:string|null;
};
const sourceStatus=(payload:WearableSyncPayload,key:string)=>{const aliases:Record<string,string>={sleep:'sleep',heart_rate:'heart_rate',resting_heart_rate:'heart_rate',hrv_sdnn:'hrv',hrv_rmssd:'hrv',active_energy:'calories',exercise:'workouts',workout:'workouts'};return (payload.dataQuality.connectedMetrics as Record<string,string>|undefined)?.[aliases[key]??key];};
export const buildHealthSourceDiagnostics=(sourcePlatform:HealthSourceMetricDiagnostic['sourcePlatform'],payload:WearableSyncPayload,upload:{state:'SUCCESS'|'PENDING'|'ERROR';errorClass?:string}):HealthSourceMetricDiagnostic[]=>HEALTH_METRIC_REGISTRY.map(definition=>{
  const supported=sourcePlatform==='APPLE_HEALTH'?definition.appleHealthType!=null:definition.healthConnectRecord!=null;
  const records=(payload.observations??[]).filter((item:HealthObservationDraft)=>item.metricType===definition.backendCanonicalType);
  const status=sourceStatus(payload,definition.metricKey);
  const localQueryState:HealthSourceDiagnosticState=!supported?'NOT_APPLICABLE':records.length?'DATA_AVAILABLE':status==='read_failed'||status==='unavailable'?'ERROR':'NO_VISIBLE_DATA';
  const uploaded=upload.state==='SUCCESS';
  const counts=payload.dataQuality.metricDiagnostics?.[sourcePlatform==='APPLE_HEALTH'?(definition.appleHealthType??definition.metricKey):(definition.healthConnectRecord??definition.metricKey)];
  return {sourcePlatform,metricKey:definition.metricKey,supported,
    healthSourceIdentifier:sourcePlatform==='APPLE_HEALTH'?definition.appleHealthType:definition.healthConnectRecord,
    queryWindowDays:definition.syncWindowDays,queryExecuted:supported,nativeRecordCount:counts?.nativeRecordCount??records.length,
    normalizedRecordCount:counts?.normalizedRecordCount??records.length,droppedRecordCount:counts?.droppedRecordCount??0,
    permissionState:!supported?'NOT_APPLICABLE':sourcePlatform==='APPLE_HEALTH'?'REQUESTABLE':status==='no_permission'?'PENDING':'SUPPORTED',
    requestState:!supported?'NOT_APPLICABLE':'SUCCESS',localQueryState,localRecordCount:records.length,
    latestLocalTimestamp:records.reduce<string|null>((latest,item)=>!latest||item.measuredAtISO>latest?item.measuredAtISO:latest,null),
    normalisationState:records.length?'SUCCESS':localQueryState,dedupState:records.length?'SUCCESS':localQueryState,
    uploadState:upload.state,backendPersistenceState:uploaded?'SUCCESS':upload.state,dailyAggregateState:uploaded?'PENDING':upload.state,
    calculationState:uploaded?'PENDING':upload.state,trackerState:records.length?'DATA_AVAILABLE':localQueryState,
    orbState:definition.downstreamUsage.includes('star_orb')?(uploaded?'PENDING':upload.state):'NOT_APPLICABLE',
    lastErrorClass:upload.errorClass??(localQueryState==='ERROR'?'LOCAL_QUERY_ERROR':null),
    lastErrorMessageSafe:upload.errorClass?'Health data upload is pending.':localQueryState==='ERROR'?'This metric could not be read.':null};
});
