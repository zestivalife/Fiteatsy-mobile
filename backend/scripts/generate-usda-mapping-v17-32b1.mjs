import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = new URL('../src/modules/nutrition/food-curation/data/', import.meta.url);
const evidence = JSON.parse(readFileSync(new URL('food_evidence_v17_32a_decisions.json', root), 'utf8'));
const catalogue = JSON.parse(readFileSync(new URL('../src/modules/nutrition/catalogue/data/fiteatsy-nutrition-catalogue-v1.1.json', import.meta.url), 'utf8'));
const p0 = JSON.parse(readFileSync(new URL('p0_food_verification_v17_29.json', root), 'utf8'));
const v1731 = JSON.parse(readFileSync(new URL('food_unblock_v17_31_decisions.json', root), 'utf8'));

const PROCESSOR = 'FOOD_USDA_MAPPING_V17_32B1';
const dataTypes = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];
const nutrientIds = { kcal: new Set([1008, 2047, 2048]), protein: new Set([1003]), carbohydrate: new Set([1005]), fat: new Set([1004]), fibre: new Set([1079]) };
const blockedStateWords = /\b(cooked|boiled|fried|roasted|canned|stewed|pickled|frozen|drained|with salt|without salt|sweetened|juice|nectar|syrup|flour|powder|sprouted)\b/i;
const exactStateWords = {
  RAW: /\braw|fresh\b/i,
  DRIED: /\bdried|dry\b/i,
  READY_TO_DRINK: /\bwater|beverage|drink\b/i,
};
const synonymGroups = [
  ['brinjal', 'eggplant'],
  ['capsicum', 'pepper', 'bell pepper'],
  ['beetroot', 'beets', 'beet'],
  ['muskmelon', 'cantaloupe'],
  ['chikoo', 'sapodilla'],
  ['litchi', 'lychee'],
  ['amla', 'gooseberry'],
  ['mosambi', 'sweet lime'],
  ['coconut meat', 'coconut'],
  ['tender coconut water', 'coconut water'],
  ['button mushroom', 'white mushroom'],
  ['yardlong beans', 'yardlong bean', 'asparagus bean'],
  ['broad beans', 'fava beans'],
  ['green peas', 'peas'],
  ['ash gourd', 'waxgourd', 'wax gourd'],
  ['bitter gourd', 'bitter melon'],
  ['colocasia root', 'taro'],
  ['cassava', 'yuca'],
  ['shallots', 'shallot'],
  ['kohlrabi', 'kohlrabi'],
  ['zucchini', 'squash summer zucchini'],
  ['jackfruit', 'jackfruit'],
  ['raw banana', 'plantain'],
];
const exactPhraseByName = new Map(Object.entries({
  'bottle gourd': ['bottle gourd'],
  'bitter gourd': ['balsam pear', 'bitter gourd', 'bitter melon'],
  'chayote': ['chayote fruit'],
  'zucchini': ['squash summer green zucchini', 'squash summer zucchini'],
  'tomato': ['tomatoes raw', 'tomato raw'],
  'cherry tomato': ['tomatoes grape raw', 'tomatoes cherry raw', 'cherry tomatoes raw'],
  'brinjal purple': ['eggplant raw'],
  'brinjal long': ['eggplant raw'],
  'brinjal green': ['eggplant raw'],
  'capsicum green': ['peppers bell green raw'],
  'capsicum red': ['peppers bell red raw'],
  'capsicum yellow': ['peppers bell yellow raw'],
  'raw papaya': ['papaya raw'],
  'raw banana': ['plantains raw', 'plantain raw'],
  'raw jackfruit': ['jackfruit raw'],
  'breadfruit': ['breadfruit raw'],
  'drumstick pods': ['drumstick pods raw'],
  'radish': ['radishes red raw', 'radishes raw'],
  'beetroot': ['beets raw'],
  'turnip': ['turnips raw'],
  'colocasia root': ['taro raw'],
  'cassava': ['cassava raw'],
  'lotus root': ['lotus root raw'],
  'shallots': ['shallots raw'],
  'kohlrabi': ['kohlrabi raw'],
  'cabbage green': ['cabbage green raw'],
  'cabbage red': ['cabbage red raw'],
  'brussels sprouts': ['brussels sprouts raw'],
  'green peas': ['peas green raw'],
  'hyacinth beans': ['hyacinth beans immature seeds raw'],
  'broad beans': ['broadbeans fava beans mature seeds raw', 'broad beans raw'],
  'bamboo shoots': ['bamboo shoots raw'],
  'asparagus': ['asparagus green raw'],
  'button mushroom': ['mushrooms white raw'],
  'oyster mushroom': ['mushrooms oyster raw'],
  'shiitake mushroom': ['mushrooms shiitake raw'],
  'guava': ['guavas common raw'],
  'pomegranate': ['pomegranates raw'],
  'grapes': ['grapes red seedless raw', 'grapes raw'],
  'pear': ['pears raw'],
  'custard apple': ['custard apple raw'],
  'litchi': ['litchis raw', 'lychees raw'],
  'kiwi': ['kiwifruit green raw', 'kiwifruit raw'],
  'strawberry': ['strawberries raw'],
  'blueberry': ['blueberries raw'],
  'peach': ['peaches yellow raw', 'peaches raw'],
  'plum': ['plum black with skin raw', 'plums raw'],
  'apricot': ['apricot with skin raw', 'apricots raw'],
  'fig fresh': ['figs raw'],
  'dates dried': ['dates deglet noor', 'dates medjool'],
  'raisins': ['raisins seedless', 'raisins golden seedless'],
  'coconut meat': ['coconut meat raw'],
  'tender coconut water': ['coconut water'],
  'jackfruit ripe': ['jackfruit raw'],
  'avocado': ['avocado hass peeled raw', 'avocados raw'],
}));
const datasetSpecs = [
  { type: 'Foundation', zip: '/tmp/fdc_foundation.zip', file: 'FoodData_Central_foundation_food_json_2026-04-30.json' },
  { type: 'SR Legacy', zip: '/tmp/fdc_sr.zip', file: 'FoodData_Central_sr_legacy_food_json_2018-04.json' },
  { type: 'Survey (FNDDS)', zip: '/tmp/fdc_fndds.zip', file: 'surveyDownload.json' },
];

