import test from 'node:test';
import assert from 'node:assert/strict';
import { FOOD_KNOWLEDGE_FIXTURE_MANIFEST } from '../../backend/src/modules/nutrition/food-knowledge/food-knowledge.fixture.js';
import { scaleNutrientsForServing, sha256, validateFoodKnowledgeManifest } from '../../backend/src/modules/nutrition/food-knowledge/food-knowledge.validation.js';

const clone = () => structuredClone(FOOD_KNOWLEDGE_FIXTURE_MANIFEST);

test('fixture validates canonical identity, extensible nutrition, provenance and eligibility', () => {
  const result = validateFoodKnowledgeManifest(clone());
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, true);
});

test('unknown nutrients remain null and serving scaling is deterministic', () => {
  assert.deepEqual(scaleNutrientsForServing({ energy_kcal: 100, vitamin_d_mcg: null }, 150), { energy_kcal: 150, vitamin_d_mcg: null });
  assert.deepEqual(scaleNutrientsForServing({ protein_g: 7.25 }, 40), { protein_g: 2.9 });
});

test('validator blocks ingredient-only Diet eligibility and missing core Nutrition', () => {
  const manifest = clone();
  manifest.foods[0].clientConsumable = true;
  manifest.foods[0].version.productionEligible = true;
  manifest.foods[4].version.nutrients.protein_g = null;
  const codes = validateFoodKnowledgeManifest(manifest).issues.map((issue) => issue.code);
  assert.ok(codes.includes('INGREDIENT_CLIENT_CONSUMABLE'));
  assert.ok(codes.includes('INGREDIENT_DIET_ELIGIBLE'));
  assert.ok(codes.includes('MISSING_CORE_NUTRITION'));
  assert.ok(codes.includes('FALSE_COMPLETE_NUTRITION'));
});

test('validator blocks unapproved licence provenance for production eligibility', () => {
  const manifest = clone();
  manifest.sources[0].licenceStatus = 'UNKNOWN_BLOCKED';
  const issues = validateFoodKnowledgeManifest(manifest).issues.filter((issue) => issue.code === 'BLOCKED_LICENCE');
  assert.equal(issues.length, manifest.foods.filter((food) => food.version.productionEligible).length);
});

test('validator detects composition self-reference and cycles', () => {
  const manifest = clone();
  manifest.foods[0].version.components.push({ id: '90000000-0000-4000-8000-000000000001', foodId: manifest.foods[0].id, role: 'PRIMARY', grams: null });
  const codes = validateFoodKnowledgeManifest(manifest).issues.map((issue) => issue.code);
  assert.ok(codes.includes('SELF_COMPONENT'));
  assert.ok(codes.includes('COMPOSITION_CYCLE'));
});

test('fixture encodes exact Bhindi, soy, dairy, cuisine and context boundaries', () => {
  const foods = new Map(FOOD_KNOWLEDGE_FIXTURE_MANIFEST.foods.map((food) => [food.canonicalCode, food]));
  const bhindi = foods.get('BHINDI_SABJI');
  const bhindiAloo = foods.get('BHINDI_ALOO');
  const potatoId = foods.get('POTATO_RAW')?.id;
  assert.notEqual(bhindi?.id, bhindiAloo?.id);
  assert.equal(bhindi?.familyId, bhindiAloo?.familyId);
  assert.equal(bhindi?.version.components.some((item) => item.foodId === potatoId), false);
  assert.equal(bhindiAloo?.version.components.some((item) => item.foodId === potatoId), true);
  assert.equal(foods.get('GARLIC_RAW')?.version.productionEligible, false);
  assert.equal(foods.get('TOFU')?.familyId, FOOD_KNOWLEDGE_FIXTURE_MANIFEST.families.find((family) => family.code === 'SOY_PROTEIN')?.id);
  assert.notEqual(foods.get('PANEER')?.familyId, foods.get('TOFU')?.familyId);
  assert.deepEqual(['MILK', 'CURD', 'PANEER'].map((code) => foods.get(code)?.id).filter(Boolean).length, 3);
  assert.ok(foods.get('IDLI')?.version.cuisines.includes('SOUTH_INDIAN'));
  assert.ok(foods.get('ROASTED_CHANA')?.version.contextTags.includes('CRUNCHY'));
  assert.ok(foods.get('SHRIKHAND')?.version.contextTags.includes('SWEET'));
});

test('manifest hashing is deterministic and sensitive to factual drift', () => {
  const first = clone();
  const reordered = structuredClone(first);
  reordered.sources[0] = { ...reordered.sources[0] };
  assert.equal(sha256(first), sha256(reordered));
  reordered.foods[4].version.nutrients.energy_kcal = 97;
  assert.notEqual(sha256(first), sha256(reordered));
});
