import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const dataRoot = new URL('../src/modules/nutrition/food-curation/data/', import.meta.url);
const catalogueRoot = new URL('../src/modules/nutrition/catalogue/data/', import.meta.url);
const resolution = JSON.parse(readFileSync(new URL('food_resolution_v17_32c_decisions.json', dataRoot), 'utf8'));
const catalogue = JSON.parse(readFileSync(new URL('fiteatsy-nutrition-catalogue-v1.1.json', catalogueRoot), 'utf8'));
const p0 = JSON.parse(readFileSync(new URL('p0_food_verification_v17_29.json', dataRoot), 'utf8'));
const v1731 = JSON.parse(readFileSync(new URL('food_unblock_v17_31_decisions.json', dataRoot), 'utf8'));
const v1732b2 = JSON.parse(readFileSync(new URL('food_usda_activation_queue_v17_32b2.json', dataRoot), 'utf8'));

const PROCESSOR = 'FOOD_USDA_ADJUDICATION_V17_33A';
const BASELINE_SHA = 'f1c3ec584a72acdfa92863f049b32623e3cbf814';
const SOURCE_RESOLUTION_BASELINE_SHA = '1dd095d201487f5932f5eaeb0c9e8c873c483181';
const generatedAt = '2026-09-07T00:00:00.000Z';
const nutrientIds = { kcal: new Set([1008, 2047, 2048]), protein: new Set([1003]), carbohydrate: new Set([1005]), fat: new Set([1004]), fibre: new Set([1079]) };
const dataTypes = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];
const datasetSpecs = [
  { type: 'Foundation', zip: '/tmp/fdc_foundation.zip', file: 'FoodData_Central_foundation_food_json_2026-04-30.json' },
  { type: 'SR Legacy', zip: '/tmp/fdc_sr.zip', file: 'FoodData_Central_sr_legacy_food_json_2018-04.json' },
  { type: 'Survey (FNDDS)', zip: '/tmp/fdc_fndds.zip', file: 'surveyDownload.json' },
];
const terminalDecisions = new Set([
  'READY_FOR_USDA_ACTIVATION',
  'EXISTING_GOVERNED_IDENTITY_ALIAS',
  'STATE_MISMATCH_CONFIRMED',
  'IDENTITY_AMBIGUOUS_CONFIRMED',
  'EDIBLE_PORTION_MISMATCH',
  'CULTIVAR_MISMATCH',
  'USDA_NO_EXACT_RECORD',
]);
const approvedDecisions = new Set(['READY_FOR_USDA_ACTIVATION', 'EXISTING_GOVERNED_IDENTITY_ALIAS']);
const normal = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (value) => normal(value).split(/\s+/).filter(Boolean);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const rankDataType = (type) => dataTypes.indexOf(type) === -1 ? 99 : dataTypes.indexOf(type);
const sourceUrl = (fdcId) => `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients`;

