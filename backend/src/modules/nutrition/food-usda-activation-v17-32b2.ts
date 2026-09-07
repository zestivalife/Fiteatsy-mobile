import { readFileSync } from 'node:fs';
import type { CommonFood, ComponentRole, MealHead, Nutrients } from './common-food-engine.js';
import { canonicalHash } from './food-curation/canonical-food-foundation.js';

type ActivationType = 'NEW_MAPPING' | 'ALIAS_EXISTING';
type FinalDecision = 'READY_FOR_NEW_USDA_MAPPING' | 'EXISTING_GOVERNED_IDENTITY_ALIAS';
type QueueRecord = {
  referenceItemId: string;
  selectedFdcId: number;
  canonicalName: string;
  existingGovernedFoodId: string | null;
  intendedOperationalUse: string;
  intendedRoles: ComponentRole[];
  exactState: string;
  activationType: ActivationType;
};
type DecisionRecord = {
  decisionId: string;
  referenceItemId: string;
  canonicalName: string;
  aliases: string[];
  category: string;
  exactState: string;
  selectedFdcId: number | null;
  selectedDescription: string | null;
  dataType: string | null;
  identityMatch: string;
  stateMatch: boolean;
  requiredNutrientsPresent: boolean;
  nutrientVector: Nutrients | null;
  portionEvidence: string | null;
  existingGovernedFoodId: string | null;
  finalDecision: FinalDecision | string;
};
type ActivationRecord = QueueRecord & {
  activationId: string;
  governedFoodId: string;
  sourceMappingId: string;
  sourceType: 'USDA_FDC';
  sourceVersion: string;
  rightsClass: 'USDA_FDC_CC0';
  sourceDescription: string;
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
  processorVersion: 'FOOD_USDA_ACTIVATION_V17_32B2';
};

const decisionBytes = readFileSync(new URL('./food-curation/data/food_usda_mapping_v17_32b1_decisions.json', import.meta.url));
const queueBytes = readFileSync(new URL('./food-curation/data/food_usda_activation_queue_v17_32b2.json', import.meta.url));
const decisionsArtifact = JSON.parse(decisionBytes.toString('utf8')) as { decisions: DecisionRecord[] };
const queueArtifact = JSON.parse(queueBytes.toString('utf8')) as { queueCount: number; records: QueueRecord[] };
export const FOOD_USDA_ACTIVATION_V17_32B2_ARTIFACT_SHA256 = canonicalHash({
  mappingArtifactSha256: canonicalHash(decisionBytes.toString('utf8')),
  activationQueueSha256: canonicalHash(queueBytes.toString('utf8'))
});

const requiredMacrosPresent = (n: Nutrients | null) => !!n && ['kcal', 'protein', 'carbohydrate', 'fat'].every((key) => Number.isFinite(n[key as keyof Nutrients]));
const normalizeAlias = (value: string) => value.trim().toLowerCase();
const sourceVersionFor = (decision: DecisionRecord) => `${decision.dataType ?? 'USDA_FDC'}:${decision.selectedFdcId}`;
const selectedCandidate = (decision: DecisionRecord) => decision.selectedFdcId ? decision : null;
const decisionByReference = new Map(decisionsArtifact.decisions.map((decision) => [decision.referenceItemId, decision]));

const failClosedValidateQueue = () => {
  if (queueArtifact.queueCount !== 47 || queueArtifact.records.length !== 47) throw new Error('USDA_ACTIVATION_QUEUE_COUNT_MISMATCH');
  const byType = queueArtifact.records.reduce((out, record) => {
    out[record.activationType] = (out[record.activationType] ?? 0) + 1;
    return out;
  }, {} as Record<ActivationType, number>);
  if (byType.NEW_MAPPING !== 43 || byType.ALIAS_EXISTING !== 4) throw new Error('USDA_ACTIVATION_QUEUE_TYPE_MISMATCH');
  if (new Set(queueArtifact.records.map((record) => record.referenceItemId)).size !== 47) throw new Error('USDA_ACTIVATION_DUPLICATE_REFERENCE');
  for (const record of queueArtifact.records) {
    const decision = decisionByReference.get(record.referenceItemId);
    if (!decision) throw new Error(`USDA_ACTIVATION_DECISION_MISSING:${record.referenceItemId}`);
    const expected: FinalDecision = record.activationType === 'NEW_MAPPING' ? 'READY_FOR_NEW_USDA_MAPPING' : 'EXISTING_GOVERNED_IDENTITY_ALIAS';
    if (decision.finalDecision !== expected) throw new Error(`USDA_ACTIVATION_DECISION_MISMATCH:${record.referenceItemId}`);
    if (decision.selectedFdcId !== record.selectedFdcId) throw new Error(`USDA_ACTIVATION_FDC_MISMATCH:${record.referenceItemId}`);
    if (!decision.stateMatch || !['EXACT', 'BOTANICALLY_EQUIVALENT'].includes(decision.identityMatch)) throw new Error(`USDA_ACTIVATION_IDENTITY_GATE_FAILED:${record.referenceItemId}`);
    if (!requiredMacrosPresent(decision.nutrientVector)) throw new Error(`USDA_ACTIVATION_NUTRIENT_GATE_FAILED:${record.referenceItemId}`);
    if (record.activationType === 'ALIAS_EXISTING' && !record.existingGovernedFoodId) throw new Error(`USDA_ALIAS_TARGET_MISSING:${record.referenceItemId}`);
  }
};

