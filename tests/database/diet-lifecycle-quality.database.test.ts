import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { pool } from '../../backend/src/db/pool.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';
import { createCareCaseIfMissing } from '../../backend/src/modules/platform/platform.store.js';
import { NUTRITION_MEAL_SEQUENCE, type NutritionMealSlot, type NutritionPlanContent, type NutritionPlanSourceSnapshot } from '../../backend/src/modules/platform/platform.types.js';
import {
  createDietPlanDraftVersion,
  createOrUpdateDietPlanDraft,
  getCurrentDietPlanVersion,
  getDietPlanById,
  listDietPlanReviewQueue,
  updateDietPlanLifecycle,
} from '../../backend/src/modules/nutrition/nutrition.store.js';
import { listMealLibrarySlotsForTarget } from '../../backend/src/modules/nutrition/nutrition.library.store.js';
import { assertDietPlanReviewContentComplete } from '../../backend/src/modules/nutrition/nutrition.service.js';
import { generateDietPlanDocument, readGeneratedDietPlanDocumentXml } from '../../backend/src/modules/nutrition/nutrition.document.js';

const mealLabels: Record<(typeof NUTRITION_MEAL_SEQUENCE)[number], string> = {
  earlyMorning: 'Early Morning', breakfast: 'Breakfast', midMorningSnack: 'Mid-Morning', lunch: 'Lunch',
  eveningSnack: 'Evening Snack', dinner: 'Dinner', bedtimeNutrition: 'Bedtime',
};

const countOptions = (content: NutritionPlanContent) =>
  NUTRITION_MEAL_SEQUENCE.reduce((total, key) => total + content.mealPlan[key].options.length, 0);

const optionIds = (content: NutritionPlanContent) =>
  NUTRITION_MEAL_SEQUENCE.flatMap((key) => content.mealPlan[key].options.map((option) => option.id as string));

const snapshot: NutritionPlanSourceSnapshot = {
  bmi: 22, weightKg: 64, biomarkers: [], healthProfile: {}, calorieTarget: 1800, proteinTargetGrams: 80,
  hydrationTargetLiters: 2.5,
  wellnessScores: { nourishment: 80, energyBalance: 80, bodySupport: 80, recovery: 80, activePerformance: 80, physicalWellnessIndex: 80, stressResilience: 80 },
  stressAssessment: null, generatedAtISO: '2026-09-02T00:00:00.000Z',
};

