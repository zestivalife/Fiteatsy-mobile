import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { closePool, getPool } from '../src/db/pool.js';
import { migrateDatabase } from '../src/db/migrator.js';

const BATCH_ID = 'BATCH_0_PAN_INDIA_FOOD_SEED';
const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/modules/nutrition/catalogue/data/PAN_India_Food_Master_Per_100g.xlsx');
const dryRun = process.argv.includes('--dry-run');
const normalize = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ');
const code = (value: string) => value.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase();
const hash = (value: unknown) => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const stateMap: Record<string,string> = {
  raw:'RAW', uncooked:'UNCOOKED', cooked:'COOKED', boiled:'BOILED', steamed:'STEAMED', roasted:'ROASTED', baked:'BAKED',
  grilled:'GRILLED', fried:'FRIED', sauteed:'SAUTEED', 'pressure cooked':'PRESSURE_COOKED', soaked:'SOAKED', sprouted:'SPROUTED',
  fermented:'FERMENTED', dried:'DRIED', dehydrated:'DEHYDRATED', powdered:'POWDERED', flour:'FLOUR', juice:'JUICE', puree:'PUREE',
  paste:'PASTE', 'ready to eat':'READY_TO_EAT', 'prepared dish':'PREPARED_DISH'
};
const parseAliases = (value: unknown) => normalize(value).split(/[,;/|]+/).map(normalize).filter(Boolean);
const numberOrNull = (value: unknown) => value === '' || value == null ? null : Number(value);

type SourceRow = Record<string, unknown>;
type ParsedRow = {
  rowNumber:number; sourceId:string; canonicalName:string; commonNames:string[]; category:string; subcategory:string|null;
  referenceState:string; nutrition:{kcal:number|null;protein:number|null;carbohydrate:number|null;fat:number|null;fibre:number|null};
  verificationStatus:string; notes:string|null; recordHash:string;
};

const priorityFor = (category:string) => /(vegetable|grain|millet|pulse|legume|fruit|dairy|protein|fish|breakfast)/i.test(category) ? 'P0' : /(nut|seed|beverage|prepared|bread|staple|cooked basic|non-veg)/i.test(category) ? 'P1' : 'P2';
const rolesFor = (category:string) => /vegetable/i.test(category) ? ['VEGETABLE'] : /(pulse|legume)/i.test(category) ? ['PULSE','PROTEIN'] : /(grain|millet)/i.test(category) ? ['GRAIN','STARCH'] : /fruit/i.test(category) ? ['FRUIT'] : /dairy/i.test(category) ? ['DAIRY','PROTEIN'] : /(protein|fish)/i.test(category) ? ['PROTEIN'] : [];
const operationalUseFor = (category:string,state:string) => /fruit/i.test(category)&&['RAW','READY_TO_EAT'].includes(state) ? 'DIRECT_ADDABLE' : /dairy/i.test(category)&&!['RAW','UNCOOKED','POWDERED'].includes(state) ? 'DIRECT_ADDABLE' : ['COOKED','BOILED','STEAMED','ROASTED','BAKED','GRILLED','SAUTEED','PRESSURE_COOKED','SPROUTED','FERMENTED','READY_TO_EAT','PREPARED_DISH'].includes(state) ? 'COMPONENT_ADDABLE' : ['RAW','UNCOOKED','DRIED','DEHYDRATED','POWDERED','FLOUR','PASTE'].includes(state) ? 'INGREDIENT_ONLY' : 'PREPARATION_REQUIRED';