const normal = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (value) => normal(value).split(/\s+/).filter(Boolean);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sourceUrl = (fdcId) => `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients`;
const canonicalTerms = (food) => {
  const names = [food.canonicalName, ...(food.aliases ?? [])].map(normal).filter(Boolean);
  for (const group of synonymGroups) if (group.some((term) => names.some((name) => name.includes(term)))) return [...new Set([...names, ...group])];
  return [...new Set(names)];
};
const searchQuery = (food) => {
  const terms = canonicalTerms(food);
  const base = terms.find((term) => !/indian|desi|sabji|sabzi/.test(term)) ?? terms[0];
  if (food.exactState === 'DRIED') return `${base} dried`;
  if (food.exactState === 'READY_TO_DRINK') return base;
  return `${base} raw`;
};
const nutrientVector = (food) => {
  const out = { kcal: null, protein: null, carbohydrate: null, fat: null, fibre: null };
  for (const nutrient of food.foodNutrients ?? []) {
    const id = Number(nutrient.nutrientId ?? nutrient.nutrient?.id);
    for (const [key, ids] of Object.entries(nutrientIds)) if (ids.has(id) && out[key] === null) out[key] = Number(nutrient.value ?? nutrient.amount);
  }
  return out;
};
const macrosComplete = (n) => ['kcal', 'protein', 'carbohydrate', 'fat'].every((key) => Number.isFinite(n[key]));
const sourceState = (description) => {
  if (/\bdried|dry\b/i.test(description)) return 'DRIED';
  if (/\bwater|beverage|drink\b/i.test(description)) return 'READY_TO_DRINK';
  if (/\braw|fresh\b/i.test(description)) return 'RAW';
  if (/\bcooked|boiled|fried|roasted|canned\b/i.test(description)) return 'PREPARED_OR_PRESERVED';
  return 'UNSPECIFIED';
};
const stateMatches = (food, description) => {
  if (food.exactState === 'RAW') return exactStateWords.RAW.test(description) && !blockedStateWords.test(description);
  if (food.exactState === 'DRIED') return exactStateWords.DRIED.test(description) && !/\braw|fresh|cooked|boiled|canned|fried|roasted\b/i.test(description);
  if (food.exactState === 'READY_TO_DRINK') return exactStateWords.READY_TO_DRINK.test(description) && !/\bsweetened|canned|concentrate|juice|nectar\b/i.test(description);
  return false;
};
const ediblePortionConflicts = (food, description) => {
  const name = normal(food.canonicalName);
  const desc = normal(description);
  if (/\bleaves?\b|\bleafy tips\b/.test(desc) && !/\bleaves?\b/.test(name)) return true;
  if (/\bseeds?\b/.test(desc) && !/\bseed|peas|beans|chickpeas\b/.test(name)) return true;
  if (/\brind\b/.test(desc) && !/\brind\b/.test(name)) return true;
  if (/\bmilk\b/.test(desc) && /\bwater\b/.test(name)) return true;
  if (/\bcowpeas\b/.test(desc) && !/\bcowpea\b/.test(name)) return true;
  if (/\bmature seeds\b/.test(desc) && /\bpods|fresh|snow peas|yardlong\b/.test(name)) return true;
  if (/\bshoots?\b/.test(desc) && /\broot\b/.test(name)) return true;
  if (/\bchanterelle\b/.test(desc) && !/\bchanterelle\b/.test(name)) return true;
  if (/\bfresh pigeon peas\b/.test(name) && !/\bpigeon\b/.test(desc)) return true;
  return false;
};
const exactPhrasesFor = (food) => exactPhraseByName.get(normal(food.canonicalName)) ?? canonicalTerms(food);
const identityMatch = (food, candidate) => {
  const description = normal(candidate.description);
  const terms = exactPhrasesFor(food).map(normal);
  if (terms.some((term) => description.includes(term))) return 'EXACT';
  const words = new Set(tokens(description));
  if (terms.some((term) => tokens(term).every((token) => words.has(token)))) return 'BOTANICALLY_EQUIVALENT';
  if (canonicalTerms(food).some((term) => tokens(term).some((token) => token.length > 4 && words.has(token)))) return 'COMMON_NAME_ONLY';
  return 'AMBIGUOUS';
};
const rankDataType = (type) => dataTypes.indexOf(type) === -1 ? 99 : dataTypes.indexOf(type);
const existingFdcIds = new Map();
for (const food of catalogue.foods ?? []) existingFdcIds.set(Number(food.fdcId), `CF_${food.id}`);
for (const decision of p0.decisions ?? []) if (decision.sourceMapping?.fdcId) existingFdcIds.set(Number(decision.sourceMapping.fdcId), decision.referenceItemId);
for (const decision of v1731.decisions ?? []) if (decision.sourceMapping?.fdcId) existingFdcIds.set(Number(decision.sourceMapping.fdcId), decision.referenceItemId);