test('database preserves exact 35-option identity through review, revision, approval and DOCX', async () => {
  await resetBackendStateForTests();
  const clientUserId = crypto.randomUUID();
  const consultantId = crypto.randomUUID();
  const seniorId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const publicClientId = `fc_diet_${Date.now()}`;
  const healthProfileId = crypto.randomUUID();
  await pool.query(
    `insert into users (id, name, email_normalized, role) values
      ($1, 'Diet Test Client', $4, 'client'),
      ($2, 'Diet Test Consultant', $5, 'consultant'),
      ($3, 'Diet Test Senior', $6, 'senior_consultant')`,
    [clientUserId, consultantId, seniorId, `${clientUserId}@example.test`, `${consultantId}@example.test`, `${seniorId}@example.test`],
  );
  await pool.query(
    `insert into fiteatsy_clients (id, fiteatsy_client_id, account_user_id) values ($1, $2, $3)`,
    [clientId, publicClientId, clientUserId],
  );
  await pool.query(
    `insert into health_profiles (id, user_id, client_id, gender, diet_type) values ($1, $2, $3, 'Female', 'vegetarian')`,
    [healthProfileId, clientUserId, clientId],
  );
  const careCase = await createCareCaseIfMissing({ clientId, accountId: clientUserId }, healthProfileId);

  const ingredientId = crypto.randomUUID();
  await pool.query(
    `insert into nutrition_foods
      (id, canonical_name, display_name, reference_quantity, reference_unit, calories, protein_grams, carbohydrate_grams, fat_grams, fibre_grams, dietary_tags, verification_status, status)
     values ($1, 'raw garlic', 'Raw Garlic', 100, 'g', 149, 6.4, 33, 0.5, 2.1, '{vegetarian}', 'verified', 'active')`,
    [ingredientId],
  );

  const seededIds = new Map<string, string[]>();
  for (const mealKey of NUTRITION_MEAL_SEQUENCE) {
    const ids: string[] = [];
    for (let index = 1; index <= (mealKey === 'breakfast' ? 6 : 5); index += 1) {
      const variantId = crypto.randomUUID();
      const componentId = crypto.randomUUID();
      ids.push(variantId);
      const name = `${mealLabels[mealKey]} Verified Meal ${index}`;
      const calories = 150 + index * 10;
      const protein = 8 + index;
      await pool.query(
        `insert into nutrition_meal_variants
          (id, meal_key, variant_name, description, household_label, dietary_tags, nutrition_totals, source_metadata, verification_status, status)
         values ($1, $2, $3, 'Prepared verified meal variant', '1 bowl', '{vegetarian}', $4::jsonb, '{"recordType":"meal_variant"}'::jsonb, 'verified', 'active')`,
        [variantId, mealKey, name, JSON.stringify({ calories, proteinGrams: protein, carbsGrams: 20, fatGrams: 5, fibreGrams: 4 })],
      );
      await pool.query(
        `insert into nutrition_meal_variant_components
          (id, meal_variant_id, food_id, component_name, quantity, quantity_unit, household_label, canonical_grams, locked, nutrition_totals, sort_order)
         values ($1, $2, $3, $4, 1, 'bowl', '1 bowl', 180, true, $5::jsonb, 1)`,
        [componentId, variantId, ingredientId, name, JSON.stringify({ calories, proteinGrams: protein, carbsGrams: 20, fatGrams: 5, fibreGrams: 4 })],
      );
    }
    seededIds.set(mealKey, ids);
  }

  const mealPlanEntries: Array<[string, NutritionPlanContent['mealPlan'][keyof NutritionPlanContent['mealPlan']]]> = [];
  for (const mealKey of NUTRITION_MEAL_SEQUENCE) {
    const candidates = await listMealLibrarySlotsForTarget({ mealKey, target: undefined, consultantId, dietPreference: 'vegetarian', includeOutsideTarget: true, limit: 10 });
    assert.equal(candidates.some((candidate) => candidate.id === `food:${ingredientId}`), false);
    assert.equal(candidates.length, mealKey === 'breakfast' ? 6 : 5);
    mealPlanEntries.push([mealKey, { window: `${mealLabels[mealKey]} window`, focus: mealLabels[mealKey], options: candidates.slice(0, 5) }]);
  }
  const content = {
    nutritionSnapshot: { client: 'Diet Test Client', age: 35, gender: 'Female', goals: ['Health'], healthConditions: [], dietPreference: 'vegetarian', allergies: [], lifestyleSummary: 'Synthetic', personalisedPlanFocus: 'Lifecycle verification', programmeName: 'Test Programme', preparedBy: 'Diet Test Consultant' },
    dailyTargets: { calories: 1800, protein: 80, hydration: 2.5, movement: '30 minutes' },
    mealPlan: Object.fromEntries(mealPlanEntries), hydrationRhythm: [], weeklySuccessGuide: [], smartSubstitutions: [], supplementsAndClinicalNotes: [],
  } as NutritionPlanContent;
  assert.equal(countOptions(content), 35);
  assertDietPlanReviewContentComplete(content);
  const originalIds = optionIds(content);

  const saved = await createOrUpdateDietPlanDraft({ careCaseId: careCase.id, userId: clientUserId, consultantId, readinessScore: 100, templateVersion: 'diet-lifecycle-v1-test', sourceSnapshot: snapshot, content, contentSummary: { calories: 1800, protein: 80, hydration: 2.5, focusAreas: [] }, generatedBy: consultantId });
  const persisted = await getCurrentDietPlanVersion(saved.plan.id);
  assert.ok(persisted);
  assert.equal(countOptions(persisted.content), 35);
  assert.deepEqual(optionIds(persisted.content), originalIds);

  const submitted = await updateDietPlanLifecycle({ dietPlanId: saved.plan.id, consultantId, lifecycle: 'submitted_for_review', currentVersionId: persisted.id, reviewEventType: 'submitted_for_review', sourceSnapshot: snapshot });
  assert.equal(countOptions(submitted!.version!.content), 35);
  const seniorQueue = await listDietPlanReviewQueue();
  const seniorReview = seniorQueue.find((item) => item.dietPlanId === saved.plan.id)!;
  assert.ok(seniorReview);
  assert.equal(seniorReview.version.id, persisted.id);
  assert.deepEqual(optionIds(seniorReview.version.content as NutritionPlanContent), originalIds);

  await updateDietPlanLifecycle({ dietPlanId: saved.plan.id, consultantId: seniorId, lifecycle: 'changes_requested', currentVersionId: persisted.id, reviewEventType: 'changes_requested', reviewComment: 'Replace one breakfast option.', sourceSnapshot: snapshot });
  const restored = await getCurrentDietPlanVersion(saved.plan.id);
  const restoredPlan = await getDietPlanById(saved.plan.id);
  assert.deepEqual(optionIds(restored!.content), originalIds);
  assert.equal(restoredPlan!.reviewComment, 'Replace one breakfast option.');

  const revisedContent = structuredClone(restored!.content);
  const replacementCandidates = await listMealLibrarySlotsForTarget({ mealKey: 'breakfast', target: undefined, consultantId, dietPreference: 'vegetarian', includeOutsideTarget: true, limit: 10 });
  const replacement = replacementCandidates.find((candidate) => !originalIds.includes(candidate.id!))!;
  revisedContent.mealPlan.breakfast.options[0] = { ...replacement, slot: 1 };
  assertDietPlanReviewContentComplete(revisedContent);
  const revisedIds = optionIds(revisedContent);
  assert.equal(originalIds.filter((id) => revisedIds.includes(id)).length, 34);
  const revision = await createDietPlanDraftVersion({ dietPlanId: saved.plan.id, content: revisedContent, contentSummary: { calories: 1800, protein: 80, hydration: 2.5, focusAreas: [] }, sourceSnapshot: snapshot, generatedBy: consultantId, reviewNotes: 'One requested replacement.' });
  assert.ok(revision);
  await updateDietPlanLifecycle({ dietPlanId: saved.plan.id, consultantId, lifecycle: 'submitted_for_review', currentVersionId: revision!.version.id, reviewEventType: 'resubmitted', sourceSnapshot: snapshot });
  const revisedSenior = (await listDietPlanReviewQueue()).find((item) => item.dietPlanId === saved.plan.id)!;
  assert.deepEqual(optionIds(revisedSenior.version.content as NutritionPlanContent), revisedIds);

  const approved = await updateDietPlanLifecycle({ dietPlanId: saved.plan.id, consultantId: seniorId, lifecycle: 'approved', currentVersionId: revision!.version.id, approvedBy: seniorId, reviewEventType: 'approved', sourceSnapshot: snapshot });
  assert.deepEqual(optionIds(approved!.version!.content), revisedIds);
  const document = await generateDietPlanDocument(approved!.plan, approved!.version!);
  const xml = await readGeneratedDietPlanDocumentXml(document.outputPath);
  const positions = revisedContent.mealPlan[NUTRITION_MEAL_SEQUENCE[0]].options.map(() => 0);
  for (const mealKey of NUTRITION_MEAL_SEQUENCE) assert.match(xml, new RegExp(mealLabels[mealKey].replace('-', '[-–]?'), 'i'));
  let previousPosition = -1;
  for (const mealKey of NUTRITION_MEAL_SEQUENCE) {
    for (const option of revisedContent.mealPlan[mealKey].options) {
      const position = xml.indexOf(option.meal);
      assert.ok(position > previousPosition, `${option.meal} must appear once and in approved order`);
      previousPosition = position;
      assert.match(xml, new RegExp(option.portion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(xml, new RegExp(`${option.approxKcal} kcal`));
      assert.match(xml, new RegExp(`${option.proteinGrams} g`));
    }
  }
  assert.equal(positions.length, 5);
  await unlink(document.outputPath);

  const incomplete = structuredClone(revisedContent);
  incomplete.mealPlan.dinner.options.pop();
  assert.throws(() => assertDietPlanReviewContentComplete(incomplete), /exactly 5/);
  const rawIngredient = structuredClone(revisedContent);
  rawIngredient.mealPlan.lunch.options[0] = { ...rawIngredient.mealPlan.lunch.options[0], id: `food:${ingredientId}` };
  assert.throws(() => assertDietPlanReviewContentComplete(rawIngredient), /client-consumable/);
  const duplicate = structuredClone(revisedContent);
  duplicate.mealPlan.bedtimeNutrition.options[1] = { ...duplicate.mealPlan.bedtimeNutrition.options[0], slot: 2 };
  assert.throws(() => assertDietPlanReviewContentComplete(duplicate), /duplicate/);
});
