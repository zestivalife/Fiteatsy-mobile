import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const dataRoot = new URL('../src/modules/nutrition/food-curation/data/', import.meta.url);
const BASELINE_SHA = '6e04e67899a4e187fe8e4032bc589f5a72fd88b8';
const PROCESSOR = 'FOOD_CATALOGUE_CLOSURE_V17_34';
const GENERATED_AT = '2026-09-07T00:00:00.000Z';

const sourceFiles = {
  p0: 'p0_food_verification_v17_29.json',
  v1731: 'food_unblock_v17_31_decisions.json',
  v1732Resolution: 'food_resolution_v17_32c_decisions.json',
  v1732Queue: 'food_usda_activation_queue_v17_32b2.json',
  v1733Decisions: 'food_usda_adjudication_v17_33a_decisions.json',
  v1733Queue: 'food_usda_activation_queue_v17_33a2.json',
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const loaded = Object.fromEntries(Object.entries(sourceFiles).map(([key, filename]) => {
  const bytes = readFileSync(new URL(filename, dataRoot));
  return [key, { filename, bytes, value: JSON.parse(bytes.toString('utf8')), sha256: sha256(bytes) }];
}));

const p0 = loaded.p0.value;
const v1731ByReference = new Map(loaded.v1731.value.decisions.map((item) => [item.referenceItemId, item]));
const v1732ByReference = new Map(loaded.v1732Resolution.value.decisions.map((item) => [item.referenceItemId, item]));
const v1732QueueByReference = new Map(loaded.v1732Queue.value.records.map((item) => [item.referenceItemId, item]));
const v1733ByReference = new Map(loaded.v1733Decisions.value.decisions.map((item) => [item.referenceItemId, item]));
const v1733QueueByReference = new Map(loaded.v1733Queue.value.records.map((item) => [item.referenceItemId, item]));

if (p0.decisionCount !== 207 || p0.decisions.length !== 207) throw new Error('V17_34_P0_COUNT_MISMATCH');
if (new Set(p0.decisions.map((item) => item.referenceItemId)).size !== 207) throw new Error('V17_34_P0_IDENTITY_DUPLICATE');
if (loaded.v1732Queue.value.queueCount !== 47 || loaded.v1733Queue.value.queueCount !== 15) throw new Error('V17_34_ACTIVATION_LINEAGE_MISMATCH');

const evidenceChainFor = (referenceItemId, base) => {
  const chain = [{ processorVersion: 'P0_VERIFICATION_V17_30A', outcome: base.outcome }];
  const v1731 = v1731ByReference.get(referenceItemId);
  const v1732 = v1732ByReference.get(referenceItemId);
  const v1733 = v1733ByReference.get(referenceItemId);
  if (v1731) chain.push({ processorVersion: 'FOOD_UNBLOCK_V17_31', outcome: v1731.outcome });
  if (v1732) chain.push({ processorVersion: 'FOOD_RESOLUTION_V17_32C', outcome: v1732.finalDecision });
  if (v1732QueueByReference.has(referenceItemId)) chain.push({ processorVersion: 'FOOD_USDA_ACTIVATION_V17_32B2', outcome: v1732QueueByReference.get(referenceItemId).activationType });
  if (v1733) chain.push({ processorVersion: 'FOOD_USDA_ADJUDICATION_V17_33A', outcome: v1733.finalDecision });
  if (v1733QueueByReference.has(referenceItemId)) chain.push({ processorVersion: 'FOOD_USDA_ACTIVATION_V17_33A2', outcome: v1733QueueByReference.get(referenceItemId).activationType });
  return chain;
};

const closureFor = (base) => {
  const referenceItemId = base.referenceItemId;
  const v1731 = v1731ByReference.get(referenceItemId);
  const v1732 = v1732ByReference.get(referenceItemId);
  const v1732Queue = v1732QueueByReference.get(referenceItemId);
  const v1733 = v1733ByReference.get(referenceItemId);
  const v1733Queue = v1733QueueByReference.get(referenceItemId);
  const evidenceChain = evidenceChainFor(referenceItemId, base);

  if (v1733Queue) {
    const alias = v1733Queue.activationType === 'ALIAS_EXISTING';
    return {
      terminalState: alias ? 'ALIAS_GOVERNED' : 'ACTIVATED_GOVERNED',
      terminalReason: alias ? 'EXISTING_GOVERNED_IDENTITY_ALIAS' : 'READY_FOR_USDA_ACTIVATION',
      governedFoodId: alias ? v1733Queue.existingGovernedFoodId : referenceItemId,
      sourceMappingId: `USDA_FDC:${v1733Queue.selectedFdcId}`,
      effectiveProcessorVersion: 'FOOD_USDA_ACTIVATION_V17_33A2',
      evidenceChain,
    };
  }
  if (v1733) {
    return {
      terminalState: 'BLOCKED_EVIDENCE',
      terminalReason: v1733.finalDecision,
      governedFoodId: null,
      sourceMappingId: null,
      effectiveProcessorVersion: 'FOOD_USDA_ADJUDICATION_V17_33A',
      evidenceChain,
    };
  }
  if (v1732Queue) {
    const alias = v1732Queue.activationType === 'ALIAS_EXISTING';
    return {
      terminalState: alias ? 'ALIAS_GOVERNED' : 'ACTIVATED_GOVERNED',
      terminalReason: alias ? 'EXISTING_GOVERNED_IDENTITY_ALIAS' : 'READY_FOR_NEW_USDA_MAPPING',
      governedFoodId: alias ? v1732Queue.existingGovernedFoodId : referenceItemId,
      sourceMappingId: `USDA_FDC:${v1732Queue.selectedFdcId}`,
      effectiveProcessorVersion: 'FOOD_USDA_ACTIVATION_V17_32B2',
      evidenceChain,
    };
  }
  if (v1732) {
    return {
      terminalState: 'BLOCKED_EVIDENCE',
      terminalReason: v1732.finalDecision,
      governedFoodId: null,
      sourceMappingId: null,
      effectiveProcessorVersion: 'FOOD_RESOLUTION_V17_32C',
      evidenceChain,
    };
  }
  if (v1731?.outcome === 'SOURCE_MAPPED_NOT_GENERATOR') {
    return {
      terminalState: 'SOURCE_IDENTITY_LINKED',
      terminalReason: v1731.outcome,
      governedFoodId: null,
      sourceMappingId: `USDA_FDC:${v1731.sourceMapping.fdcId}`,
      effectiveProcessorVersion: 'FOOD_UNBLOCK_V17_31',
      evidenceChain,
    };
  }
  if (base.outcome === 'ACTIVATED_GENERATOR' || base.outcome === 'ACTIVATED_COMPONENT_ONLY') {
    return {
      terminalState: 'ACTIVATED_GOVERNED',
      terminalReason: base.outcome,
      governedFoodId: referenceItemId,
      sourceMappingId: `USDA_FDC:${base.sourceMapping.fdcId}`,
      effectiveProcessorVersion: 'P0_VERIFICATION_V17_30A',
      evidenceChain,
    };
  }
  if (base.outcome === 'SOURCE_MAPPED_NOT_GENERATOR') {
    return {
      terminalState: 'SOURCE_IDENTITY_LINKED',
      terminalReason: base.outcome,
      governedFoodId: null,
      sourceMappingId: `USDA_FDC:${base.sourceMapping.fdcId}`,
      effectiveProcessorVersion: 'P0_VERIFICATION_V17_30A',
      evidenceChain,
    };
  }
  throw new Error(`V17_34_UNCLOSED_IDENTITY:${referenceItemId}`);
};

const records = p0.decisions.map((base) => ({
  closureId: `V1734_${base.referenceItemId}`,
  referenceItemId: base.referenceItemId,
  sourceRecordId: base.sourceRecordId,
  canonicalName: base.canonicalName,
  referenceState: base.referenceState,
  ...closureFor(base),
  processorVersion: PROCESSOR,
})).sort((left, right) => Number(left.sourceRecordId) - Number(right.sourceRecordId));

const terminalStateCounts = Object.fromEntries([...new Set(records.map((item) => item.terminalState))].sort().map((state) => [state, records.filter((item) => item.terminalState === state).length]));
const terminalReasonCounts = Object.fromEntries([...new Set(records.map((item) => item.terminalReason))].sort().map((reason) => [reason, records.filter((item) => item.terminalReason === reason).length]));
if (JSON.stringify(terminalStateCounts) !== JSON.stringify({ ACTIVATED_GOVERNED: 74, ALIAS_GOVERNED: 7, BLOCKED_EVIDENCE: 123, SOURCE_IDENTITY_LINKED: 3 })) throw new Error(`V17_34_TERMINAL_COUNTS:${JSON.stringify(terminalStateCounts)}`);
if (records.some((item) => !item.evidenceChain.length || !item.terminalReason || !item.effectiveProcessorVersion)) throw new Error('V17_34_INCOMPLETE_PROVENANCE');
if (records.some((item) => item.terminalState === 'BLOCKED_EVIDENCE' && (item.governedFoodId || item.sourceMappingId))) throw new Error('V17_34_BLOCKED_ACTIVATION_LEAK');

const artifact = {
  schemaVersion: 'FITEATSY_FOOD_CATALOGUE_CLOSURE_V17_34',
  baselineSha: BASELINE_SHA,
  processorVersion: PROCESSOR,
  generatedAt: GENERATED_AT,
  sourceArtifacts: Object.values(loaded).map(({ filename, sha256: hash }) => ({ filename, sha256: hash })),
  referenceIdentityCount: records.length,
  terminalStateCounts,
  terminalReasonCounts,
  closureInvariant: 'EVERY_P0_REFERENCE_IDENTITY_HAS_EXACTLY_ONE_TERMINAL_STATE',
  nutritionSafetyInvariant: 'NO_INFERRED_OR_STATE_CROSS_MAPPED_NUTRITION',
  records,
};
artifact.artifactSha256 = sha256(`${JSON.stringify(artifact, null, 2)}\n`);
writeFileSync(new URL('food_catalogue_closure_v17_34.json', dataRoot), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ referenceIdentityCount: records.length, terminalStateCounts, artifactSha256: artifact.artifactSha256 }, null, 2));