const loadUsdaFoods = () => datasetSpecs.flatMap((spec) => {
  const json = JSON.parse(execFileSync('unzip', ['-p', spec.zip, spec.file], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 260 }));
  return (json.FoundationFoods ?? json.SRLegacyFoods ?? json.SurveyFoods ?? []).filter(Boolean).map((food) => ({
    ...food,
    fdcId: Number(food.fdcId),
    description: food.description,
    dataType: spec.type,
    publishedDate: food.publicationDate ?? food.publishedDate,
    foodCategory: typeof food.foodCategory === 'string' ? food.foodCategory : food.foodCategory?.description ?? null,
  }));
});
const allUsdaFoods = loadUsdaFoods();
const fdcSearch = async (query) => {
  const queryTokens = new Set(tokens(query).filter((token) => !['raw', 'fresh', 'dried', 'dry'].includes(token)));
  return allUsdaFoods
    .map((food) => {
      const haystack = normal(`${food.description} ${food.scientificName ?? ''} ${food.foodCategory ?? ''}`);
      const score = [...queryTokens].reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
      return { food, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || rankDataType(a.food.dataType) - rankDataType(b.food.dataType) || a.food.fdcId - b.food.fdcId)
    .slice(0, 25)
    .map((item) => item.food);
};

const cohort = evidence.decisions.filter((decision) => decision.evidenceClass === 'GLOBAL_GENERIC_COMMODITY');
if (cohort.length !== 88) throw new Error(`GLOBAL_GENERIC_COHORT_COUNT:${cohort.length}`);

const before = {
  schemaVersion: 'FITEATSY_FOOD_USDA_MAPPING_V17_32B1_BEFORE',
  baselineSha: '635d662cfed7e32580d973bf3f0f313c4f500da1',
  processorVersion: PROCESSOR,
  sourceArtifact: 'food_evidence_v17_32a_decisions.json',
  cohortCount: cohort.length,
  generatedAt: '2026-09-07T00:00:00.000Z',
  records: cohort.map((item) => ({
    referenceItemId: item.referenceItemId,
    sourceRecordId: item.sourceRecordId,
    canonicalName: item.canonicalName,
    aliases: item.aliases,
    category: item.category,
    exactState: item.exactState,
    preparationState: item.preparationState,
    operationalUse: item.operationalUse,
    targetRoles: item.targetRoles,
    evidenceDecisionV1732A: item.evidenceDecision,
  })),
};

const decisions = [];
const selectedNewFdcIds = new Set();
for (const [index, food] of cohort.entries()) {
  const rawCandidates = await fdcSearch(searchQuery(food));
  const candidates = rawCandidates.map((candidate) => {
    const vector = nutrientVector(candidate);
    const identity = identityMatch(food, candidate);
    const stateMatch = stateMatches(food, candidate.description) && !ediblePortionConflicts(food, candidate.description);
    return {
      fdcId: candidate.fdcId,
      description: candidate.description,
      dataType: candidate.dataType,
      foodCategory: candidate.foodCategory ?? null,
      publicationDate: candidate.publishedDate ?? candidate.publicationDate ?? null,
      scientificName: candidate.scientificName ?? null,
      sourceState: sourceState(candidate.description),
      stateMatch,
      identityMatch: identity,
      requiredNutrientsPresent: macrosComplete(vector),
      nutrientVector: vector,
      portionEvidence: (candidate.foodMeasures?.length || candidate.finalFoodInputFoods?.length) ? 'USDA_PORTION_DATA_PRESENT' : 'USDA_100G_NUTRIENT_BASIS',
      sourceUrl: sourceUrl(candidate.fdcId),
    };
  });
  const selected = candidates
    .filter((candidate) => ['EXACT', 'BOTANICALLY_EQUIVALENT'].includes(candidate.identityMatch) && candidate.stateMatch && candidate.requiredNutrientsPresent)
    .sort((a, b) => rankDataType(a.dataType) - rankDataType(b.dataType) || a.fdcId - b.fdcId)[0] ?? null;
  const stateMismatch = candidates.some((candidate) => ['EXACT', 'BOTANICALLY_EQUIVALENT'].includes(candidate.identityMatch) && !candidate.stateMatch);
  const ambiguous = candidates.some((candidate) => ['COMMON_NAME_ONLY', 'AMBIGUOUS'].includes(candidate.identityMatch));
  const nutrientIncomplete = candidates.some((candidate) => ['EXACT', 'BOTANICALLY_EQUIVALENT'].includes(candidate.identityMatch) && candidate.stateMatch && !candidate.requiredNutrientsPresent);
  const duplicate = selected ? existingFdcIds.get(Number(selected.fdcId)) ?? null : null;
  const duplicateNewSelection = selected && !duplicate && selectedNewFdcIds.has(Number(selected.fdcId));
  const finalDecision = selected
    ? duplicate ? 'EXISTING_GOVERNED_IDENTITY_ALIAS' : duplicateNewSelection ? 'USDA_FOUND_IDENTITY_AMBIGUOUS' : 'READY_FOR_NEW_USDA_MAPPING'
    : nutrientIncomplete ? 'USDA_FOUND_NUTRIENTS_INCOMPLETE'
    : stateMismatch ? 'USDA_FOUND_STATE_MISMATCH'
    : ambiguous ? 'USDA_FOUND_IDENTITY_AMBIGUOUS'
    : 'USDA_NO_EXACT_RECORD';
  decisions.push({
    decisionId: `P0V1732B1_${String(index + 1).padStart(3, '0')}`,
    referenceItemId: food.referenceItemId,
    sourceRecordId: food.sourceRecordId,
    canonicalName: food.canonicalName,
    aliases: food.aliases,
    category: food.category,
    exactState: food.exactState,
    USDACandidates: candidates,
    selectedFdcId: selected?.fdcId ?? null,
    selectedDescription: selected?.description ?? null,
    dataType: selected?.dataType ?? null,
    identityMatch: selected?.identityMatch ?? (ambiguous ? 'AMBIGUOUS' : 'MISMATCH'),
    stateMatch: selected?.stateMatch ?? false,
    requiredNutrientsPresent: selected?.requiredNutrientsPresent ?? false,
    nutrientVector: selected?.nutrientVector ?? null,
    portionEvidence: selected?.portionEvidence ?? null,
    existingGovernedFoodId: duplicate,
    finalDecision,
    rationale: selected
      ? duplicate
        ? `USDA FDC ${selected.fdcId} is already governed as ${duplicate}; queue alias only.`
        : duplicateNewSelection
          ? `USDA FDC ${selected.fdcId} was already selected for another new mapping in this batch; duplicate governed source creation is blocked.`
          : `Selected USDA ${selected.dataType} record has exact/equivalent identity, matching ${food.exactState} state, and complete required macros.`
      : `No USDA candidate passed identity, state, and required macro gates for ${food.canonicalName}.`,
    processorVersion: PROCESSOR,
  });
  if (selected && !duplicate && !duplicateNewSelection) selectedNewFdcIds.add(Number(selected.fdcId));
}

const counts = decisions.reduce((out, item) => {
  out[item.finalDecision] = (out[item.finalDecision] ?? 0) + 1;
  return out;
}, {});
const decisionsArtifact = {
  schemaVersion: 'FITEATSY_FOOD_USDA_MAPPING_V17_32B1_DECISIONS',
  baselineSha: '635d662cfed7e32580d973bf3f0f313c4f500da1',
  processorVersion: PROCESSOR,
  decisionCount: decisions.length,
  decisionCounts: counts,
  generatedAt: '2026-09-07T00:00:00.000Z',
  decisions,
};
const queueItems = decisions
  .filter((decision) => ['READY_FOR_NEW_USDA_MAPPING', 'EXISTING_GOVERNED_IDENTITY_ALIAS'].includes(decision.finalDecision))
  .map((decision) => {
    const source = cohort.find((item) => item.referenceItemId === decision.referenceItemId);
    return {
      referenceItemId: decision.referenceItemId,
      selectedFdcId: decision.selectedFdcId,
      canonicalName: decision.canonicalName,
      existingGovernedFoodId: decision.existingGovernedFoodId,
      intendedOperationalUse: source.operationalUse,
      intendedRoles: source.targetRoles,
      exactState: decision.exactState,
      activationType: decision.finalDecision === 'EXISTING_GOVERNED_IDENTITY_ALIAS' ? 'ALIAS_EXISTING' : 'NEW_MAPPING',
    };
  });
const queue = {
  schemaVersion: 'FITEATSY_FOOD_USDA_ACTIVATION_QUEUE_V17_32B2',
  sourceProcessorVersion: PROCESSOR,
  sourceArtifact: 'food_usda_mapping_v17_32b1_decisions.json',
  queueCount: queueItems.length,
  generatedAt: '2026-09-07T00:00:00.000Z',
  records: queueItems,
};

writeFileSync(new URL('food_usda_mapping_v17_32b1_before.json', root), `${JSON.stringify(before, null, 2)}\n`);
const body = JSON.stringify(decisionsArtifact, null, 2);
writeFileSync(new URL('food_usda_mapping_v17_32b1_decisions.json', root), `${body}\n`);
writeFileSync(new URL('food_usda_activation_queue_v17_32b2.json', root), `${JSON.stringify(queue, null, 2)}\n`);
console.log(JSON.stringify({ decisionCount: decisions.length, decisionCounts: counts, queueCount: queueItems.length, artifactSha256: sha256(`${body}\n`), files: [path.basename(new URL('food_usda_mapping_v17_32b1_before.json', root).pathname), path.basename(new URL('food_usda_mapping_v17_32b1_decisions.json', root).pathname), path.basename(new URL('food_usda_activation_queue_v17_32b2.json', root).pathname)] }, null, 2));