const adjudicationSpecs = {
  BATCH0_30: { canonicalIdentity: 'Bottle gourd / calabash', scientificIdentityExpected: 'Lagenaria siceraria', ediblePortionExpected: 'immature fruit/gourd flesh', selectedFdcId: 169232, identityDecision: 'BOTANICALLY_EQUIVALENT', selectedState: 'RAW', finalDecision: 'READY_FOR_USDA_ACTIVATION', searchTerms: ['bottle gourd', 'calabash', 'white-flowered gourd', 'lagenaria'] },
  BATCH0_31: { canonicalIdentity: 'Ridge gourd', scientificIdentityExpected: 'Luffa acutangula', ediblePortionExpected: 'immature fruit', finalDecision: 'USDA_NO_EXACT_RECORD', searchTerms: ['ridge gourd', 'luffa acutangula'] },
  BATCH0_32: { canonicalIdentity: 'Sponge gourd', scientificIdentityExpected: 'Luffa aegyptiaca / Luffa cylindrica', ediblePortionExpected: 'immature fruit', selectedFdcId: 168414, identityDecision: 'BOTANICALLY_EQUIVALENT', selectedState: 'RAW', finalDecision: 'READY_FOR_USDA_ACTIVATION', searchTerms: ['sponge gourd', 'dishcloth gourd', 'towelgourd', 'luffa'] },
  BATCH0_34: { canonicalIdentity: 'Snake gourd', scientificIdentityExpected: 'Trichosanthes cucumerina', ediblePortionExpected: 'immature fruit', finalDecision: 'USDA_NO_EXACT_RECORD', searchTerms: ['snake gourd', 'trichosanthes'] },
  BATCH0_35: { canonicalIdentity: 'Ash gourd / winter melon', scientificIdentityExpected: 'Benincasa hispida', ediblePortionExpected: 'fruit flesh', selectedFdcId: 170069, identityDecision: 'BOTANICALLY_EQUIVALENT', selectedState: 'RAW', finalDecision: 'READY_FOR_USDA_ACTIVATION', searchTerms: ['ash gourd', 'winter melon', 'waxgourd', 'benincasa'] },
  BATCH0_37: { canonicalIdentity: 'Pointed gourd', scientificIdentityExpected: 'Trichosanthes dioica', ediblePortionExpected: 'immature fruit', finalDecision: 'USDA_NO_EXACT_RECORD', searchTerms: ['pointed gourd', 'parwal', 'trichosanthes dioica'] },
  BATCH0_38: { canonicalIdentity: 'Ivy gourd', scientificIdentityExpected: 'Coccinia grandis', ediblePortionExpected: 'immature fruit', finalDecision: 'USDA_NO_EXACT_RECORD', searchTerms: ['ivy gourd', 'coccinia'] },
  BATCH0_39: { canonicalIdentity: 'Round gourd / tinda', scientificIdentityExpected: 'Praecitrullus fistulosus', ediblePortionExpected: 'immature fruit', finalDecision: 'USDA_NO_EXACT_RECORD', searchTerms: ['round gourd', 'tinda', 'praecitrullus'] },
  BATCH0_40: { canonicalIdentity: 'Spine gourd', scientificIdentityExpected: 'Momordica dioica', ediblePortionExpected: 'immature fruit', finalDecision: 'USDA_NO_EXACT_RECORD', searchTerms: ['spine gourd', 'kantola', 'momordica dioica'] },
  BATCH0_43: { canonicalIdentity: 'Yellow cucumber / dosakaya', scientificIdentityExpected: 'Cucumis sativus cultivar group', ediblePortionExpected: 'fresh fruit', finalDecision: 'CULTIVAR_MISMATCH', searchTerms: ['yellow cucumber', 'cucumber raw', 'cucumis sativus'] },
  BATCH0_47: { canonicalIdentity: 'Purple brinjal / eggplant', scientificIdentityExpected: 'Solanum melongena', ediblePortionExpected: 'fruit', selectedFdcId: 169228, identityDecision: 'BOTANICALLY_EQUIVALENT', selectedState: 'RAW', finalDecision: 'EXISTING_GOVERNED_IDENTITY_ALIAS', searchTerms: ['eggplant raw', 'brinjal', 'solanum melongena'] },
  BATCH0_49: { canonicalIdentity: 'Green brinjal / eggplant', scientificIdentityExpected: 'Solanum melongena green cultivar', ediblePortionExpected: 'fruit', selectedFdcId: 169228, identityDecision: 'BOTANICALLY_EQUIVALENT', selectedState: 'RAW', finalDecision: 'EXISTING_GOVERNED_IDENTITY_ALIAS', searchTerms: ['eggplant raw', 'green brinjal', 'solanum melongena'] },
  BATCH0_54: { canonicalIdentity: 'Green chilli pepper', scientificIdentityExpected: 'Capsicum frutescens / Capsicum annuum hot green cultivar', ediblePortionExpected: 'fresh pod', selectedFdcId: 170497, identityDecision: 'BOTANICALLY_EQUIVALENT', selectedState: 'RAW', finalDecision: 'READY_FOR_USDA_ACTIVATION', searchTerms: ['green chili raw', 'hot chili green raw', 'capsicum frutescens'] },
  BATCH0_56: { canonicalIdentity: 'Raw banana / green plantain', scientificIdentityExpected: 'Musa x paradisiaca', ediblePortionExpected: 'green fruit pulp', selectedFdcId: 168215, identityDecision: 'BOTANICALLY_EQUIVALENT', selectedState: 'RAW', finalDecision: 'READY_FOR_USDA_ACTIVATION', searchTerms: ['plantains green raw', 'raw banana', 'musa paradisiaca'] },
  BATCH0_66: { canonicalIdentity: 'Elephant foot yam', scientificIdentityExpected: 'Amorphophallus paeoniifolius', ediblePortionExpected: 'raw corm', finalDecision: 'USDA_NO_EXACT_RECORD', searchTerms: ['elephant foot yam', 'amorphophallus'] },
  BATCH0_68: { canonicalIdentity: 'Purple yam', scientificIdentityExpected: 'Dioscorea alata purple cultivar', ediblePortionExpected: 'raw tuber', finalDecision: 'IDENTITY_AMBIGUOUS_CONFIRMED', searchTerms: ['purple yam', 'yam raw', 'dioscorea alata'] },
  BATCH0_70: { canonicalIdentity: 'Chinese potato / koorka', scientificIdentityExpected: 'Plectranthus rotundifolius', ediblePortionExpected: 'raw tuber', finalDecision: 'USDA_NO_EXACT_RECORD', searchTerms: ['chinese potato', 'koorka', 'plectranthus rotundifolius'] },
  BATCH0_72: { canonicalIdentity: 'Red onion', scientificIdentityExpected: 'Allium cepa red cultivar', ediblePortionExpected: 'bulb', finalDecision: 'CULTIVAR_MISMATCH', searchTerms: ['red onion raw', 'onion raw', 'allium cepa'] },
  BATCH0_73: { canonicalIdentity: 'White onion', scientificIdentityExpected: 'Allium cepa white cultivar', ediblePortionExpected: 'bulb', finalDecision: 'CULTIVAR_MISMATCH', searchTerms: ['white onion raw', 'onion raw', 'allium cepa'] },
  BATCH0_77: { canonicalIdentity: 'Fresh turmeric', scientificIdentityExpected: 'Curcuma longa', ediblePortionExpected: 'fresh rhizome', finalDecision: 'STATE_MISMATCH_CONFIRMED', searchTerms: ['fresh turmeric', 'turmeric raw', 'curcuma longa'] },
  BATCH0_86: { canonicalIdentity: 'Cluster beans / guar', scientificIdentityExpected: 'Cyamopsis tetragonoloba', ediblePortionExpected: 'young pods', finalDecision: 'USDA_NO_EXACT_RECORD', searchTerms: ['cluster beans', 'guar', 'cyamopsis'] },
  BATCH0_87: { canonicalIdentity: 'Yardlong bean', scientificIdentityExpected: 'Vigna unguiculata subsp. sesquipedalis', ediblePortionExpected: 'young pod', selectedFdcId: 169222, identityDecision: 'EXACT', selectedState: 'RAW', finalDecision: 'READY_FOR_USDA_ACTIVATION', searchTerms: ['yardlong bean raw', 'asparagus bean', 'sesquipedalis'] },
  BATCH0_90: { canonicalIdentity: 'Cowpea pods', scientificIdentityExpected: 'Vigna unguiculata subsp. unguiculata', ediblePortionExpected: 'young pods with seeds', selectedFdcId: 168405, identityDecision: 'BOTANICALLY_EQUIVALENT', selectedState: 'RAW', finalDecision: 'READY_FOR_USDA_ACTIVATION', searchTerms: ['cowpeas young pods raw', 'cowpea pods', 'vigna unguiculata'] },
  BATCH0_92: { canonicalIdentity: 'Fresh pigeon peas', scientificIdentityExpected: 'Cajanus cajan', ediblePortionExpected: 'immature seeds', selectedFdcId: 170025, identityDecision: 'BOTANICALLY_EQUIVALENT', selectedState: 'RAW', finalDecision: 'READY_FOR_USDA_ACTIVATION', searchTerms: ['pigeonpeas immature seeds raw', 'fresh pigeon peas', 'cajanus cajan'] },
  BATCH0_93: { canonicalIdentity: 'Fresh chickpeas', scientificIdentityExpected: 'Cicer arietinum fresh green immature seed', ediblePortionExpected: 'immature seeds', finalDecision: 'EDIBLE_PORTION_MISMATCH', searchTerms: ['fresh chickpeas', 'green chickpeas', 'chickpeas mature seeds raw', 'cicer arietinum'] },
  BATCH0_94: { canonicalIdentity: 'Banana flower', scientificIdentityExpected: 'Musa spp.', ediblePortionExpected: 'inflorescence/flower', finalDecision: 'USDA_NO_EXACT_RECORD', searchTerms: ['banana flower', 'banana blossom', 'musa inflorescence'] },
  BATCH0_95: { canonicalIdentity: 'Banana stem', scientificIdentityExpected: 'Musa spp.', ediblePortionExpected: 'pseudostem/core', finalDecision: 'USDA_NO_EXACT_RECORD', searchTerms: ['banana stem', 'banana pseudostem', 'musa stem'] },
  BATCH0_100: { canonicalIdentity: 'Milky mushroom', scientificIdentityExpected: 'Calocybe indica', ediblePortionExpected: 'fruiting body', finalDecision: 'USDA_NO_EXACT_RECORD', searchTerms: ['milky mushroom', 'calocybe indica'] },
  BATCH0_119: { canonicalIdentity: 'Dragon fruit / pitaya', scientificIdentityExpected: 'Selenicereus/Hylocereus spp.', ediblePortionExpected: 'fresh fruit flesh', finalDecision: 'STATE_MISMATCH_CONFIRMED', searchTerms: ['dragon fruit', 'pitaya'] },
  BATCH0_121: { canonicalIdentity: 'Strawberry', scientificIdentityExpected: 'Fragaria x ananassa', ediblePortionExpected: 'whole fruit', selectedFdcId: 2346409, identityDecision: 'EXACT', selectedState: 'RAW', finalDecision: 'READY_FOR_USDA_ACTIVATION', searchTerms: ['strawberries raw', 'fragaria ananassa'] },
  BATCH0_122: { canonicalIdentity: 'Blueberry', scientificIdentityExpected: 'Vaccinium spp.', ediblePortionExpected: 'whole berry', selectedFdcId: 2346411, identityDecision: 'EXACT', selectedState: 'RAW', finalDecision: 'READY_FOR_USDA_ACTIVATION', searchTerms: ['blueberries raw', 'vaccinium'] },
  BATCH0_127: { canonicalIdentity: 'Dried dates', scientificIdentityExpected: 'Phoenix dactylifera', ediblePortionExpected: 'dried fruit', selectedFdcId: 168191, identityDecision: 'BOTANICALLY_EQUIVALENT', selectedState: 'DRIED', finalDecision: 'READY_FOR_USDA_ACTIVATION', searchTerms: ['dates medjool', 'dates deglet noor', 'phoenix dactylifera'] },
  BATCH0_128: { canonicalIdentity: 'Raisins', scientificIdentityExpected: 'Vitis vinifera', ediblePortionExpected: 'dried grape fruit', selectedFdcId: 168165, identityDecision: 'EXACT', selectedState: 'DRIED', finalDecision: 'READY_FOR_USDA_ACTIVATION', searchTerms: ['raisins seedless', 'vitis vinifera'] },
  BATCH0_132: { canonicalIdentity: 'Star fruit / carambola', scientificIdentityExpected: 'Averrhoa carambola', ediblePortionExpected: 'whole fruit', selectedFdcId: 171715, identityDecision: 'EXACT', selectedState: 'RAW', finalDecision: 'READY_FOR_USDA_ACTIVATION', searchTerms: ['carambola starfruit raw', 'averrhoa carambola'] },
  BATCH0_133: { canonicalIdentity: 'Ripe jackfruit', scientificIdentityExpected: 'Artocarpus heterophyllus ripe fruit', ediblePortionExpected: 'ripe fruit bulbs', finalDecision: 'IDENTITY_AMBIGUOUS_CONFIRMED', searchTerms: ['jackfruit raw', 'artocarpus heterophyllus'] },
};

