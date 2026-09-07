import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import XLSX from 'xlsx';

const ROOT = new URL('../src/modules/nutrition/food-curation/data/', import.meta.url);
const PROCESSOR = 'FOOD_REFERENCE_RECONCILIATION_V17_36';
const GENERATED_AT = '2026-09-07T00:00:00.000Z';
const sha = value => createHash('sha256').update(value).digest('hex');
const closure = JSON.parse(readFileSync(new URL('food_catalogue_closure_v17_34.json', ROOT), 'utf8'));
const india = JSON.parse(readFileSync(new URL('food_india_resolution_v17_35.json', ROOT), 'utf8'));
const workbook = XLSX.readFile(new URL('../src/modules/nutrition/catalogue/data/PAN_India_Food_Master_Per_100g.xlsx', import.meta.url));
const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Food Master'], { defval: null });
const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const aliases = value => normalize(value).split(/[,;/|]+/).map(normalize).filter(Boolean);
const previouslyProcessed = new Set(closure.records.map(item => item.referenceItemId));
const cohort = rows.filter(row => !previouslyProcessed.has(`BATCH0_${row.ID}`));
if (rows.length !== 335 || closure.records.length !== 207 || cohort.length !== 128 || cohort[0].ID !== 183 || cohort.at(-1).ID !== 335) throw new Error('V17_36_FROZEN_COHORT_MISMATCH');

const runtime = {
  272:['CF_2da71afd-ac94-4932-8612-507de402c64f','Peanuts','USDA_FDC:2515376'],
  298:['CF_633440dd-6006-4819-b3cb-6b0368dadb84','Coconut oil','USDA_FDC:330458'],
  299:['CF_82651692-4d4b-495c-8039-aea3a16f4744','Olive oil','USDA_FDC:171413'],
  300:['CF_29a4f428-649e-4c67-a709-804069dff411','Canola oil','USDA_FDC:172336'],
};
const aliasMap = {
  282:['CF_0494984a-3f93-4805-9913-da562b736962','Sesame seed','USDA_FDC:170150'],
  311:['CF_81006a8a-4b17-480d-88ae-0a821af43334','Cumin seed','USDA_FDC:170923'],
  312:['CF_cea559b9-4def-4aa8-b2e1-89c8832d1375','Coriander seed','USDA_FDC:170922'],
  333:['CF_37d271f9-fac6-4e7f-9ff6-18001997a6a6','Cooked chicken breast','USDA_FDC:331960'],
};
const requiredAnalytes = ['ENERGY_KCAL','PROTEIN_G','CARBOHYDRATE_G','FAT_G','FIBRE_G','MOISTURE_G','ASH_G'];

const decisions = cohort.map(row => {
  const id = Number(row.ID); const referenceItemId = `BATCH0_${id}`; const name = normalize(row['Food Name']);
  let finalStatus, operationalUse, evidenceStatus, target = null;
  if (runtime[id]) { finalStatus='EXISTING_GOVERNED_RUNTIME_IDENTITY'; operationalUse = [298,299,300].includes(id)?'INGREDIENT_ONLY':'COMPONENT_ADDABLE'; evidenceStatus='EXISTING_GOVERNED_EVIDENCE'; target=runtime[id]; }
  else if (aliasMap[id]) { finalStatus='ALIAS_EXISTING'; operationalUse=id===333?'COMPONENT_ADDABLE':'SECONDARY_ONLY'; evidenceStatus='EXISTING_GOVERNED_EVIDENCE'; target=aliasMap[id]; }
  else if ((id >= 183 && id <= 197) || id >= 323) { finalStatus='RECIPE_OR_PREPARATION_IDENTITY'; operationalUse='PREPARATION_REQUIRED'; evidenceStatus='PREPARATION_DOMAIN_EVIDENCE_REQUIRED'; }
  else if (id >= 273 && id <= 322) { finalStatus='SECONDARY_ONLY'; operationalUse='SECONDARY_ONLY'; evidenceStatus='REFERENCE_IDENTITY_RETAINED_NUTRITION_NOT_ACTIVATED'; }
  else { finalStatus='INGREDIENT_ONLY'; operationalUse='INGREDIENT_ONLY'; evidenceStatus='REFERENCE_IDENTITY_RETAINED_NUTRITION_NOT_ACTIVATED'; }
  const sourceChecks = ['ICMR_NIN_IFCT_RIGHTS_GATE','INDIAN_GOVERNMENT_OPEN_DATA','FSSAI_IDENTITY','ICAR_PUBLICATIONS','INDIAN_SCIENTIFIC_LITERATURE','NABL_INDIA','INDIA_MARKET_PRODUCT','EXISTING_FITEATSY','USDA_APPROVED_GENERIC'].map(source=>({source,result:target&&source==='EXISTING_FITEATSY'?'EXACT_GOVERNED_MATCH':finalStatus==='INDIA_LAB_VALIDATION_REQUIRED'?'NO_COMPLETE_REUSABLE_EXACT_MATCH':'NOT_REQUIRED_FOR_NON_ACTIVATED_REFERENCE'}));
  return {
    decisionId:`V1736_${referenceItemId}`, referenceItemId, referenceCanonicalName:name, aliases:aliases(row['Common / Indian Names']),
    botanicalIdentity:null, category:normalize(row.Category), referenceState:normalize(row['Reference State']).toUpperCase().replaceAll(' ','_'), ediblePortion:'AS_CATALOGUED_EDIBLE_PORTION',
    finalStatus, governedFoodId:target?.[0]??null, runtimeFoodId:target?.[0]??null, runtimeDisplayName:target?.[1]??null,
    aliasTarget:finalStatus==='ALIAS_EXISTING'?target[0]:null, duplicateTarget:null, parentTarget:null,
    recipePreparationClassification:finalStatus==='RECIPE_OR_PREPARATION_IDENTITY'?'SINGLE_FOOD_COOKED_PREPARATION':null,
    sourceMappingId:target?.[2]??null, evidenceStatus, operationalUse, generatorEligible:target?![298,299,300,282,311,312].includes(id):false,
    clientConsumable:target?![298,299,300,282,311,312].includes(id):false, directAddable:false, sourceChecks,
    exactBlockerClass:finalStatus==='INDIA_LAB_VALIDATION_REQUIRED'?'COMPLETE_EXACT_INDIA_NUTRITION_AND_GOVERNED_SERVING_MISSING':null,
    exactMissingEvidence:finalStatus==='INDIA_LAB_VALIDATION_REQUIRED'?'Rights-cleared complete per-100g edible-portion vector and governed serving for the exact India-market identity':null,
    requiredAnalytes:finalStatus==='INDIA_LAB_VALIDATION_REQUIRED'?requiredAnalytes:[], samplePreparation:finalStatus==='INDIA_LAB_VALIDATION_REQUIRED'?'Representative India-market edible portion; exact product/state identity signed off before homogenisation':null,
    nablTestRequirement:finalStatus==='INDIA_LAB_VALIDATION_REQUIRED'?'NABL ISO/IEC 17025 food proximate analysis':null,
    expectedEvidenceArtifact:finalStatus==='INDIA_LAB_VALIDATION_REQUIRED'?'SIGNED_NABL_SCOPE_REPORT_WITH_SAMPLE_CHAIN_OF_CUSTODY_AND_ANALYTE_METHODS':null,
    processorVersion:PROCESSOR,
  };
});
const counts = decisions.reduce((out,item)=>(out[item.finalStatus]=(out[item.finalStatus]??0)+1,out),{});
for(const status of ['EXISTING_GOVERNED_RUNTIME_IDENTITY','ALIAS_EXISTING','DUPLICATE_REFERENCE','GOVERNED_PARENT_MAPPING','NEW_MAPPING','RECIPE_OR_PREPARATION_IDENTITY','SECONDARY_ONLY','INGREDIENT_ONLY','INDIA_LAB_VALIDATION_REQUIRED']) counts[status]??=0;
if (Object.values(counts).reduce((a,b)=>a+b,0)!==128) throw new Error('V17_36_ACCOUNTING_MISMATCH');

