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
  assert.match(body, /const verifiedMatches = await listMealLibrarySlotsForTarget/);
  assert.match(body, /selectDiverseMealOptions\(verifiedMatches, usedIdentities\)/);
  assert.doesNotMatch(body, /buildCanonicalMealLibraryFallback\s*\(/);
  assert.doesNotMatch(body, /generated_template/);
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