const rolePlan = (record: QueueRecord, decision: DecisionRecord): ComponentRole[] => {
  const name = `${record.canonicalName} ${decision.selectedDescription ?? ''}`.toLowerCase();
  if (name.includes('coconut water')) return ['BEVERAGE'];
  if (name.includes('coconut meat') || record.canonicalName === 'Avocado') return ['NUT_SEED'];
  if (['BATCH0_67', 'BATCH0_69', 'BATCH0_71'].includes(record.referenceItemId)) return ['STARCH', 'VEGETABLE'];
  if (['BATCH0_84', 'BATCH0_88', 'BATCH0_89'].includes(record.referenceItemId)) return ['PULSE', 'VEGETABLE'];
  if (/fruit|guava|pomegranate|watermelon|grape|pear|custard|litchi|kiwi|peach|plum|apricot|fig/.test(name) && !/gourd|squash|pepper|tomato|eggplant|pods|radish|turnip|cabbage|sprout|peas|beans|shoots|asparagus|mushroom/.test(name)) return ['FRUIT'];
  return [...new Set(record.intendedRoles.length ? record.intendedRoles : ['VEGETABLE' as ComponentRole])];
};

const operationalUseFor = (roles: ComponentRole[], record: QueueRecord): ActivationRecord['operationalUse'] => {
  if (roles.includes('BEVERAGE') || roles.includes('FRUIT')) return 'DIRECT_ADDABLE';
  if (roles.includes('NUT_SEED')) return 'SECONDARY_ONLY';
  if (record.canonicalName.toLowerCase().startsWith('raw ')) return 'INGREDIENT_ONLY';
  return 'COMPONENT_ADDABLE';
};

const mealHeadsFor = (roles: ComponentRole[], operationalUse: ActivationRecord['operationalUse']): MealHead[] => {
  if (operationalUse === 'INGREDIENT_ONLY') return [];
  if (roles.includes('BEVERAGE')) return ['EARLY_MORNING', 'BEDTIME'];
  if (roles.includes('FRUIT')) return ['EARLY_MORNING', 'MID_MORNING', 'EVENING_SNACK'];
  if (roles.includes('NUT_SEED')) return ['MID_MORNING', 'EVENING_SNACK', 'BEDTIME'];
  if (roles.includes('STARCH') || roles.includes('PULSE') || roles.includes('VEGETABLE')) return ['LUNCH', 'DINNER'];
  return [];
};

const shouldGenerate = (record: QueueRecord, roles: ComponentRole[], operationalUse: ActivationRecord['operationalUse']) =>
  operationalUse !== 'INGREDIENT_ONLY'
  && (operationalUse === 'DIRECT_ADDABLE' || roles.some((role) => ['VEGETABLE', 'PULSE', 'STARCH', 'BEVERAGE', 'FRUIT', 'NUT_SEED'].includes(role)))
  && !record.canonicalName.toLowerCase().startsWith('raw ')
  && !['BATCH0_129'].includes(record.referenceItemId);

const foodCategoryFor = (roles: ComponentRole[], decision: DecisionRecord) => {
  if (roles.includes('BEVERAGE')) return 'beverage';
  if (roles.includes('FRUIT')) return 'fruit';
  if (roles.includes('NUT_SEED')) return 'nuts';
  if (roles.includes('PULSE')) return 'legume';
  if (roles.includes('STARCH')) return 'vegetable';
  return decision.category.toLowerCase().includes('fruit') ? 'fruit' : 'vegetable';
};

