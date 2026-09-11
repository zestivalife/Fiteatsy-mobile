import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createPracticalReferenceFoods, practicalFoodMasterRows } from '../../backend/src/modules/nutrition/practical-indian-food-master.js';
import { generateMealCombinations, MEAL_HEADS, scaleNutrition, type ClientFoodContext, type MealHead, type MealTarget } from '../../backend/src/modules/nutrition/common-food-engine.js';
import { commonFoodCatalogue, commonFoodCatalogueMergeReport, governedCommonFoodCatalogue } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';
import { selectDayDiverseOptions } from '../../backend/src/modules/nutrition/common-food-day-diversity.js';

const status=JSON.parse(readFileSync(new URL('../../backend/src/modules/nutrition/food-master/data/fiteatsy-food-reference-status-v1.json',import.meta.url),'utf8'));
const aliases=JSON.parse(readFileSync(new URL('../../backend/src/modules/nutrition/food-master/data/fiteatsy-indian-food-aliases-v1.json',import.meta.url),'utf8'));
const targets:Record<MealHead,MealTarget>={EARLY_MORNING:{kcal:170,protein:10,kcalTolerance:100,proteinTolerance:20},BREAKFAST:{kcal:420,protein:26,kcalTolerance:250,proteinTolerance:25},MID_MORNING:{kcal:190,protein:10,kcalTolerance:120,proteinTolerance:20},LUNCH:{kcal:560,protein:34,kcalTolerance:350,proteinTolerance:30},EVENING_SNACK:{kcal:220,protein:14,kcalTolerance:160,proteinTolerance:20},DINNER:{kcal:470,protein:31,kcalTolerance:300,proteinTolerance:30},BEDTIME:{kcal:130,protein:8,kcalTolerance:100,proteinTolerance:20}};

test('335 workbook rows retain truthful practical reference status and finite standard macros',()=>{
  assert.equal(practicalFoodMasterRows.length,246);
  assert.equal(status.counts.workbook,335);
  assert.equal(status.counts.governed,89);
  assert.equal(status.counts.reference,246);
  assert.equal(status.counts.incomplete,0);
  assert.equal(status.foods.some((food:any)=>/LAB_VERIFIED|ICMR_APPROVED|FSSAI_VERIFIED/.test(food.verificationStatus)),false);
  for(const food of createPracticalReferenceFoods())for(const key of ['kcal','protein','carbohydrate','fat'])assert.ok(Number.isFinite(food.nutrientsPer100g[key as keyof typeof food.nutrientsPer100g]));
});

test('aliases and governed-wins consolidation preserve one canonical runtime identity',()=>{
  assert.equal(aliases.count,403);
  assert.ok(aliases.aliases.some((row:any)=>/bhindi/i.test(row.alias)&&/okra/i.test(row.canonicalName)));
  assert.equal(new Set(commonFoodCatalogue.map(food=>food.id)).size,commonFoodCatalogue.length);
  assert.equal(commonFoodCatalogue.filter(food=>food.id==='BATCH0_1').length,1);
});

test('combined catalogue is additive and preserves every governed representative',()=>{
  assert.equal(commonFoodCatalogueMergeReport.finalCanonicalTotal,commonFoodCatalogue.length);
  assert.equal(commonFoodCatalogueMergeReport.newReferenceInputTotal,createPracticalReferenceFoods().length);
  assert.equal(commonFoodCatalogueMergeReport.oldGovernedTotal+commonFoodCatalogueMergeReport.newNonDuplicateAdded,commonFoodCatalogue.length);
  assert.equal(commonFoodCatalogueMergeReport.duplicatesConsolidated+commonFoodCatalogueMergeReport.newNonDuplicateAdded,commonFoodCatalogueMergeReport.newReferenceInputTotal);
  const finalById=new Map(commonFoodCatalogue.map(food=>[food.id,food]));
  for(const governed of governedCommonFoodCatalogue){const retained=finalById.get(governed.id);assert.ok(retained,governed.id);assert.deepEqual(retained.nutrientsPer100g,governed.nutrientsPer100g,governed.id);assert.equal(retained.sourceMappingId,governed.sourceMappingId,governed.id);}
});

test('per-100-g values scale without approximation or fabricated nutrients',()=>{
  const food=createPracticalReferenceFoods().find(row=>row.nutrientsPer100g.fibre!==null)!;
  const scaled=scaleNutrition(food.nutrientsPer100g,37.5);
  assert.equal(scaled.kcal,food.nutrientsPer100g.kcal!*37.5/100);
  assert.equal(scaled.protein,food.nutrientsPer100g.protein!*37.5/100);
  assert.equal(scaled.fibre,food.nutrientsPer100g.fibre!*37.5/100);
});

for(const diet of ['VEGETARIAN','EGG','NON_VEGETARIAN'] as const)test(`${diet} retains the seven-by-five V5 planning contract with reference candidates`,()=>{
  const context:ClientFoodContext={diet,allergies:[],intolerances:[],avoids:[],clinicalExclusions:[],dislikes:[],preferences:[]};
  const candidates=MEAL_HEADS.map(mealHead=>({mealHead,options:generateMealCombinations({foods:commonFoodCatalogue,context,mealHead,target:targets[mealHead],limit:30,rankingV3:true,semanticV1:true}).options,required:5}));
  const selected=selectDayDiverseOptions({foods:commonFoodCatalogue,meals:candidates});
  assert.equal(selected.meals.length,7);
  assert.deepEqual(selected.meals.map(meal=>meal.options.length),[5,5,5,5,5,5,5]);
  assert.equal(new Set(selected.meals.flatMap(meal=>meal.options.map(option=>option.combinationId))).size,35);
  assert.ok(selected.meals.flatMap(meal=>meal.options).some(option=>option.components.some(component=>component.foodId.startsWith('BATCH0_'))));
});