function parseWorkbook(): { rows: ParsedRow[]; invalid: Array<{rowNumber:number;reason:string}> } {
  const workbook = XLSX.readFile(SOURCE, { cellDates:false, raw:true });
  const sheet = workbook.Sheets['Food Master'];
  if (!sheet) throw new Error('FOOD_MASTER_SHEET_NOT_FOUND');
  const sourceRows = XLSX.utils.sheet_to_json<SourceRow>(sheet, { defval:null });
  const rows: ParsedRow[]=[]; const invalid:Array<{rowNumber:number;reason:string}>=[];
  sourceRows.forEach((row,index)=>{
    const rowNumber=index+2; const sourceId=normalize(row.ID); const canonicalName=normalize(row['Food Name']);
    const rawState=normalize(row['Reference State']); const referenceState=stateMap[rawState.toLowerCase()] ?? code(rawState);
    const nutrition={kcal:numberOrNull(row['Energy (kcal)']),protein:numberOrNull(row['Protein (g)']),carbohydrate:numberOrNull(row['Carbohydrate (g)']),fat:numberOrNull(row['Fat (g)']),fibre:numberOrNull(row['Fibre (g)'])};
    if(!sourceId||!canonicalName||!normalize(row.Category)||!referenceState||Object.values(nutrition).some(x=>x!==null&&(!Number.isFinite(x)||x<0))){invalid.push({rowNumber,reason:'MISSING_IDENTITY_OR_INVALID_NUTRITION'});return;}
    const base={rowNumber,sourceId,canonicalName,commonNames:parseAliases(row['Common / Indian Names']),category:normalize(row.Category),subcategory:normalize(row.Subcategory)||null,referenceState,nutrition,verificationStatus:normalize(row['Verification Status'])||'UNSPECIFIED',notes:normalize(row.Notes)||null};
    rows.push({...base,recordHash:hash(base)});
  });
  return {rows,invalid};
}

async function run(){
  await migrateDatabase();
  const {rows,invalid}=parseWorkbook();
  if(rows.length+invalid.length!==335)throw new Error(`BATCH_0_ROW_COUNT_MISMATCH:${rows.length+invalid.length}`);
  if(invalid.length)throw new Error(`BATCH_0_INVALID_ROWS:${JSON.stringify(invalid)}`);
  const sourceHash=hash(fs.readFileSync(SOURCE)); const client=await getPool().connect();
  const report={batchId:BATCH_ID,sourceRows:rows.length,insertedRows:0,unchangedRows:0,protectedRows:0,conflictRows:0,invalidRows:invalid.length,sourceHash,dryRun};
  try{
    await client.query('begin');
    for(const row of rows){
      const id=`BATCH0_${row.sourceId}`; const existing=await client.query('select id,source_record_sha256 from food_catalogue_reference_items where id=$1 or (batch_id=$2 and source_record_id=$3)',[id,BATCH_ID,row.sourceId]);
      if(existing.rows[0]){
        if(existing.rows[0].source_record_sha256===row.recordHash)report.unchangedRows++;
        else report.conflictRows++;
        continue;
      }
      const priority=priorityFor(row.category); const p0=priority==='P0';
      await client.query(`insert into food_catalogue_reference_items(id,batch_id,source_row_number,source_record_id,canonical_name,common_names,category,subcategory,reference_state,reference_nutrition_per_100g,verification_status,notes,source_record_sha256,verification_priority,processing_status,operational_use_state,target_roles,evidence_status,processing_version) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,[id,BATCH_ID,row.rowNumber,row.sourceId,row.canonicalName,JSON.stringify(row.commonNames),row.category,row.subcategory,row.referenceState,JSON.stringify(row.nutrition),row.verificationStatus,row.notes,row.recordHash,priority,p0?'TRIAGED_PENDING_EVIDENCE':'UNPROCESSED',operationalUseFor(row.category,row.referenceState),JSON.stringify(rolesFor(row.category)),'AUTHORITATIVE_SOURCE_AND_SERVING_REQUIRED',p0?'P0_OPERATIONAL_TRIAGE_V17_29R':null]);
      report.insertedRows++;
    }
    await client.query(`insert into food_catalogue_import_runs(id,batch_id,source_filename,source_sha256,dry_run,source_rows,inserted_rows,unchanged_rows,protected_rows,conflict_rows,invalid_rows,report,actor)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'SYSTEM_CATALOGUE_IMPORTER')`,[crypto.randomUUID(),BATCH_ID,path.basename(SOURCE),sourceHash,dryRun,rows.length,report.insertedRows,report.unchangedRows,report.protectedRows,report.conflictRows,report.invalidRows,JSON.stringify(report)]);
    if(report.conflictRows||report.invalidRows)throw new Error(`BATCH_0_IMPORT_REJECTED:${JSON.stringify(report)}`);
    if(dryRun)await client.query('rollback');else await client.query('commit');
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }catch(error){await client.query('rollback');throw error;}finally{client.release();await closePool();}
}
run().catch(async(error)=>{console.error(error instanceof Error?error.message:error);await closePool();process.exitCode=1;});