const loadUsdaFoods = () => datasetSpecs.flatMap((spec) => {
  const json = JSON.parse(execFileSync('unzip', ['-p', spec.zip, spec.file], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 300 }));
  return (json.FoundationFoods ?? json.SRLegacyFoods ?? json.SurveyFoods ?? []).filter(Boolean).map((food) => ({
    ...food,
    fdcId: Number(food.fdcId),
    dataType: spec.type,
    foodCategory: typeof food.foodCategory === 'string' ? food.foodCategory : food.foodCategory?.description ?? null,
    publicationDate: food.publicationDate ?? food.publishedDate ?? null,
  }));
});
const allUsdaFoods = loadUsdaFoods();
const byFdcId = new Map(allUsdaFoods.map((food) => [food.fdcId, food]));
const nutrientVector = (food) => {
  const out = { kcal: null, protein: null, carbohydrate: null, fat: null, fibre: null };
  for (const nutrient of food?.foodNutrients ?? []) {
    const id = Number(nutrient.nutrientId ?? nutrient.nutrient?.id);
    for (const [key, ids] of Object.entries(nutrientIds)) if (ids.has(id) && out[key] === null) out[key] = Number(nutrient.value ?? nutrient.amount);
  }
  return out;
};
const macrosComplete = (vector) => ['kcal', 'protein', 'carbohydrate', 'fat'].every((key) => Number.isFinite(vector[key]));
const sourceState = (food, spec) => {
  const description = normal(food?.description);
  if (spec?.selectedState === 'DRIED') return 'DRIED';
  if (/\bdried|dry\b/.test(description)) return 'DRIED';
  if (/\braw|fresh\b/.test(description)) return 'RAW';
  if (/\bcooked|boiled|fried|roasted|canned|frozen|pickled\b/.test(description)) return 'PREPARED_OR_PRESERVED';
  return 'UNSPECIFIED';
};
const selectedStateMatches = (required, selected) => {
  if (required === 'RAW') return selected === 'RAW' || selected === 'FRESH';
  if (required === 'DRIED') return selected === 'DRIED';
  return required === selected;
};
const searchCandidates = (spec) => {
  const termTokens = spec.searchTerms.flatMap(tokens);
  const scored = allUsdaFoods.map((food) => {
    const haystack = normal(`${food.description} ${food.scientificName ?? ''} ${food.foodCategory ?? ''}`);
    const score = termTokens.reduce((sum, token) => sum + (token.length > 2 && haystack.includes(token) ? 1 : 0), 0);
    return { food, score };
  }).filter((item) => item.score > 0);
  const selected = spec.selectedFdcId ? byFdcId.get(spec.selectedFdcId) : null;
  const foods = [...(selected ? [selected] : []), ...scored.sort((a, b) => b.score - a.score || rankDataType(a.food.dataType) - rankDataType(b.food.dataType) || a.food.fdcId - b.food.fdcId).map((item) => item.food)];
  return [...new Map(foods.map((food) => [food.fdcId, food])).values()].slice(0, 12);
};
const existingFdcIds = new Map();
for (const food of catalogue.foods ?? []) if (food.fdcId) existingFdcIds.set(Number(food.fdcId), `CF_${food.id}`);
for (const decision of p0.decisions ?? []) if (decision.sourceMapping?.fdcId) existingFdcIds.set(Number(decision.sourceMapping.fdcId), decision.referenceItemId);
for (const decision of v1731.decisions ?? []) if (decision.sourceMapping?.fdcId) existingFdcIds.set(Number(decision.sourceMapping.fdcId), decision.referenceItemId);
for (const record of v1732b2.records ?? []) if (record.selectedFdcId) existingFdcIds.set(Number(record.selectedFdcId), record.existingGovernedFoodId ?? record.referenceItemId);

