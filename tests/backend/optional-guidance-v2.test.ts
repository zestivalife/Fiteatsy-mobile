import assert from 'node:assert/strict';
import test from 'node:test';
import type { NutritionGuidanceItem, NutritionPlanContent, OptionalNutritionGuidance } from '../../backend/src/modules/platform/platform.types.js';
import type { FoodMasterRecord } from '../../backend/src/modules/nutrition/meal-engine.js';
import { OptionalGuidanceContractError, validateOptionalGuidanceV2 } from '../../backend/src/modules/nutrition/optional-guidance-contract.js';

const food = (overrides: Partial<FoodMasterRecord> = {}): FoodMasterRecord => ({
  id: 'food-1', canonicalName: 'Oats', displayName: 'Oats', referenceQuantity: 40, referenceUnit: 'g',
  calories: 150, proteinGrams: 5, carbsGrams: 27, fatGrams: 3, fibreGrams: 4,
  dietaryTags: ['vegetarian', 'vegan'], allergenTags: [], verificationStatus: 'verified', ...overrides,
});

const item = (overrides: Partial<NutritionGuidanceItem> = {}): NutritionGuidanceItem => ({
  id: 'guidance-1', foodId: 'food-1', name: 'Oats', servingLabel: '40 g', quantity: 40, unit: 'g',
  nutrition: { calories: 150, protein: 5, carbs: 27, fat: 3, fibre: 4 },
  category: 'what_can_i_eat_now', cuisineTags: [], cravingTags: [], mealTags: ['breakfast'], timeWindowTags: [],
  dietaryTags: ['vegetarian'], restrictionTags: [], reason: 'Verified option for the current plan.', planMembership: false,
  clinicallyReviewed: true, displayOrder: 1, enabled: true, source: 'verified_catalogue', ...overrides,
});

const guidance = (items: NutritionGuidanceItem[] = []): OptionalNutritionGuidance => ({
  schemaVersion: 1, generatedBy: 'consultant', generatedAtISO: '2026-08-25T00:00:00.000Z',
  updatedBy: 'consultant', updatedAtISO: '2026-08-25T00:00:00.000Z', reviewedBy: null, reviewedAtISO: null,
  whatCanIEatNow: items,
  eatingOut: { northIndian: [], southIndian: [], chinese: [], continental: [], fastFood: [] },
  cravings: { sweet: [], salty: [], crunchy: [], spicy: [] },
});

const content = (optionalGuidance?: OptionalNutritionGuidance): NutritionPlanContent => ({
  nutritionSnapshot: { client: 'QA Client', age: 30, gender: 'female', goals: [], healthConditions: [], dietPreference: 'vegetarian', allergies: [], lifestyleSummary: '', personalisedPlanFocus: '', programmeName: '', preparedBy: '' },
  dailyTargets: { calories: 1800, protein: 90, hydration: 2.5, movement: '' }, optionalGuidance,
} as NutritionPlanContent);

const compatibility = { dietPreference: 'vegetarian', allergyTags: [] as string[], medicalRestrictions: [] as string[], avoidedFoods: [] as string[], avoidedFoodIds: [] as string[] };
const validate = (plan: NutritionPlanContent, foods: FoodMasterRecord[] = [food()], overrides = {}) =>
  validateOptionalGuidanceV2({ content: plan, verifiedActiveFoods: foods, compatibility: { ...compatibility, ...overrides }, requireReviewed: true });
const expectCode = (code: string, action: () => unknown) => assert.throws(action, (error) => error instanceof OptionalGuidanceContractError && error.code === code);

test('valid core plan with no Optional Guidance passes', () => assert.equal(validate(content()), null));
test('all nine Optional Guidance categories may be empty', () => assert.doesNotThrow(() => validate(content(guidance()))));
test('an applicable category with no verified options remains non-blocking', () => assert.doesNotThrow(() => validate(content(guidance()), [])));
test('verified active and compatible Optional Guidance passes', () => assert.doesNotThrow(() => validate(content(guidance([item()])))));
test('missing food ID fails', () => expectCode('OPTIONAL_GUIDANCE_UNRESOLVED', () => validate(content(guidance([item({ foodId: null })])))));
test('missing or non-finite macros fail', () => {
  expectCode('OPTIONAL_GUIDANCE_UNRESOLVED', () => validate(content(guidance([item({ nutrition: { calories: NaN, protein: 5, carbs: 27, fat: 3, fibre: 4 } })]))));
  expectCode('OPTIONAL_GUIDANCE_UNRESOLVED', () => validate(content(guidance([item({ nutrition: { calories: 150, protein: 5, carbs: 27, fat: 3, fibre: undefined as unknown as number } })]))));
});
test('unverified, inactive, or absent canonical food fails', () => {
  expectCode('OPTIONAL_GUIDANCE_NOT_VERIFIED', () => validate(content(guidance([item()])), [food({ verificationStatus: 'seed' })]));
  expectCode('OPTIONAL_GUIDANCE_NOT_VERIFIED', () => validate(content(guidance([item()])), []));
});
test('medical and allergy restrictions override guidance', () => expectCode('OPTIONAL_GUIDANCE_MEDICALLY_INCOMPATIBLE', () => validate(content(guidance([item()])), [food({ allergenTags: ['diabetes'] })], { medicalRestrictions: ['Diabetes'] })));
test('Foods to Avoid blocks guidance by canonical ID or name', () => {
  expectCode('OPTIONAL_GUIDANCE_FOOD_AVOIDED', () => validate(content(guidance([item()])), [food()], { avoidedFoodIds: ['food-1'] }));
  expectCode('OPTIONAL_GUIDANCE_FOOD_AVOIDED', () => validate(content(guidance([item()])), [food()], { avoidedFoods: ['oats'] }));
});
test('eating-style incompatible guidance fails', () => expectCode('OPTIONAL_GUIDANCE_EATING_STYLE_INCOMPATIBLE', () => validate(content(guidance([item()])), [food({ dietaryTags: ['non-vegetarian'] })])));
test('unreviewed enabled guidance cannot publish', () => expectCode('OPTIONAL_GUIDANCE_NOT_REVIEWED', () => validate(content(guidance([item({ clinicallyReviewed: false })])))));
test('disabled draft candidates are not supplied to the client contract', () => assert.doesNotThrow(() => validate(content(guidance([item({ enabled: false, foodId: null })])), [])));
