import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertExactCommonFoodSelection } from '../../backend/src/modules/nutrition/common-food-consultant.service.ts';
import { MEAL_HEADS, type MealHead } from '../../backend/src/modules/nutrition/common-food-engine.ts';

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const selection=(counts:Partial<Record<MealHead,number>>={})=>MEAL_HEADS.flatMap(head=>
  Array.from({length:counts[head]??5},(_,index)=>({optionId:`${head}:${index}`,mealHead:head})),
);

test('v17.9 accepts one authoritative 7x5 selection and rejects the 22/35 regression',()=>{
 assert.doesNotThrow(()=>assertExactCommonFoodSelection(selection()));
 assert.throws(()=>assertExactCommonFoodSelection(selection({EARLY_MORNING:2,BREAKFAST:0,MID_MORNING:5,LUNCH:5,EVENING_SNACK:5,DINNER:5,BEDTIME:0})),/Exactly five distinct options/);
 assert.throws(()=>assertExactCommonFoodSelection(selection({BEDTIME:0})),/Exactly five distinct options/);
 const duplicated=selection();duplicated[34]={...duplicated[34],optionId:duplicated[0].optionId};
 assert.throws(()=>assertExactCommonFoodSelection(duplicated),/Exactly five distinct options/);
});

test('v17.9 migration is additive and separates candidate history from selected mappings',()=>{
 const sql=read('../../backend/src/db/migrations/0053_unified_diet_option_selection.sql');
 assert.match(sql,/create table if not exists diet_plan_option_selections/);
 assert.match(sql,/diet_plan_combination_plan_logical_version_uq/);
 assert.match(sql,/\(diet_plan_id, logical_option_id, version\)/);
 assert.match(sql,/unique \(diet_plan_version_id, meal_head, display_order\)/);
 assert.match(sql,/where display_order<=5/);
 assert.doesNotMatch(sql,/drop table|truncate|delete from diet_plan_combination_options/i);
});

test('v17.9 replacement is atomic, stale-safe, and selection hydration precedes frozen review snapshots',()=>{
 const repository=read('../../backend/src/modules/nutrition/common-food-consultant.repository.ts');
 const service=read('../../backend/src/modules/nutrition/nutrition.service.ts');
 const routes=read('../../backend/src/modules/nutrition/nutrition.routes.ts');
 assert.match(repository,/replaceCombinationOptionSelection/);
 assert.match(repository,/await client\.query\('begin'\)/);
 assert.match(repository,/delete from diet_plan_option_selections/);
 assert.match(repository,/await client\.query\('commit'\)/);
 assert.match(repository,/STALE_PLAN_VERSION/);
 assert.match(routes,/consultantNutritionRouter\.put\('\/clients\/:clientId\/diet-plans\/:dietPlanId\/common-food\/options'/);
 assert.match(service,/listCombinationOptions\(plan\.id, version\.id\)/);
 assert.match(service,/commonFoodOptions: editableSelections/);
});