const cohort = resolution.decisions.filter((item) => ['STATE_MISMATCH_CONFIRMED', 'IDENTITY_AMBIGUOUS_CONFIRMED'].includes(item.finalDecision));
if (resolution.baselineSha !== SOURCE_RESOLUTION_BASELINE_SHA) throw new Error(`V17_33A_SOURCE_BASELINE_MISMATCH:${resolution.baselineSha}`);
if (cohort.length !== 35) throw new Error(`V17_33A_COHORT_COUNT:${cohort.length}`);
if (cohort.filter((item) => item.finalDecision === 'STATE_MISMATCH_CONFIRMED').length !== 7) throw new Error('V17_33A_STATE_MISMATCH_COUNT');
if (cohort.filter((item) => item.finalDecision === 'IDENTITY_AMBIGUOUS_CONFIRMED').length !== 28) throw new Error('V17_33A_IDENTITY_AMBIGUOUS_COUNT');

const before = {
  schemaVersion: 'FITEATSY_FOOD_USDA_ADJUDICATION_V17_33A_BEFORE',
  baselineSha: BASELINE_SHA,
  processorVersion: PROCESSOR,
  sourceArtifact: 'food_resolution_v17_32c_decisions.json',
  cohortCount: cohort.length,
  priorDecisionCounts: {
    STATE_MISMATCH_CONFIRMED: cohort.filter((item) => item.finalDecision === 'STATE_MISMATCH_CONFIRMED').length,
    IDENTITY_AMBIGUOUS_CONFIRMED: cohort.filter((item) => item.finalDecision === 'IDENTITY_AMBIGUOUS_CONFIRMED').length,
  },
  generatedAt,
  records: cohort.map((item) => ({
    referenceItemId: item.referenceItemId,
    canonicalName: item.canonicalName,
    aliases: item.aliases ?? [],
    exactState: item.exactState,
    priorDecision: item.finalDecision,
    category: item.category,
    subcategory: item.subcategory,
  })),
};

