import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const serviceSource = readFileSync(
  resolve(repositoryRoot, 'backend/src/modules/nutrition/nutrition.service.ts'),
  'utf8',
);
const nutritionContract = readFileSync(
  resolve(repositoryRoot, 'docs/11_DECISIONS_AND_GOVERNANCE/FITEATSY_NUTRITION_INTELLIGENCE_FROZEN_CONTRACT.md'),
  'utf8',
);
const lifecycleContract = readFileSync(
  resolve(repositoryRoot, 'docs/11_DECISIONS_AND_GOVERNANCE/FITEATSY_CLIENT_LIFECYCLE_FROZEN_CONTRACT.md'),
  'utf8',
);

const functionBody = (name: string, nextName: string) => {
  const start = serviceSource.indexOf(name);
  const end = serviceSource.indexOf(nextName, start + name.length);
  assert.notEqual(start, -1, `${name} must remain present`);
  assert.notEqual(end, -1, `${nextName} must delimit ${name}`);
  return serviceSource.slice(start, end);
};

test('active catalogue enrichment uses verified matches and contains no fallback invocation', () => {
  const body = functionBody('const enrichMealPlanWithLibraryMatches', 'const foodPreferenceSearchText');
  assert.match(body, /COMPATIBLE_MEAL_LIBRARY_KEYS\[mealKey\]/);
  assert.match(body, /listMealLibrarySlotsForTarget/);
  assert.match(body, /includeOutsideTarget:\s*true/);
  assert.match(body, /selectDiverseMealOptions\(verifiedMatches, usedIdentities\)/);
  assert.doesNotMatch(body, /buildCanonicalMealLibraryFallback\s*\(/);
  assert.doesNotMatch(body, /generated_template/);
});

test('meal-library selection never falls back to raw nutrition food records', () => {
  const library = readFileSync(resolve(repositoryRoot, 'backend/src/modules/nutrition/nutrition.library.store.ts'), 'utf8');
  const selection = library.slice(library.indexOf('export const listMealLibrarySlotsForTarget'));
  assert.doesNotMatch(selection, /listVerifiedFoodMasterRecords\(\)/);
  assert.doesNotMatch(selection, /id:\s*`food:/);
  assert.match(selection, /hasCanonicalServing/);
  assert.match(selection, /hasRequiredNutrition/);
});

test('DOCX export resolves only approved content and validates completeness before generation', () => {
  const service = readFileSync(resolve(repositoryRoot, 'backend/src/modules/nutrition/nutrition.service.ts'), 'utf8');
  const resolver = service.slice(service.indexOf('const getLatestDownloadableDietPlanVersion'), service.indexOf('const summarizeLifestyle'));
  const exporter = service.slice(service.indexOf('export const exportConsultantDietPlanDocument'), service.indexOf('export const logNutritionMealConsumption'));
  assert.match(resolver, /\['approved', 'published'\]/);
  assert.match(exporter, /assertDietPlanReviewContentComplete\(version\.content\)/);
  assert.match(exporter, /generateDietPlanDocument\(plan, version\)/);
});

test('review, approval and publish retain the canonical completeness gate', () => {
  for (const name of [
    'submitConsultantDietPlanForReview',
    'approveConsultantDietPlan',
    'publishConsultantDietPlan',
  ]) {
    const start = serviceSource.indexOf(`export const ${name}`);
    assert.notEqual(start, -1, `${name} must remain present`);
    const body = serviceSource.slice(start, start + 9000);
    assert.match(body, /assertDietPlanReviewContentComplete\(/, `${name} must validate review content`);
  }
});

test('frozen governance records preserve both contract identities and pending Nutrition acceptance', () => {
  assert.match(lifecycleContract, /FITEATSY-CLIENT-LIFECYCLE-CONTRACT-v1/);
  assert.match(lifecycleContract, /70e8da925bd887071d39909de75828818f584baf/);
  assert.match(nutritionContract, /FITEATSY-NUTRITION-INTELLIGENCE-CONTRACT-v1/);
  assert.match(nutritionContract, /ARCHITECTURE FREEZE ACTIVE/);
  assert.match(nutritionContract, /PRODUCTION FUNCTIONAL ACCEPTANCE PENDING CATALOGUE \+ ENV-C \+ REAL CLIENT/);
  assert.match(nutritionContract, /Consumption and water events are immutable actuals\/projections separate from plan content/);
});
