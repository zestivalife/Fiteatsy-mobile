import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CommonFood, ComponentRole, MealHead, Nutrients } from './common-food-engine.js';
import { canonicalHash } from './food-curation/canonical-food-foundation.js';

type ActivationType = 'NEW_USDA_MAPPING' | 'ALIAS_EXISTING';
type QueueRecord = {
  referenceItemId: string;
  selectedFdcId: number;
  canonicalName: string;
  existingGovernedFoodId: string | null;
  exactState: string;
  selectedDescription: string;
  activationType: ActivationType;
};
type DecisionRecord = {
  referenceItemId: string;
  canonicalName: string;
  aliases: string[];
  exactState: string;
  selectedFdcId: number | null;
  selectedDescription: string | null;
  identityDecision: string;
  stateMatch: boolean;
  selectedState: string | null;
  ediblePortionMatch: boolean;
  nutrientCompleteness: string;
  existingGovernedFoodId: string | null;
  finalDecision: string;
  USDACandidates: Array<{ fdcId: number; dataType: string; nutrientVector: Nutrients; requiredNutrientsPresent: boolean }>;
};
type ActivationRecord = QueueRecord & {
  activationId: string;
  governedFoodId: string;
  sourceMappingId: string;
  sourceType: 'USDA_FDC';
  sourceVersion: string;
  rightsClass: 'USDA_FDC_CC0';
  nutritionPer100g: Nutrients;
  nutritionHash: string;
  servingProfile: CommonFood['servings'][number];
  servingHash: string;
  operationalUse: 'DIRECT_ADDABLE' | 'COMPONENT_ADDABLE' | 'INGREDIENT_ONLY' | 'SECONDARY_ONLY';
  roles: ComponentRole[];
  mealHeads: MealHead[];
  generatorEligible: boolean;
  componentEligible: boolean;
  directAddEligible: boolean;
  dietClass: CommonFood['vegetarianClass'];
  auditEvents: string[];
  artifactHash: string;
  processorVersion: 'FOOD_USDA_ACTIVATION_V17_33A2';
};

const loadFrozenArtifact = (filename: string): Buffer => {
  const compiledUrl = new URL(`./food-curation/data/${filename}`, import.meta.url);
  if (existsSync(compiledUrl)) return readFileSync(compiledUrl);
  const sourcePath = join(process.cwd(), 'src/modules/nutrition/food-curation/data', filename);
  if (existsSync(sourcePath)) return readFileSync(sourcePath);
  throw new Error(`USDA_ACTIVATION_ARTIFACT_MISSING:${filename}`);
};

const decisionBytes = loadFrozenArtifact('food_usda_adjudication_v17_33a_decisions.json');
const queueBytes = loadFrozenArtifact('food_usda_activation_queue_v17_33a2.json');
const decisionsArtifact = JSON.parse(decisionBytes.toString('utf8')) as { decisions: DecisionRecord[] };
const queueArtifact = JSON.parse(queueBytes.toString('utf8')) as { queueCount: number; records: QueueRecord[] };
export const FOOD_USDA_ACTIVATION_V17_33A2_ARTIFACT_SHA256 = canonicalHash({
  adjudicationArtifactSha256: canonicalHash(decisionBytes.toString('utf8')),
  activationQueueSha256: canonicalHash(queueBytes.toString('utf8'))
});
const byReference = new Map(decisionsArtifact.decisions.map((decision) => [decision.referenceItemId, decision]));
const normalizeAlias = (value: string) => value.trim().toLowerCase();
const requiredMacrosPresent = (n: Nutrients | null) => !!n && ['kcal', 'protein', 'carbohydrate', 'fat'].every((key) => Number.isFinite(n[key as keyof Nutrients]));