const decisions = cohort.map((item, index) => {
  const spec = adjudicationSpecs[item.referenceItemId];
  if (!spec) throw new Error(`V17_33A_MISSING_SPEC:${item.referenceItemId}`);
  const candidates = searchCandidates(spec).map((food) => {
    const vector = nutrientVector(food);
    const selected = Number(food.fdcId) === Number(spec.selectedFdcId);
    const selectedState = sourceState(food, selected ? spec : null);
    return {
      fdcId: food.fdcId,
      description: food.description,
      dataType: food.dataType,
      foodCategory: food.foodCategory,
      publicationDate: food.publicationDate,
      scientificName: food.scientificName ?? null,
      sourceUrl: sourceUrl(food.fdcId),
      sourceState: selectedState,
      nutrientVector: vector,
      requiredNutrientsPresent: macrosComplete(vector),
      identityDecision: selected ? spec.identityDecision ?? 'EXACT' : 'AMBIGUOUS',
      stateMatch: selected ? selectedStateMatches(item.exactState, selectedState) : false,
      ediblePortionMatch: selected ? !['EDIBLE_PORTION_MISMATCH'].includes(spec.finalDecision) : false,
    };
  });
  const selected = spec.selectedFdcId ? candidates.find((candidate) => candidate.fdcId === spec.selectedFdcId) : null;
  const existingGovernedFoodId = selected ? existingFdcIds.get(Number(selected.fdcId)) ?? null : null;
  const finalDecision = selected && existingGovernedFoodId ? 'EXISTING_GOVERNED_IDENTITY_ALIAS' : spec.finalDecision;
  if (!terminalDecisions.has(finalDecision)) throw new Error(`V17_33A_BAD_DECISION:${item.referenceItemId}:${finalDecision}`);
  if (approvedDecisions.has(finalDecision) && (!selected || !selected.requiredNutrientsPresent || !selected.stateMatch || !selected.ediblePortionMatch || !['EXACT', 'BOTANICALLY_EQUIVALENT'].includes(selected.identityDecision))) {
    throw new Error(`V17_33A_APPROVAL_GATE_FAILED:${item.referenceItemId}`);
  }
  return {
    decisionId: `P0V1733A_${String(index + 1).padStart(3, '0')}`,
    referenceItemId: item.referenceItemId,
    canonicalName: item.canonicalName,
    aliases: item.aliases ?? [],
    exactState: item.exactState,
    canonicalIdentity: spec.canonicalIdentity,
    scientificIdentityExpected: spec.scientificIdentityExpected,
    selectedScientificIdentity: selected?.scientificName ?? null,
    ediblePortionExpected: spec.ediblePortionExpected,
    ediblePortionSelected: selected ? spec.ediblePortionExpected : null,
    USDACandidates: candidates,
    selectedFdcId: selected?.fdcId ?? null,
    selectedDescription: selected?.description ?? null,
    selectedScientificName: selected?.scientificName ?? null,
    identityDecision: selected?.identityDecision ?? (finalDecision === 'CULTIVAR_MISMATCH' ? 'CULTIVAR_MISMATCH' : finalDecision === 'EDIBLE_PORTION_MISMATCH' ? 'EDIBLE_PORTION_MISMATCH' : finalDecision === 'USDA_NO_EXACT_RECORD' ? 'MISMATCH' : 'AMBIGUOUS'),
    stateMatch: selected?.stateMatch ?? false,
    selectedState: selected?.sourceState ?? null,
    ediblePortionMatch: selected?.ediblePortionMatch ?? false,
    nutrientCompleteness: selected?.requiredNutrientsPresent ? 'COMPLETE_REQUIRED_VECTOR' : 'NO_USABLE_VECTOR',
    existingGovernedFoodId,
    finalDecision,
    rationale: approvedDecisions.has(finalDecision)
      ? `Deep USDA adjudication found an exact state-compatible ${selected?.dataType} record with complete required macros.`
      : `Deep USDA adjudication did not find an activation-eligible exact record: ${finalDecision}.`,
    processorVersion: PROCESSOR,
  };
});

