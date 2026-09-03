import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { commonFoodCatalogue } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';
import { generateMealCombinations, MEAL_HEADS, sumNutrition, validateManualCombination, type ClientFoodContext } from '../../backend/src/modules/nutrition/common-food-engine.js';

const vegetarian:ClientFoodContext={diet:'VEGETARIAN',allergies:[],intolerances:[],avoids:[],clinicalExclusions:[],dislikes:[],preferences:[]};
const target={kcal:300,protein:20,kcalTolerance:200,proteinTolerance:20};

test('v17.2 exposes assignment-aware catalogue, generation, validation, persistence and mutation routes',()=>{
 const source=readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.routes.ts',import.meta.url),'utf8');
 for(const route of ['/clients/:clientId/common-foods','/common-food/generate','/common-food/validate-option','/common-food/options/:optionId/components/:componentId','/common-food/options/:optionId/components/:componentId/serving']) assert.ok(source.includes(route),route);
 assert.ok(source.includes('expectedPlanVersionId'));
});

test('supported vegetarian generation is deterministic and never duplicate-pads',()=>{
 for(const mealHead of MEAL_HEADS){const a=generateMealCombinations({foods:commonFoodCatalogue,context:vegetarian,mealHead,target});const b=generateMealCombinations({foods:commonFoodCatalogue,context:vegetarian,mealHead,target});assert.deepEqual(a,b);assert.equal(new Set(a.options.map(x=>x.diversitySignature)).size,a.options.length);assert.ok(a.options.length<=5);}
});

test('manual validation recalculates authoritative component nutrition',()=>{
 const food=commonFoodCatalogue.find(f=>f.mealHeads.includes('BREAKFAST')&&f.vegetarianClass!=='EGG'&&f.vegetarianClass!=='NON_VEGETARIAN')!;
 const serving=food.servings[0];const result=validateManualCombination({foods:commonFoodCatalogue,context:vegetarian,mealHead:'BREAKFAST',target,components:[{foodId:food.id,servingId:serving.id,multiplier:1}]});
 assert.deepEqual(result.nutrition,sumNutrition(result.components.map(x=>x.nutrition)));
});

test('allergy, intolerance and avoid restrictions fail closed',()=>{
 const food=commonFoodCatalogue.find(f=>f.mealHeads.includes('BREAKFAST'))!; const serving=food.servings[0];
 for(const context of [{...vegetarian,allergies:[...food.allergens,food.id]},{...vegetarian,intolerances:[...food.intolerances,food.id]},{...vegetarian,avoids:[...food.avoidTags,food.id]}]){
   const patched=commonFoodCatalogue.map(x=>x.id===food.id?{...x,allergens:context.allergies,intolerances:context.intolerances,avoidTags:context.avoids}:x);
   assert.throws(()=>validateManualCombination({foods:patched,context,mealHead:'BREAKFAST',target,components:[{foodId:food.id,servingId:serving.id,multiplier:1}]}),/UNSAFE_OR_INELIGIBLE_FOOD/);
 }
});

test('invalid serving and multiplier are rejected',()=>{const food=commonFoodCatalogue.find(f=>f.mealHeads.includes('BREAKFAST'))!;assert.throws(()=>validateManualCombination({foods:commonFoodCatalogue,context:{...vegetarian,diet:'NON_VEGETARIAN'},mealHead:'BREAKFAST',target,components:[{foodId:food.id,servingId:'missing',multiplier:1}]}),/SERVING_NOT_FOUND/);assert.throws(()=>validateManualCombination({foods:commonFoodCatalogue,context:{...vegetarian,diet:'NON_VEGETARIAN'},mealHead:'BREAKFAST',target,components:[{foodId:food.id,servingId:food.servings[0].id,multiplier:99}]}),/INVALID_SERVING_MULTIPLIER/);});

test('v17.2 migration is additive and preserves immutable 0049',()=>{const sql=readFileSync(new URL('../../backend/src/db/migrations/0050_common_food_runtime_integration.sql',import.meta.url),'utf8');assert.match(sql,/alter table common_food_generation_runs/);assert.match(sql,/diet_plan_combination_reload_idx/);});
