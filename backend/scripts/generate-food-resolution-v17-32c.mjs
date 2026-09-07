import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const dataRoot = new URL('../src/modules/nutrition/food-curation/data/', import.meta.url);
const evidence = JSON.parse(readFileSync(new URL('food_evidence_v17_32a_decisions.json', dataRoot), 'utf8'));
const usdaDecisions = JSON.parse(readFileSync(new URL('food_usda_mapping_v17_32b1_decisions.json', dataRoot), 'utf8'));
const usdaQueue = JSON.parse(readFileSync(new URL('food_usda_activation_queue_v17_32b2.json', dataRoot), 'utf8'));

const PROCESSOR = 'FOOD_RESOLUTION_V17_32C';
const BASELINE_SHA = '1dd095d201487f5932f5eaeb0c9e8c873c483181';
const generatedAt = '2026-09-07T00:00:00.000Z';
const requiredGroups = {
  GLOBAL_GENERIC_COMMODITY: 41,
  RAW_INGREDIENT: 45,
  INDIA_SPECIFIC_COMMODITY: 28,
  DAIRY: 16,
  PROTEIN: 8,
};
const activationDecisions = new Set([
  'READY_FOR_GENERATOR_ACTIVATION',
  'READY_FOR_COMPONENT_ACTIVATION',
  'READY_FOR_DIRECT_ADD_ACTIVATION',
  'READY_FOR_INGREDIENT_ONLY',
  'READY_FOR_SECONDARY_ONLY',
  'EXISTING_GOVERNED_IDENTITY_ALIAS',
]);
const terminalDecisions = new Set([
  ...activationDecisions,
  'STATE_MISMATCH_CONFIRMED',
  'IDENTITY_AMBIGUOUS_CONFIRMED',
  'SPECIES_AMBIGUOUS',
  'RIGHTS_BLOCKED',
  'PREPARED_PROVENANCE_REQUIRED',
  'EXTERNAL_SOURCE_REQUIRED',
  'NOT_SUITABLE_FOR_ACTIVATION',
]);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());
const activatedIds = new Set(usdaQueue.records.map((item) => item.referenceItemId));
const usdaByReference = new Map(usdaDecisions.decisions.map((item) => [item.referenceItemId, item]));
const unresolved = evidence.decisions
  .filter((item) => !activatedIds.has(item.referenceItemId))
  .sort((a, b) => Number(a.sourceRecordId) - Number(b.sourceRecordId));

if (evidence.decisions.length !== 185) throw new Error(`V17_32C_SOURCE_EVIDENCE_COUNT:${evidence.decisions.length}`);
if (usdaQueue.records.length !== 47) throw new Error(`V17_32C_USDA_QUEUE_COUNT:${usdaQueue.records.length}`);
if (unresolved.length !== 138) throw new Error(`V17_32C_UNRESOLVED_COHORT_COUNT:${unresolved.length}`);
for (const [group, expected] of Object.entries(requiredGroups)) {
  const actual = unresolved.filter((item) => item.evidenceClass === group).length;
  if (actual !== expected) throw new Error(`V17_32C_GROUP_COUNT:${group}:${actual}`);
}

const priorBlockerFor = (item) => {
  if (item.evidenceClass !== 'GLOBAL_GENERIC_COMMODITY') return item.currentBlocker ?? item.evidenceDecision;
  return usdaByReference.get(item.referenceItemId)?.finalDecision ?? item.evidenceDecision;
};
const existingCandidatesFor = (item) => {
  const usda = usdaByReference.get(item.referenceItemId);
  if (!usda) return item.sourceCandidates ?? [];
  return usda.USDACandidates.map((candidate) => ({
    sourceOrganisation: 'USDA Agricultural Research Service',
    dataset: candidate.dataType,
    sourceRecordId: String(candidate.fdcId),
    description: candidate.description,
    foodCategory: candidate.foodCategory,
    publicationDate: candidate.publicationDate,
    scientificName: candidate.scientificName,
    sourceState: candidate.sourceState,
    rightsStatus: 'APPROVED_REUSE',
    sourceUrl: candidate.sourceUrl,
    identityMatch: candidate.identityMatch,
    stateMatch: candidate.stateMatch ? 'EXACT' : 'MISMATCH',
    nutrientCompleteness: candidate.requiredNutrientsPresent ? 'COMPLETE_REQUIRED_VECTOR' : 'NUTRIENT_VECTOR_INCOMPLETE',
    servingEvidence: candidate.portionEvidence,
  }));
};
const beforeRecords = unresolved.map((item) => ({
  referenceItemId: item.referenceItemId,
  sourceRecordId: item.sourceRecordId,
  canonicalName: item.canonicalName,
  aliases: item.aliases ?? [],
  category: item.category,
  subcategory: item.subcategory,
  exactState: item.exactState,
  preparationState: item.preparationState,
  evidenceClass: item.evidenceClass,
  priorDecision: item.evidenceDecision,
  priorBlocker: priorBlockerFor(item),
  operationalUse: item.operationalUse,
  targetRoles: item.targetRoles ?? [],
  existingSourceCandidates: existingCandidatesFor(item),
  existingGovernedIdentity: null,
}));

