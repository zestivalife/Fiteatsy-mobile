import type {ReportDto} from './reportUploadService';

const keyFor=(scope:string)=>`@fiteatsy/report-metadata-v1:${scope}`;
const storage=()=>require('@react-native-async-storage/async-storage').default as typeof import('@react-native-async-storage/async-storage').default;

/** Account-scoped metadata only: no document bytes or extracted report payloads. */
export const readReportMetadataCache=async(scope:string):Promise<ReportDto[]>=>{
  try{const raw=await storage().getItem(keyFor(scope));if(!raw)return[];const parsed=JSON.parse(raw) as {items?:ReportDto[]};
    return Array.isArray(parsed.items)?parsed.items:[];}catch{return[];}
};
export const writeReportMetadataCache=async(scope:string,items:ReportDto[])=>{
  try{await storage().setItem(keyFor(scope),JSON.stringify({cachedAtISO:new Date().toISOString(),
    items:items.map(item=>({...item,analysis:undefined}))}));}catch{/* A cache failure must not fail live report hydration. */}
};
export const clearReportMetadataCache=async(scope:string)=>{try{await storage().removeItem(keyFor(scope));}catch{/* best effort */}};