const failClosedValidateQueue = () => {
  if (queueArtifact.queueCount !== 15 || queueArtifact.records.length !== 15) throw new Error('USDA_V1733A2_QUEUE_COUNT_MISMATCH');
  const byType = queueArtifact.records.reduce((out, record) => {
    out[record.activationType] = (out[record.activationType] ?? 0) + 1;
    return out;
  }, {} as Record<ActivationType, number>);
  if (byType.NEW_USDA_MAPPING !== 12 || byType.ALIAS_EXISTING !== 3) throw new Error('USDA_V1733A2_QUEUE_TYPE_MISMATCH');
  if (new Set(queueArtifact.records.map((record) => record.referenceItemId)).size !== 15) throw new Error('USDA_V1733A2_DUPLICATE_REFERENCE');
  for (const record of queueArtifact.records) {
    const decision = byReference.get(record.referenceItemId);
    if (!decision) throw new Error(`USDA_V1733A2_DECISION_MISSING:${record.referenceItemId}`);
    const expected = record.activationType === 'NEW_USDA_MAPPING' ? 'READY_FOR_USDA_ACTIVATION' : 'EXISTING_GOVERNED_IDENTITY_ALIAS';
    if (decision.finalDecision !== expected) throw new Error(`USDA_V1733A2_DECISION_MISMATCH:${record.referenceItemId}`);
    if (decision.selectedFdcId !== record.selectedFdcId) throw new Error(`USDA_V1733A2_FDC_MISMATCH:${record.referenceItemId}`);
    if (!decision.stateMatch || !decision.ediblePortionMatch || !['EXACT', 'BOTANICALLY_EQUIVALENT'].includes(decision.identityDecision)) throw new Error(`USDA_V1733A2_IDENTITY_GATE_FAILED:${record.referenceItemId}`);
    const selected = decision.USDACandidates.find((candidate) => candidate.fdcId === record.selectedFdcId);
    if (!selected || !selected.requiredNutrientsPresent || !requiredMacrosPresent(selected.nutrientVector)) throw new Error(`USDA_V1733A2_NUTRIENT_GATE_FAILED:${record.referenceItemId}`);
    if (record.activationType === 'ALIAS_EXISTING' && !record.existingGovernedFoodId) throw new Error(`USDA_V1733A2_ALIAS_TARGET_MISSING:${record.referenceItemId}`);
  }
};

const rolePlan = (record: QueueRecord): ComponentRole[] => {
  if (['BATCH0_127'].includes(record.referenceItemId)) return ['FRUIT'];
  if (['BATCH0_56'].includes(record.referenceItemId)) return ['STARCH', 'FRUIT'];
  if (['BATCH0_90', 'BATCH0_92'].includes(record.referenceItemId)) return ['PULSE', 'VEGETABLE'];
  if (['BATCH0_121', 'BATCH0_122', 'BATCH0_128', 'BATCH0_132'].includes(record.referenceItemId)) return ['FRUIT'];
  return ['VEGETABLE'];
};
const operationalUseFor = (record: QueueRecord, roles: ComponentRole[]): ActivationRecord['operationalUse'] => {
  if (record.activationType === 'ALIAS_EXISTING') return 'COMPONENT_ADDABLE';
  if (roles.includes('FRUIT') && !roles.includes('STARCH')) return 'DIRECT_ADDABLE';
  return 'COMPONENT_ADDABLE';
};
const mealHeadsFor = (roles: ComponentRole[], operationalUse: ActivationRecord['operationalUse']): MealHead[] => {
  if (operationalUse === 'DIRECT_ADDABLE' && roles.includes('FRUIT')) return ['EARLY_MORNING', 'MID_MORNING', 'EVENING_SNACK'];
  if (roles.includes('PULSE') || roles.includes('STARCH') || roles.includes('VEGETABLE')) return ['LUNCH', 'DINNER'];
  return [];
};
const foodCategoryFor = (roles: ComponentRole[]) => roles.includes('FRUIT') && !roles.includes('STARCH') ? 'fruit' : 'vegetable';