const finalDecisionFor = (item) => {
  const usda = usdaByReference.get(item.referenceItemId);
  if (item.evidenceClass === 'GLOBAL_GENERIC_COMMODITY') {
    if (usda?.finalDecision === 'USDA_FOUND_STATE_MISMATCH') return 'STATE_MISMATCH_CONFIRMED';
    if (usda?.finalDecision === 'USDA_FOUND_IDENTITY_AMBIGUOUS') return 'IDENTITY_AMBIGUOUS_CONFIRMED';
    if (usda?.finalDecision === 'USDA_NO_EXACT_RECORD') return 'EXTERNAL_SOURCE_REQUIRED';
    return 'EXTERNAL_SOURCE_REQUIRED';
  }
  if (item.evidenceClass === 'PROTEIN' && /fish/i.test(`${item.category} ${item.subcategory} ${item.canonicalName}`)) return 'SPECIES_AMBIGUOUS';
  return 'EXTERNAL_SOURCE_REQUIRED';
};
const rationaleFor = (item, finalDecision) => {
  if (finalDecision === 'STATE_MISMATCH_CONFIRMED') return 'Frozen v17.32B-1 USDA candidates did not match the required raw/dried/ready state; no state cross-mapping is permitted.';
  if (finalDecision === 'IDENTITY_AMBIGUOUS_CONFIRMED') return 'Frozen v17.32B-1 candidates did not establish exact commodity identity and edible portion; common-name or ambiguous USDA matches remain blocked.';
  if (finalDecision === 'SPECIES_AMBIGUOUS') return 'Protein identity is not specific enough to bind species/cut/state to a governed nutrition source.';
  if (item.evidenceClass === 'INDIA_SPECIFIC_COMMODITY') return 'No repository-approved India-specific reusable source is present for this identity and state.';
  if (item.evidenceClass === 'RAW_INGREDIENT') return 'No accepted exact approved source with complete macro vector and governed serving evidence is present for this raw ingredient.';
  if (item.evidenceClass === 'DAIRY') return 'No exact dairy identity, fat class, fermentation state, and approved reusable source is present in accepted artifacts.';
  if (item.evidenceClass === 'GLOBAL_GENERIC_COMMODITY') return 'No exact USDA record passed the v17.32B-1 identity/state gate; external approved evidence is required.';
  return 'No activation-ready approved source evidence is present in accepted artifacts.';
};
const candidatesForDecision = (item) => {
  const usda = usdaByReference.get(item.referenceItemId);
  if (usda) return existingCandidatesFor(item);
  return (item.sourceCandidates ?? []).map((candidate) => ({
    ...candidate,
    rightsStatus: candidate.rightsStatus === 'APPROVED_REUSE' ? 'APPROVED_REUSE' : 'RIGHTS_UNKNOWN',
  }));
};
const decisionRecords = unresolved.map((item) => {
  const finalDecision = finalDecisionFor(item);
  const usda = usdaByReference.get(item.referenceItemId);
  const candidateSources = candidatesForDecision(item);
  const selectedSource = activationDecisions.has(finalDecision) ? candidateSources[0] ?? null : null;
  const nutrientCompleteness = selectedSource?.nutrientCompleteness ?? item.nutritionCompleteness ?? 'NO_USABLE_VECTOR';
  const stateMatch = finalDecision === 'STATE_MISMATCH_CONFIRMED' ? 'MISMATCH' : selectedSource?.stateMatch ?? (usda?.stateMatch ? 'EXACT' : 'UNVERIFIED');
  const identityMatch = finalDecision === 'IDENTITY_AMBIGUOUS_CONFIRMED' ? 'AMBIGUOUS' : selectedSource?.identityMatch ?? usda?.identityMatch ?? item.identityMatch ?? 'AMBIGUOUS';
  const rightsStatus = selectedSource?.rightsStatus ?? 'RIGHTS_UNKNOWN';
  return {
    decisionId: `P0V1732C_${String(item.sourceRecordId).padStart(3, '0')}`,
    referenceItemId: item.referenceItemId,
    canonicalName: item.canonicalName,
    aliases: item.aliases ?? [],
    category: item.category,
    subcategory: item.subcategory,
    exactState: item.exactState,
    preparationState: item.preparationState,
    evidenceClass: item.evidenceClass,
    candidateSources,
    selectedSource,
    rightsStatus,
    identityMatch,
    stateMatch,
    nutrientCompleteness,
    servingEvidence: selectedSource?.servingEvidence ?? item.servingEvidence ?? 'NO_SERVING_EVIDENCE',
    intendedRoles: item.targetRoles ?? [],
    intendedOperationalUse: item.operationalUse,
    finalDecision,
    rationale: rationaleFor(item, finalDecision),
    processorVersion: PROCESSOR,
  };
});