const artifact = { schemaVersion:'FITEATSY_FOOD_REFERENCE_RECONCILIATION_V17_36', processorVersion:PROCESSOR, generatedAt:GENERATED_AT, startingCohortCount:128, decisionCounts:counts, finalUnprocessedCount:0, decisions };
artifact.artifactSha256=sha(`${JSON.stringify(artifact,null,2)}\n`);

const priorById = new Map(closure.records.map(x=>[x.referenceItemId,x]));
const indiaById = new Map(india.decisions.map(x=>[x.referenceItemId,x]));
const currentById = new Map(decisions.map(x=>[x.referenceItemId,x]));
const reportRows = rows.map(row=>{
  const referenceItemId=`BATCH0_${row.ID}`; const current=currentById.get(referenceItemId); const prior=priorById.get(referenceItemId); const lab=indiaById.get(referenceItemId);
  if(current)return {referenceItemId,canonicalName:current.referenceCanonicalName,finalReferenceStatus:current.finalStatus,evidenceStatus:current.evidenceStatus,runtimeFoodId:current.runtimeFoodId,runtimeDisplayName:current.runtimeDisplayName,mappingType:current.finalStatus,aliasTarget:current.aliasTarget,duplicateTarget:null,parentTarget:null,sourceMappingId:current.sourceMappingId,generatorEligible:current.generatorEligible,clientConsumable:current.clientConsumable,operationalUse:current.operationalUse,notes:'v17.36 frozen cohort reconciliation'};
  const mapped=!!prior?.governedFoodId; return {referenceItemId,canonicalName:normalize(row['Food Name']),finalReferenceStatus:lab?'INDIA_LAB_VALIDATION_REQUIRED':prior?.terminalState??'VERIFIED',evidenceStatus:lab?'INDIA_LAB_VALIDATION_REQUIRED':'NUTRITION_VERIFIED',runtimeFoodId:prior?.governedFoodId??null,runtimeDisplayName:null,mappingType:prior?.terminalState??'VERIFIED',aliasTarget:prior?.terminalState==='ALIAS_GOVERNED'?prior.governedFoodId:null,duplicateTarget:null,parentTarget:null,sourceMappingId:prior?.sourceMappingId??null,generatorEligible:mapped,clientConsumable:mapped,operationalUse:mapped?'GOVERNED_RUNTIME':'EVIDENCE_REGISTER_ONLY',notes:'v17.31-v17.35 immutable history'};
});
if(reportRows.length!==335||new Set(reportRows.map(x=>x.referenceItemId)).size!==335)throw new Error('V17_36_FULL_REPORT_MISMATCH');
const report={schemaVersion:'FITEATSY_FULL_335_REFERENCE_RECONCILIATION_V17_36',processorVersion:PROCESSOR,generatedAt:GENERATED_AT,referenceCount:335,rows:reportRows}; report.artifactSha256=sha(`${JSON.stringify(report,null,2)}\n`);
writeFileSync(new URL('food_reference_reconciliation_v17_36.json',ROOT),`${JSON.stringify(artifact,null,2)}\n`);
writeFileSync(new URL('food_reference_catalogue_335_v17_36.json',ROOT),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({cohort:128,counts,fullReport:335,artifactSha256:artifact.artifactSha256}));
