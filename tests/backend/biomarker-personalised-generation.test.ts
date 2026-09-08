import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveBiomarkerGeneration, scoreGovernedBiomarkerRules } from '../../backend/src/modules/nutrition/biomarker-generation.js';
import { generateMealCombinations, type CommonFood, type ClientFoodContext, type MealComponent } from '../../backend/src/modules/nutrition/common-food-engine.js';

const component = (foodId: string): MealComponent => ({
  componentId: foodId, foodId, foodVersion: 1, foodDisplayNameSnapshot: foodId,
  servingId: `${foodId}-serving`, servingVersion: 1, servingDisplayNameSnapshot: '100 g',
  multiplier: 1, grams: 100, millilitres: null, label: '100 g', sourceType: 'COMMON_FOOD',
  sourceMappingId: foodId, nutrition: { kcal: 100, protein: 5, carbohydrate: 10, fat: 2, fibre: 3 }
});

const marker = (name: string, clinicalStatus: 'HIGH' | 'LOW' | 'NORMAL') => ({
  biomarkerId: name, name, canonicalMarkerName: name, rawMarkerName: name, sourceReportId: 'report-a',
  value: 10, unit: 'test-unit', validationStatus: 'VALIDATED', clinicalStatus, referenceRange: '1-9', confidence: 1,
  testDate: '2026-09-01', comparisonStatus: 'NO_PRIOR' as const, previousValue: null, previousUnit: null,
  previousReferenceRange: null, previousClinicalStatus: null, previousSourceReportId: null, previousTestDate: null,
  source: { type: 'lab_report' as const, label: 'Lab Report' as const, reportId: 'report-a', reportDate: '2026-09-01', labName: null, fileName: null },
  createdAtISO: '2026-09-01T00:00:00.000Z', history: []
});

test('only the existing governed high-glucose protein/fibre rule changes generation scoring', () => {
  const high = resolveBiomarkerGeneration([marker('HbA1c', 'HIGH')]);
  const normal = resolveBiomarkerGeneration([marker('HbA1c', 'NORMAL')]);
  const displayOnly = resolveBiomarkerGeneration([marker('Vitamin D', 'LOW')]);
  assert.deepEqual(high.activeRules, ['GLUCOSE_PROTEIN_FIBRE_PAIRING']);
  assert.deepEqual(normal.activeRules, []);
  assert.equal(displayOnly.snapshot[0]?.generationEffect, 'ADVISORY_ONLY');
  assert.equal(scoreGovernedBiomarkerRules({ rules: high.activeRules, components: [component('pulse')], nutrition: { kcal: 100, protein: 8, carbohydrate: 10, fat: 2, fibre: 4 } }).adjustment, 8);
  assert.equal(scoreGovernedBiomarkerRules({ rules: normal.activeRules, components: [component('pulse')], nutrition: { kcal: 100, protein: 8, carbohydrate: 10, fat: 2, fibre: 4 } }).adjustment, 0);
});

const food = (id: string, aliases: string[]): CommonFood => ({
  id, version: 1, canonicalCode: id, canonicalName: id, displayName: id, foodType: 'COMMON_FOOD', family: id,
  category: 'fruit', countryContext: 'INDIA', isIndianSpecificFood: true, sourcePolicyClass: 'INDIA_AUTHORITATIVE',
  sourceMappingId: id, sourceVersion: '1', vegetarianClass: 'VEGAN', dietTags: [], allergens: [], intolerances: [],
  clinicalTags: [], avoidTags: [], mealHeads: ['EARLY_MORNING'], roles: ['FRUIT'],
  nutrientsPer100g: { kcal: 100, protein: 2, carbohydrate: 20, fat: 1, fibre: 3 },
  servings: [{ id: `${id}-s`, version: 1, label: '100 g', grams: 100, millilitres: null, unit: 'gram', isDefault: true, minMultiplier: 1, maxMultiplier: 1, allowedMultipliers: [1], active: true }],
  active: true, clientConsumable: true, generatorEligible: true, aliases
});

test('canonical likes and dislikes affect deterministic candidate ranking without weakening eligibility', () => {
  const foods = [food('Apple', ['apple']), food('Orange', ['orange'])];
  const context = (preferences: string[], dislikes: string[]): ClientFoodContext => ({ diet: 'VEGAN', allergies: [], intolerances: [], avoids: [], clinicalExclusions: [], preferences, dislikes });
  const run = (ctx: ClientFoodContext) => generateMealCombinations({ foods, context: ctx, mealHead: 'EARLY_MORNING', target: { kcal: 100, protein: 2, kcalTolerance: 20, proteinTolerance: 2 }, limit: 2, rankingV3: true }).options;
  const apple = run(context(['APPLE'], []));
  const orange = run(context(['orange'], ['apple']));
  assert.equal(apple[0]?.components[0]?.foodId, 'Apple');
  assert.equal(orange[0]?.components[0]?.foodId, 'Orange');
  assert.deepEqual(run(context(['APPLE'], [])), apple);
});

test('production generation context loads biomarkers by the resolved client identities and exposes no cross-client fallback', () => {
  const service = readFileSync(new URL('../../backend/src/modules/nutrition/common-food-consultant.service.ts', import.meta.url), 'utf8');
  const repository = readFileSync(new URL('../../backend/src/modules/consultants/consultants.repository.ts', import.meta.url), 'utf8');
  assert.match(service, /listValidatedBiomarkerSummaryForClient\(registered\.internalClientId,registered\.accountId\)/);
  assert.match(service, /previousPlanContext:\{scope:'SAME_CLIENT_ONLY'/);
  assert.match(repository, /where bo\.client_id = \$1[\s\S]*and bo\.user_id = \$2/);
  assert.match(service, /biomarkerRules:biomarkerGeneration\.activeRules/);
  assert.match(service, /inputHash:canonicalHash\(\{engineInputHash:source\.result\.inputHash,generationSnapshot:resolved\.generationSnapshot\}\)/);
});