for (const item of decisionRecords) if (!terminalDecisions.has(item.finalDecision)) throw new Error(`V17_32C_BAD_FINAL_DECISION:${item.referenceItemId}:${item.finalDecision}`);

const queueRecords = decisionRecords
  .filter((item) => activationDecisions.has(item.finalDecision))
  .map((item) => ({
    referenceItemId: item.referenceItemId,
    canonicalName: item.canonicalName,
    selectedSource: item.selectedSource,
    exactState: item.exactState,
    intendedOperationalUse: item.intendedOperationalUse,
    intendedRoles: item.intendedRoles,
    activationReadiness: item.finalDecision,
  }));

const countBy = (records, key) => Object.fromEntries([...new Set(records.map((item) => item[key]))].sort().map((value) => [value, records.filter((item) => item[key] === value).length]));
const before = {
  schemaVersion: 'FITEATSY_FOOD_RESOLUTION_V17_32C_BEFORE',
  baselineSha: BASELINE_SHA,
  processorVersion: PROCESSOR,
  sourceArtifacts: ['food_evidence_v17_32a_decisions.json', 'food_usda_mapping_v17_32b1_decisions.json', 'food_usda_activation_queue_v17_32b2.json'],
  cohortCount: beforeRecords.length,
  groupCounts: countBy(beforeRecords, 'evidenceClass'),
  generatedAt,
  records: beforeRecords,
};
const decisions = {
  schemaVersion: 'FITEATSY_FOOD_RESOLUTION_V17_32C_DECISIONS',
  baselineSha: BASELINE_SHA,
  processorVersion: PROCESSOR,
  decisionCount: decisionRecords.length,
  decisionCounts: countBy(decisionRecords, 'finalDecision'),
  groupCounts: countBy(decisionRecords, 'evidenceClass'),
  generatedAt,
  decisions: decisionRecords,
};
const decisionBody = `${JSON.stringify(decisions, null, 2)}\n`;
decisions.artifactSha256 = sha256(decisionBody);
const finalDecisionBody = `${JSON.stringify(decisions, null, 2)}\n`;
decisions.artifactSha256 = sha256(finalDecisionBody.replace(/\n  \"artifactSha256\": \"[a-f0-9]+\",/, ''));

const queue = {
  schemaVersion: 'FITEATSY_FOOD_ACTIVATION_QUEUE_V17_32C2',
  sourceProcessorVersion: PROCESSOR,
  sourceArtifact: 'food_resolution_v17_32c_decisions.json',
  sourceArtifactSha256: decisions.artifactSha256,
  queueCount: queueRecords.length,
  generatedAt,
  records: queueRecords,
};

writeFileSync(new URL('food_resolution_v17_32c_before.json', dataRoot), `${JSON.stringify(before, null, 2)}\n`);
writeFileSync(new URL('food_resolution_v17_32c_decisions.json', dataRoot), `${JSON.stringify(decisions, null, 2)}\n`);
writeFileSync(new URL('food_activation_queue_v17_32c2.json', dataRoot), `${JSON.stringify(queue, null, 2)}\n`);

console.log(JSON.stringify({
  evaluated: decisionRecords.length,
  decisionCounts: decisions.decisionCounts,
  groupCounts: decisions.groupCounts,
  queueCount: queueRecords.length,
  artifactSha256: decisions.artifactSha256,
  queueSha256: sha256(`${JSON.stringify(queue, null, 2)}\n`),
}, null, 2));