export const createUsdaActivationV1732B2Records = (): ActivationRecord[] => {
  failClosedValidateQueue();
  return queueArtifact.records.map((record) => {
    const decision = selectedCandidate(decisionByReference.get(record.referenceItemId)!);
    if (!decision?.nutrientVector || !decision.selectedFdcId || !decision.selectedDescription) throw new Error(`USDA_ACTIVATION_SELECTED_RECORD_MISSING:${record.referenceItemId}`);
    const roles = rolePlan(record, decision);
    const operationalUse = operationalUseFor(roles, record);
    const mealHeads = mealHeadsFor(roles, operationalUse);
    const generatorEligible = record.activationType === 'NEW_MAPPING' && shouldGenerate(record, roles, operationalUse);
    const componentEligible = record.activationType === 'NEW_MAPPING' && operationalUse !== 'INGREDIENT_ONLY';
    const directAddEligible = componentEligible && operationalUse === 'DIRECT_ADDABLE';
    const servingProfile = {
      id: `SV_USDA_V1732B2_${record.referenceItemId}_100G`,
      version: 1,
      label: '100 g',
      grams: 100,
      millilitres: roles.includes('BEVERAGE') ? 100 : null,
      unit: roles.includes('BEVERAGE') ? 'ml' : 'gram',
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
      activationId: `USDA_V1732B2_${record.referenceItemId}`,
      governedFoodId,
      sourceMappingId: `USDA_FDC:${record.selectedFdcId}`,
      sourceType: 'USDA_FDC',
      sourceVersion: sourceVersionFor(decision),
      rightsClass: 'USDA_FDC_CC0',
      sourceDescription: decision.selectedDescription,
      nutritionPer100g: decision.nutrientVector,
      nutritionHash: canonicalHash(decision.nutrientVector),
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
      artifactHash: FOOD_USDA_ACTIVATION_V17_32B2_ARTIFACT_SHA256,
      processorVersion: 'FOOD_USDA_ACTIVATION_V17_32B2'
    };
  });
};

export function createUsdaActivationV1732B2Foods(records = createUsdaActivationV1732B2Records()): CommonFood[] {
  return records.filter((record) => record.activationType === 'NEW_MAPPING').map((record) => ({
    id: record.governedFoodId,
    version: 1,
    canonicalCode: `USDA_V1732B2_${record.selectedFdcId}`,
    canonicalName: record.canonicalName.toLowerCase(),
    displayName: record.canonicalName,
    foodType: 'COMMON_FOOD',
    family: record.roles.includes('NUT_SEED') ? 'NUT_SEED' : record.canonicalName.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
    category: foodCategoryFor(record.roles, decisionByReference.get(record.referenceItemId)!),
    countryContext: 'GLOBAL_GENERIC',
    isIndianSpecificFood: false,
    sourcePolicyClass: 'GLOBAL_GENERIC_APPROVED',
    sourceMappingId: record.sourceMappingId,
    sourceVersion: record.sourceVersion,
    vegetarianClass: record.dietClass,
    dietTags: ['vegan', 'vegetarian'],
    allergens: record.roles.includes('NUT_SEED') ? ['tree_nut'] : [],
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
    aliases: [...new Set([record.canonicalName, ...decisionByReference.get(record.referenceItemId)!.aliases, record.sourceDescription].map(normalizeAlias).filter(Boolean))]
  }));
}

export function applyUsdaActivationV1732B2Aliases(foods: CommonFood[], records = createUsdaActivationV1732B2Records()): CommonFood[] {
  const aliasByFoodId = new Map<string, string[]>();
  for (const record of records.filter((item) => item.activationType === 'ALIAS_EXISTING')) {
    const decision = decisionByReference.get(record.referenceItemId)!;
    aliasByFoodId.set(record.existingGovernedFoodId!, [...(aliasByFoodId.get(record.existingGovernedFoodId!) ?? []), record.canonicalName, ...decision.aliases]);
  }
  return foods.map((food) => {
    const aliases = aliasByFoodId.get(food.id);
    return aliases?.length ? { ...food, aliases: [...new Set([...food.aliases, ...aliases.map(normalizeAlias)])] } : food;
  });
}
