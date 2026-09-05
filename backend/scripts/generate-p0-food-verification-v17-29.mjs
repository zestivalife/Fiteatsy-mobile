import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workbookPath = path.join(backendRoot, 'src/modules/nutrition/catalogue/data/PAN_India_Food_Master_Per_100g.xlsx');
const outputPath = path.join(backendRoot, 'src/modules/nutrition/food-curation/data/p0_food_verification_v17_29.json');
const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const aliasesFor = (value) => normalize(value).split(/[,;/|]+/).map(normalize).filter(Boolean);
const sourceIdFor = (value) => `BATCH0_${normalize(value)}`;
const approvedGenericMappings = new Map([
  ['1', { fdcId: 1999632, outcome: 'ACTIVATED_COMPONENT_ONLY' }],
  ['36', { fdcId: 168448, outcome: 'ACTIVATED_COMPONENT_ONLY' }],
  ['42', { fdcId: 169225, outcome: 'ACTIVATED_GENERATOR' }],
  ['50', { fdcId: 169260, outcome: 'ACTIVATED_COMPONENT_ONLY' }],
  ['60', { fdcId: 2346401, outcome: 'ACTIVATED_COMPONENT_ONLY' }],
  ['61', { fdcId: 2346404, outcome: 'ACTIVATED_COMPONENT_ONLY' }],
  ['62', { fdcId: 2258586, outcome: 'ACTIVATED_COMPONENT_ONLY' }],
  ['75', { fdcId: 169230, outcome: 'SOURCE_MAPPED_NOT_GENERATOR' }],
  ['76', { fdcId: 169231, outcome: 'SOURCE_MAPPED_NOT_GENERATOR' }],
  ['79', { fdcId: 2685573, outcome: 'ACTIVATED_GENERATOR' }],
  ['82', { fdcId: 747447, outcome: 'ACTIVATED_GENERATOR' }],
  ['102', { fdcId: 1750339, outcome: 'ACTIVATED_GENERATOR' }],
  ['103', { fdcId: 1105314, outcome: 'ACTIVATED_GENERATOR' }],
  ['104', { fdcId: 2710833, outcome: 'ACTIVATED_GENERATOR' }],
  ['105', { fdcId: 746771, outcome: 'ACTIVATED_GENERATOR' }],
  ['107', { fdcId: 169926, outcome: 'ACTIVATED_GENERATOR' }],
  ['112', { fdcId: 2346398, outcome: 'ACTIVATED_GENERATOR' }],
  ['136', { fdcId: 2512380, outcome: 'ACTIVATED_COMPONENT_ONLY' }],
  ['144', { fdcId: 790085, outcome: 'ACTIVATED_COMPONENT_ONLY' }],
  ['159', { fdcId: 169705, outcome: 'ACTIVATED_COMPONENT_ONLY' }],
  ['218', { fdcId: 172448, outcome: 'ACTIVATED_GENERATOR' }],
]);
const p0 = (category) => /(vegetable|grain|millet|pulse|legume|fruit|dairy|protein|fish|breakfast)/i.test(category);
const roleFor = (category) => /vegetable/i.test(category) ? ['VEGETABLE'] : /(pulse|legume)/i.test(category) ? ['PULSE','PROTEIN'] : /(grain|millet)/i.test(category) ? ['GRAIN','STARCH'] : /fruit/i.test(category) ? ['FRUIT'] : /dairy/i.test(category) ? ['DAIRY','PROTEIN'] : /(protein|fish)/i.test(category) ? ['PROTEIN'] : [];
const operationalUseFor = (category, state) => /fruit/i.test(category) && ['RAW','READY_TO_EAT'].includes(state) ? 'DIRECT_ADDABLE' : /dairy/i.test(category) && !['RAW','UNCOOKED','POWDERED'].includes(state) ? 'DIRECT_ADDABLE' : ['COOKED','BOILED','STEAMED','ROASTED','BAKED','GRILLED','SAUTEED','PRESSURE_COOKED','SPROUTED','FERMENTED','READY_TO_EAT','PREPARED_DISH'].includes(state) ? 'COMPONENT_ADDABLE' : ['RAW','UNCOOKED','DRIED','DEHYDRATED','POWDERED','FLOUR','PASTE'].includes(state) ? 'INGREDIENT_ONLY' : 'PREPARATION_REQUIRED';
const sha256 = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const workbook = XLSX.readFile(workbookPath, { cellDates: false, raw: true });
const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Food Master'], { defval: null });
const catalogue = JSON.parse(fs.readFileSync(path.join(backendRoot, 'src/modules/nutrition/catalogue/data/fiteatsy-nutrition-catalogue-v1.1.json'), 'utf8'));
const decisions = rows.filter((row) => p0(normalize(row.Category))).map((row) => {
  const category = normalize(row.Category);
  const referenceState = normalize(row['Reference State']).toUpperCase().replace(/\s+/g, '_');
  const sourceRecordId = normalize(row.ID);
  const mapping = approvedGenericMappings.get(sourceRecordId);
  const mappedFood = mapping ? catalogue.foods.find((food) => food.fdcId === mapping.fdcId) : null;
  const activated = Boolean(mapping && mappedFood);
  return { decisionId:`P0V1730A_${sourceRecordId.padStart(3,'0')}`, referenceItemId:sourceIdFor(row.ID), sourceRecordId, canonicalName:normalize(row['Food Name']), aliases:aliasesFor(row['Common / Indian Names']), category, subcategory:normalize(row.Subcategory)||null, referenceState, targetRoles:roleFor(category), operationalUse:operationalUseFor(category,referenceState), outcome:activated?mapping.outcome:'EXTERNAL_SOURCE_REQUIRED', generatorEligible:activated&&mapping.outcome==='ACTIVATED_GENERATOR', componentEligible:activated&&mapping.outcome!=='SOURCE_MAPPED_NOT_GENERATOR', sourceMapping:activated?{sourceId:'USDA_FDC', fdcId:mapping.fdcId, sourceFoodId:mappedFood.id, sourceDisplayName:mappedFood.displayName, sourceCategory:mappedFood.foodCategory, sourceVersion:mappedFood.publicationDate, mappingType:'EXACT_APPROVED_GENERIC_COMMODITY'}:null, servingProfile:activated?{servingId:`SV_P0_${sourceRecordId}_100G`, label:'100 g', grams:100, source:'USDA_FDC_PORTION_100G'}:null, mealHeadEligibility:activated&&mapping.outcome==='ACTIVATED_GENERATOR'?['EARLY_MORNING','BREAKFAST','MID_MORNING','LUNCH','EVENING_SNACK','DINNER','BEDTIME']:[], evidenceStatus:activated?'APPROVED_GENERIC_SOURCE_MAPPED':'AUTHORITATIVE_SOURCE_AND_SERVING_REQUIRED', rationale:activated?'Exact approved USDA FoodData Central generic commodity mapping; nutrition and serving profile are sourced from the repository-pinned catalogue extract.':'No exact approved authoritative source, state-matched serving profile, and governed source mapping are present; activation is fail-closed.' };
});
if (decisions.length !== 207 || new Set(decisions.map((decision) => decision.referenceItemId)).size !== 207) throw new Error('P0_DECISION_COHORT_INVALID');
const artifact = { schemaVersion:'FITEATSY_P0_FOOD_VERIFICATION_V17_30A', baselineSha:'ba05cef10738f942d715545ae8bb8d8b6291d101', sourceBatchId:'BATCH_0_PAN_INDIA_FOOD_SEED', sourceWorkbookSha256:crypto.createHash('sha256').update(fs.readFileSync(workbookPath)).digest('hex'), decisionCount:decisions.length, activationCount:decisions.filter((d)=>d.generatorEligible||d.componentEligible).length, sourceMappingCount:decisions.filter((d)=>d.sourceMapping).length, generatedAt:'2026-09-05T00:00:00.000Z', decisions };
artifact.artifactSha256 = sha256({ ...artifact, artifactSha256: undefined });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, decisionCount: artifact.decisionCount, artifactSha256: artifact.artifactSha256 })}\n`);