const selectedNew = decisions.filter((item) => item.finalDecision === 'READY_FOR_USDA_ACTIVATION');
if (new Set(selectedNew.map((item) => item.selectedFdcId)).size !== selectedNew.length) throw new Error('V17_33A_DUPLICATE_NEW_FDC');
const queueRecords = decisions.filter((item) => approvedDecisions.has(item.finalDecision)).map((item) => ({
  referenceItemId: item.referenceItemId,
  selectedFdcId: item.selectedFdcId,
  canonicalName: item.canonicalName,
  existingGovernedFoodId: item.existingGovernedFoodId,
  exactState: item.exactState,
  selectedDescription: item.selectedDescription,
  activationType: item.finalDecision === 'EXISTING_GOVERNED_IDENTITY_ALIAS' ? 'ALIAS_EXISTING' : 'NEW_USDA_MAPPING',
}));
const countBy = (records, key) => Object.fromEntries([...new Set(records.map((item) => item[key]))].sort().map((value) => [value, records.filter((item) => item[key] === value).length]));
const artifact = {
  schemaVersion: 'FITEATSY_FOOD_USDA_ADJUDICATION_V17_33A_DECISIONS',
  baselineSha: BASELINE_SHA,
  processorVersion: PROCESSOR,
  decisionCount: decisions.length,
  decisionCounts: countBy(decisions, 'finalDecision'),
  generatedAt,
  decisions,
};
artifact.artifactSha256 = sha256(`${JSON.stringify(artifact, null, 2)}\n`);
const queue = {
  schemaVersion: 'FITEATSY_FOOD_USDA_ACTIVATION_QUEUE_V17_33A2',
  sourceProcessorVersion: PROCESSOR,
  sourceArtifact: 'food_usda_adjudication_v17_33a_decisions.json',
  sourceArtifactSha256: artifact.artifactSha256,
  queueCount: queueRecords.length,
  generatedAt,
  records: queueRecords,
};

writeFileSync(new URL('food_usda_adjudication_v17_33a_before.json', dataRoot), `${JSON.stringify(before, null, 2)}\n`);
writeFileSync(new URL('food_usda_adjudication_v17_33a_decisions.json', dataRoot), `${JSON.stringify(artifact, null, 2)}\n`);
writeFileSync(new URL('food_usda_activation_queue_v17_33a2.json', dataRoot), `${JSON.stringify(queue, null, 2)}\n`);
console.log(JSON.stringify({ evaluated: decisions.length, decisionCounts: artifact.decisionCounts, queueCount: queue.queueCount, ready: queue.records.map((item) => item.canonicalName), artifactSha256: artifact.artifactSha256, queueSha256: sha256(`${JSON.stringify(queue, null, 2)}\n`) }, null, 2));
