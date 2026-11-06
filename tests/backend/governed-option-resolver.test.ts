import assert from 'node:assert/strict';
import test from 'node:test';
import { CommonFoodApiError, commonFoodCatalogue, resolveGovernedCommonFoodOption } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';
import type { ClientFoodContext } from '../../backend/src/modules/nutrition/common-food-engine.js';

const context:ClientFoodContext={diet:'VEGETARIAN',allergies:[],intolerances:[],avoids:[],clinicalExclusions:[],dislikes:[],preferences:[]};
const food=commonFoodCatalogue.find(item=>item.active&&item.generatorEligible&&item.clientConsumable&&item.mealHeads.includes('BREAKFAST')&&['VEGAN','VEGETARIAN'].includes(item.vegetarianClass)&&item.servings.some(serving=>serving.active));
assert.ok(food); const serving=food.servings.find(item=>item.active&&item.isDefault)??food.servings.find(item=>item.active)!;
const target={kcal:300,protein:15,kcalTolerance:1000,proteinTolerance:1000};
const input={mealHead:'BREAKFAST' as const,components:[{foodId:food.id,servingId:serving.id,multiplier:serving.allowedMultipliers[0]}],target};
const expectCode=(fn:()=>unknown,code:string)=>assert.throws(fn,(error:unknown)=>error instanceof CommonFoodApiError&&error.code===code);

test('uses authoritative governed serving calculation and returns a deterministic snapshot',()=>{
 const first=resolveGovernedCommonFoodOption(context,input); const second=resolveGovernedCommonFoodOption(context,input);
 assert.deepEqual(first.nutrition,second.nutrition); assert.equal(first.snapshotHash,second.snapshotHash); assert.equal(first.optionHash,first.snapshotHash);
 assert.equal(first.components[0].grams,serving.grams*serving.allowedMultipliers[0]); assert.equal(first.clinicalApproval,false); assert.equal(first.calculationStatus,'AUTHORITATIVELY_RESOLVED');
});

test('rejects invalid food, serving, multiplier and duplicate components',()=>{
 expectCode(()=>resolveGovernedCommonFoodOption(context,{...input,components:[{...input.components[0],foodId:'NOT_GOVERNED'}]}),'UNSAFE_OR_INELIGIBLE_FOOD');
 expectCode(()=>resolveGovernedCommonFoodOption(context,{...input,components:[{...input.components[0],servingId:'NOT_GOVERNED'}]}),'SERVING_NOT_FOUND');
 expectCode(()=>resolveGovernedCommonFoodOption(context,{...input,components:[{...input.components[0],multiplier:999}]}),'INVALID_SERVING_MULTIPLIER');
 expectCode(()=>resolveGovernedCommonFoodOption(context,{...input,components:[input.components[0],input.components[0]]}),'DUPLICATE_COMPONENT');
});

test('applies client restrictions and does not silently substitute a component',()=>{
 const restrictedFood=commonFoodCatalogue.find(item=>item.active&&item.generatorEligible&&item.clientConsumable&&item.mealHeads.includes('BREAKFAST')&&['VEGAN','VEGETARIAN'].includes(item.vegetarianClass)&&item.allergens.length>0&&item.servings.some(candidate=>candidate.active));
 assert.ok(restrictedFood); const restrictedServing=restrictedFood.servings.find(item=>item.active)!;
 const restricted={...context,allergies:[restrictedFood.allergens[0]]};
 expectCode(()=>resolveGovernedCommonFoodOption(restricted,{...input,components:[{foodId:restrictedFood.id,servingId:restrictedServing.id,multiplier:restrictedServing.allowedMultipliers[0]}]}),'UNSAFE_OR_INELIGIBLE_FOOD');
});
