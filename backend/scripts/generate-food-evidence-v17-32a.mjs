import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'src/modules/nutrition/food-curation/data');
const beforePath = path.join(data, 'food_unblock_v17_31_before.json');
const decisionsPath = path.join(data, 'food_unblock_v17_31_decisions.json');
const cataloguePath = path.join(root, 'src/modules/nutrition/catalogue/data/fiteatsy-nutrition-catalogue-v1.1.json');
const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8')).decisions;
const catalogue = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));
const normalize = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const aliases = (r) => [...new Set([r.canonicalName, ...(r.aliases ?? [])])];
const categoryFor = (r) => {
  const c = normalize(r.category); const s = normalize(r.subcategory);
  if (/prepared|dish|recipe/.test(c)) return 'INDIAN_PREPARED_FOOD';
  if (/dairy/.test(c)) return 'DAIRY';
  if (/protein/.test(c)) return 'PROTEIN';
  if (/fruit/.test(c)) return 'GLOBAL_GENERIC_COMMODITY';
  if (/grain|millet/.test(c)) return /flour|dry|raw/.test(normalize(r.state)) ? 'RAW_INGREDIENT' : 'GLOBAL_GENERIC_COMMODITY';
  if (/pulse|legume/.test(c)) return 'RAW_INGREDIENT';
  if (/vegetable/.test(c)) return s.includes('leaf') ? 'INDIA_SPECIFIC_COMMODITY' : 'GLOBAL_GENERIC_COMMODITY';
  return 'OTHER';
};
const requiresIndia = (r) => ['INDIA_SPECIFIC_COMMODITY','INDIAN_PREPARED_FOOD'].includes(categoryFor(r));
const sourceState = (food) => {
  const n = normalize(food.canonicalName); const d = normalize(food.displayName);
  if (/cooked|boiled|steamed|fried|baked|canned|sprout/.test(`${n} ${d}`)) return 'COOKED_OR_PROCESSED';
  if (/roasted|ground|powder|flour|dry/.test(`${n} ${d}`)) return 'PROCESSED_OR_DRY';
  return 'RAW_OR_UNSPECIFIED';
};
const stateExact = (r, food) => {
  const ref = normalize(r.state); const src = sourceState(food);
  if (/dry|flour|powder/.test(ref)) return src === 'PROCESSED_OR_DRY';
  if (/cooked|boiled|steamed|ready to eat|ready to drink/.test(ref)) return src === 'COOKED_OR_PROCESSED';
  if (/raw|liquid/.test(ref)) return src === 'RAW_OR_UNSPECIFIED';
  return false;
};
const exactCandidates = (r) => {
  const names = new Set(aliases(r).map(normalize));
  return catalogue.foods.filter((food) => names.has(normalize(food.canonicalName)) || names.has(normalize(food.displayName))).filter((food) => stateExact(r, food));
};
const requiredNutrients = ['kcal','protein','carbohydrate','fat'];
const evidenceFor = (r) => {
  const candidates = exactCandidates(r);
  const sourceCandidates = candidates.map((food) => ({ sourceOrganisation:'USDA Agricultural Research Service', dataset:'FoodData Central', sourceRecordId:String(food.fdcId), sourceReference:`https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients`, sourceVersion:food.publicationDate, rightsStatus:'APPROVED_REUSE', commercialReuse:'YES', redistribution:'YES', repositoryApproved:'YES', identityMatch:'EXACT', stateMatch:'EXACT', nutritionCompleteness:'COMPLETE_REQUIRED_VECTOR', servingEvidence:'AUTHORITATIVE_WEIGHT_ONLY', servingLabel:food.portions?.[0]?.label ?? '100 g', grams:food.portions?.[0]?.grams ?? 100 }));
  const selectedSource = sourceCandidates[0] ?? null;
  const className = categoryFor(r);
  let evidenceDecision = 'EXTERNAL_SOURCE_REQUIRED';
  if (className === 'INDIAN_PREPARED_FOOD') evidenceDecision = 'PREPARED_PROVENANCE_REQUIRED';
  else if (selectedSource) evidenceDecision = 'SOURCE_FOUND_SERVING_INCOMPLETE';
  const missing = selectedSource && selectedSource.servingEvidence !== 'AUTHORITATIVE_HOUSEHOLD_MEASURE' ? ['HOUSEHOLD_SERVING_EVIDENCE'] : [];
  return { evidenceClass:className, requiresIndiaSpecificEvidence:requiresIndia(r), sourceCandidates, selectedSource, sourceOrganisation:selectedSource?.sourceOrganisation ?? null, dataset:selectedSource?.dataset ?? null, sourceRecord:selectedSource?.sourceRecordId ?? null, sourceVersion:selectedSource?.sourceVersion ?? null, rightsStatus:selectedSource?.rightsStatus ?? 'UNKNOWN', identityMatch:selectedSource?.identityMatch ?? 'AMBIGUOUS', nutritionCompleteness:selectedSource?.nutritionCompleteness ?? 'NO_USABLE_VECTOR', servingEvidence:selectedSource?.servingEvidence ?? 'NO_SERVING_EVIDENCE', requiredNutrientsPresent:selectedSource ? requiredNutrients : [], missingNutrients: selectedSource ? missing : requiredNutrients, evidenceDecision, rationale:selectedSource ? 'Exact approved generic source identity and state match found in the repository catalogue; activation remains blocked until a governed human serving profile is evidenced.' : className === 'INDIAN_PREPARED_FOOD' ? 'Prepared Indian food requires a separately governed recipe, yield, serving, and provenance release.' : 'No exact repository-approved source mapping with matching identity and state was found in the accepted assets.', reviewerNotes:'Evidence acquisition only; no activation or runtime eligibility change.' };
};
const records = before.records.filter((r) => decisions.find((d) => d.referenceItemId === r.referenceItemId)?.outcome === 'EXTERNAL_SOURCE_REQUIRED');
if (before.blockedCount !== 186 || records.length !== 185) throw new Error(`V17_32A_COHORT_MISMATCH:${records.length}`);
const snapshot = { schemaVersion:'FITEATSY_FOOD_EVIDENCE_V17_32A_BEFORE', baselineSha:'a22978417d81346a43152c9d4be49e24a091497f', sourceBeforeArtifact:'food_unblock_v17_31_before.json', sourceBeforeArtifactSha256:crypto.createHash('sha256').update(fs.readFileSync(beforePath)).digest('hex'), blockedCount:185, generatedAt:'2026-09-05T00:00:00.000Z', records:records.map(r=>({referenceItemId:r.referenceItemId,sourceRecordId:r.sourceRecordId,canonicalName:r.canonicalName,aliases:r.aliases,indianCommonNames:r.aliases,category:r.category,subcategory:r.subcategory,exactState:r.state,preparationState:r.state,operationalUse:r.existingOperationalUse,targetRoles:decisions.find(d=>d.referenceItemId===r.referenceItemId)?.targetRoles??[],currentEvidenceStatus:r.existingEvidenceStatus,currentDecisionOutcome:r.existingDecisionOutcome,currentBlocker:r.currentBlocker})) };
const evidenceRecords = snapshot.records.map((r, i) => ({decisionId:`P0V1732A_${r.sourceRecordId.padStart(3,'0')}`, ...r, ...evidenceFor({ ...r, state:r.exactState }) , processorVersion:'FOOD_EVIDENCE_V17_32A'}));
const counts = Object.fromEntries([...new Set(evidenceRecords.map(r=>r.evidenceDecision))].sort().map(k=>[k,evidenceRecords.filter(r=>r.evidenceDecision===k).length]));
const categoryCounts = Object.fromEntries([...new Set(evidenceRecords.map(r=>r.evidenceClass))].sort().map(k=>[k,evidenceRecords.filter(r=>r.evidenceClass===k).length]));
const artifact = {schemaVersion:'FITEATSY_FOOD_EVIDENCE_V17_32A_DECISIONS',baselineSha:'a22978417d81346a43152c9d4be49e24a091497f',processorVersion:'FOOD_EVIDENCE_V17_32A',decisionCount:evidenceRecords.length,decisionCounts:counts,categoryCounts,generatedAt:'2026-09-05T00:00:00.000Z',decisions:evidenceRecords};
artifact.artifactSha256 = crypto.createHash('sha256').update(JSON.stringify({...artifact,artifactSha256:undefined})).digest('hex');
const queue = evidenceRecords.filter(r=>/^READY_/.test(r.evidenceDecision)).sort((a,b)=>a.evidenceDecision.localeCompare(b.evidenceDecision)||a.category.localeCompare(b.category)||a.canonicalName.localeCompare(b.canonicalName)).map((r,i)=>({priority:i+1,referenceItemId:r.referenceItemId,canonicalName:r.canonicalName,selectedSource:r.selectedSource,exactState:r.exactState,intendedOperationalUse:r.operationalUse,intendedRoles:r.targetRoles,servingEvidence:r.servingEvidence,activationReadiness:r.evidenceDecision}));
fs.writeFileSync(path.join(data,'food_evidence_v17_32a_before.json'),JSON.stringify(snapshot,null,2)+'\n');
fs.writeFileSync(path.join(data,'food_evidence_v17_32a_decisions.json'),JSON.stringify(artifact,null,2)+'\n');
fs.writeFileSync(path.join(data,'food_activation_queue_v17_32b.json'),JSON.stringify({schemaVersion:'FITEATSY_FOOD_ACTIVATION_QUEUE_V17_32B',sourceArtifactSha256:artifact.artifactSha256,queueCount:queue.length,queue},null,2)+'\n');
console.log(JSON.stringify({evaluated:evidenceRecords.length,decisionCounts:counts,categoryCounts,queueCount:queue.length,artifactSha256:artifact.artifactSha256}));