export const createUsdaActivationV1733A2Records = (): ActivationRecord[] => {
  failClosedValidateQueue();
  return queueArtifact.records.map((record) => {
    const decision = byReference.get(record.referenceItemId)!;
    const selected = decision.USDACandidates.find((candidate) => candidate.fdcId === record.selectedFdcId)!;
    const roles = rolePlan(record);
    const operationalUse = operationalUseFor(record, roles);
    const mealHeads = mealHeadsFor(roles, operationalUse);
    const generatorEligible = record.activationType === 'NEW_USDA_MAPPING' && operationalUse !== 'INGREDIENT_ONLY';
    const componentEligible = record.activationType === 'NEW_USDA_MAPPING';
    const directAddEligible = componentEligible && operationalUse === 'DIRECT_ADDABLE';
    const servingProfile = {
      id: `SV_USDA_V1733A2_${record.referenceItemId}_100G`,
      version: 1,
      label: '100 g',
      grams: 100,
      millilitres: null,
      unit: 'gram',
      isDefault: true,
      minMultiplier: .5,
      maxMultiplier: 2,
      allowedMultipliers: [.5, 1, 1.5, 2],
      active: true
    };
    const governedFoodId = record.activationType === 'ALIAS_EXISTING' ? record.existingGovernedFoodId! : record.referenceItemId;
    const auditEvents = record.activationType === 'ALIAS_EXISTING'
      ? ['USDA_ALIAS_MERGED']
      : ['USDA_MAPPING_ACTIVATED', 'NUTRITION_VERIFIED', 'SERVING_VERIFIED', ...(generatorEligible ? ['GENERATOR_ACTIVATED'] : []), ...(componentEligible ? ['COMPONENT_ACTIVATED'] : []), ...(directAddEligible ? ['DIRECT_ADD_ACTIVATED'] : [])];
    return {
      ...record,
      activationId: `USDA_V1733A2_${record.referenceItemId}`,
      governedFoodId,
      sourceMappingId: `USDA_FDC:${record.selectedFdcId}`,
      sourceType: 'USDA_FDC',
      sourceVersion: `${selected.dataType}:${record.selectedFdcId}`,
      rightsClass: 'USDA_FDC_CC0',
      nutritionPer100g: selected.nutrientVector,
      nutritionHash: canonicalHash(selected.nutrientVector),
      servingProfile,
      servingHash: canonicalHash(servingProfile),
      operationalUse,
      roles,
      mealHeads,
      generatorEligible,
      componentEligible,
      directAddEligible,
      dietClass: 'VEGAN',
      auditEvents,
      artifactHash: FOOD_USDA_ACTIVATION_V17_33A2_ARTIFACT_SHA256,
      processorVersion: 'FOOD_USDA_ACTIVATION_V17_33A2'
    };
  });
};

export function createUsdaActivationV1733A2Foods(records = createUsdaActivationV1733A2Records()): CommonFood[] {
  return records.filter((record) => record.activationType === 'NEW_USDA_MAPPING').map((record) => {
    const decision = byReference.get(record.referenceItemId)!;
    return {
      id: record.governedFoodId,
      version: 1,
      canonicalCode: `USDA_V1733A2_${record.selectedFdcId}`,
      canonicalName: record.canonicalName.toLowerCase(),
      displayName: record.canonicalName,
      foodType: 'COMMON_FOOD',
      family: record.canonicalName.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
      category: foodCategoryFor(record.roles),
      countryContext: 'GLOBAL_GENERIC',
      isIndianSpecificFood: false,
      sourcePolicyClass: 'GLOBAL_GENERIC_APPROVED',
      sourceMappingId: record.sourceMappingId,
      sourceVersion: record.sourceVersion,
      vegetarianClass: record.dietClass,
      dietTags: ['vegan', 'vegetarian'],
      allergens: [],
      intolerances: [],
      clinicalTags: [],
      avoidTags: [],
      mealHeads: record.mealHeads,
      roles: record.roles,
      nutrientsPer100g: record.nutritionPer100g,
      servings: [record.servingProfile],
      active: true,
      clientConsumable: record.componentEligible || record.directAddEligible,
      generatorEligible: record.generatorEligible,
      aliases: [...new Set([record.canonicalName, ...(decision.aliases ?? []), record.selectedDescription].map(normalizeAlias).filter(Boolean))]
    };
  });
}

export function applyUsdaActivationV1733A2Aliases(foods: CommonFood[], records = createUsdaActivationV1733A2Records()): CommonFood[] {
  const aliasByFoodId = new Map<string, string[]>();
  for (const record of records.filter((item) => item.activationType === 'ALIAS_EXISTING')) {
    const decision = byReference.get(record.referenceItemId)!;
    aliasByFoodId.set(record.existingGovernedFoodId!, [...(aliasByFoodId.get(record.existingGovernedFoodId!) ?? []), record.canonicalName, ...(decision.aliases ?? [])]);
  }
  return foods.map((food) => {
    const aliases = aliasByFoodId.get(food.id);
    return aliases?.length ? { ...food, aliases: [...new Set([...food.aliases, ...aliases.map(normalizeAlias)])] } : food;
  });
}
