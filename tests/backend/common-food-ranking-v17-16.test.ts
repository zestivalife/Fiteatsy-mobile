import assert from 'node:assert/strict';
import test from 'node:test';
import { commonFoodCatalogue } from '../../backend/src/modules/nutrition/common-food-consultant.service.js';
import { generateMealCombinations, type CommonFood, type MealComponent, type Nutrients } from '../../backend/src/modules/nutrition/common-food-engine.js';
import { classifyVegetable, scoreHealthAndDiversity } from '../../backend/src/modules/nutrition/common-food-ranking.js';

const food=(name:string,category='vegetable'):CommonFood=>({id:`CF_${name}`,version:1,canonicalCode:name,canonicalName:name,displayName:name,foodType:'COMMON_FOOD',family:name,category,countryContext:'GLOBAL_GENERIC',isIndianSpecificFood:false,sourcePolicyClass:'GLOBAL_GENERIC_APPROVED',sourceMappingId:`SRC_${name}`,sourceVersion:'1',vegetarianClass:'VEGAN',dietTags:[],allergens:[],intolerances:[],clinicalTags:[],avoidTags:[],mealHeads:['LUNCH','DINNER'],roles:category==='vegetable'?['VEGETABLE']:['STARCH'],nutrientsPer100g:{kcal:80,protein:3,carbohydrate:15,fat:1,fibre:3},servings:[{id:`SV_${name}`,version:1,label:'100 g',grams:100,millilitres:null,unit:'gram',isDefault:true,minMultiplier:1,maxMultiplier:1,allowedMultipliers:[1],active:true}],active:true,clientConsumable:true,generatorEligible:true,aliases:[name]});
const component=(f:CommonFood):MealComponent=>({componentId:f.id,foodId:f.id,foodVersion:1,foodDisplayNameSnapshot:f.displayName,servingId:f.servings[0].id,servingVersion:1,servingDisplayNameSnapshot:'100 g',multiplier:1,grams:100,millilitres:null,label:'1 x 100 g',sourceType:'COMMON_FOOD',sourceMappingId:f.sourceMappingId,nutrition:f.nutrientsPer100g});
const nutrition:Nutrients={kcal:240,protein:9,carbohydrate:45,fat:3,fibre:9};

test('potato is governed as a starchy vegetable while remaining eligible',()=>{
  const potato=food('potato');
  assert.deepEqual(classifyVegetable(potato),{vegetableClass:'STARCHY_VEGETABLE',vegetableFamily:'POTATO',starchClass:'STARCHY'});
  assert.equal(potato.generatorEligible,true);
});

test('repeated potato ranks below a suitable non-starchy alternative',()=>{
  const potato=food('potato'),okra=food('okra');const foods=new Map([[potato.id,potato],[okra.id,okra]]);
  const usage={foodCounts:{[potato.id]:2},familyCounts:{POTATO:2}};
  const repeated=scoreHealthAndDiversity({components:[component(potato)],nutrition,foods,dailyUsage:usage});
  const alternative=scoreHealthAndDiversity({components:[component(okra)],nutrition,foods,dailyUsage:usage});
  assert.ok(alternative.healthDiversityScore>repeated.healthDiversityScore);
});

test('single potato remains rankable when it is the only eligible vegetable',()=>{
  const potato=food('potato');const score=scoreHealthAndDiversity({components:[component(potato)],nutrition,foods:new Map([[potato.id,potato]])});
  assert.equal(Number.isFinite(score.healthDiversityScore),true);
});

test('chapati plus potato plus rice receives a stronger starch penalty than chapati plus bhindi plus dal',()=>{
  const chapati=food('chapati','grain'),rice=food('rice','grain'),potato=food('potato'),bhindi=food('bhindi'),dal=food('moong dal','pulse');const foods=new Map([chapati,rice,potato,bhindi,dal].map(f=>[f.id,f]));
  const stacked=scoreHealthAndDiversity({components:[chapati,potato,rice].map(component),nutrition,foods});
  const balanced=scoreHealthAndDiversity({components:[chapati,bhindi,dal].map(component),nutrition,foods});
  assert.ok(balanced.healthDiversityScore>stacked.healthDiversityScore);
  assert.ok(stacked.starchStackingPenalty>balanced.starchStackingPenalty);
});

test('vegetable family diversity beats repeated family use and shortage never excludes a safe option',()=>{
  const spinach=food('spinach'),broccoli=food('broccoli'),pumpkin=food('pumpkin'),potato=food('potato');const foods=new Map([spinach,broccoli,pumpkin,potato].map(f=>[f.id,f]));
  const usage={foodCounts:{},familyCounts:{LEAFY_GREEN:2}};
  assert.ok(scoreHealthAndDiversity({components:[component(broccoli)],nutrition,foods,dailyUsage:usage}).healthDiversityScore>scoreHealthAndDiversity({components:[component(spinach)],nutrition,foods,dailyUsage:usage}).healthDiversityScore);
  assert.equal(Number.isFinite(scoreHealthAndDiversity({components:[component(potato)],nutrition,foods:new Map([[potato.id,potato]])}).healthDiversityScore),true);
});

test('ranking remains deterministic and supported catalogue coverage stays 7 by 5',()=>{
  const context={diet:'VEGETARIAN' as const,allergies:[],intolerances:[],avoids:[],clinicalExclusions:[],dislikes:[],preferences:[]};
  for(const mealHead of ['EARLY_MORNING','BREAKFAST','MID_MORNING','LUNCH','EVENING_SNACK','DINNER','BEDTIME'] as const){
    const target={kcal:mealHead==='LUNCH'||mealHead==='DINNER'?500:250,protein:mealHead==='LUNCH'||mealHead==='DINNER'?25:10,kcalTolerance:150,proteinTolerance:15};
    const first=generateMealCombinations({foods:commonFoodCatalogue,context,mealHead,target});
    const second=generateMealCombinations({foods:commonFoodCatalogue,context,mealHead,target});
    assert.deepEqual(first,second);assert.equal(first.options.length,5);assert.ok(first.options.every(option=>option.rankingVersion==='COMMON_FOOD_RANKING_V2'));
  }
});

test('safety filtering still overrides ranking',()=>{
  const unsafe=food('potato');unsafe.allergens=['nightshade'];
  const result=generateMealCombinations({foods:[unsafe],context:{diet:'VEGETARIAN',allergies:['nightshade'],intolerances:[],avoids:[],clinicalExclusions:[],dislikes:[],preferences:[]},mealHead:'LUNCH',target:{kcal:100,protein:3,kcalTolerance:100,proteinTolerance:10}});
  assert.equal(result.options.length,0);
});
