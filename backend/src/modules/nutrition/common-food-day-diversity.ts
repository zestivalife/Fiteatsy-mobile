import { canonicalHash } from './food-curation/canonical-food-foundation.js';
import { classifyFoodQuality } from './common-food-ranking.js';
import type { CommonFood, GeneratedCombination, MealHead } from './common-food-engine.js';

export const COMMON_FOOD_DAY_DIVERSITY_VERSION_V4='COMMON_FOOD_DAY_DIVERSITY_V4' as const;

export type DiversityPenalty={exactFood:number;family:number;adjacentFood:number;adjacentFamily:number;rank:number;total:number};
export type DayDiversityMealInput={mealHead:MealHead;options:GeneratedCombination[];required?:number};
export type DayDiversityMealResult={mealHead:MealHead;options:GeneratedCombination[];shortage:null|{state:'SHORTAGE';available:number;required:number;missing:number;reason:'DIVERSITY_CONSTRAINED_POOL'};penalties:Array<{combinationId:string;penalty:DiversityPenalty}>};

const genericFamily=(food:CommonFood)=>{
  const quality=classifyFoodQuality(food);
  if(quality.pulseFamily)return `PULSE:${quality.pulseFamily}`;
  if(quality.grainFamily)return `GRAIN:${quality.grainFamily}`;
  if(quality.proteinFamily)return `PROTEIN:${quality.proteinFamily}`;
  if(quality.vegetableFamily)return `VEGETABLE:${quality.vegetableFamily}`;
  const role=food.roles.find(value=>['DAIRY','NUT_SEED','FRUIT','BEVERAGE','BREAD','EGG','PROTEIN','VEGETABLE','GRAIN','STARCH'].includes(value));
  return role??food.category.toUpperCase();
};

const optionHash=(option:GeneratedCombination)=>canonicalHash(option.components.map(component=>[component.foodId,component.servingId,component.multiplier]).sort());

/**
 * Bounded, deterministic day authority. It only reorders/chooses V3 output and
 * cannot make an ineligible food eligible.
 */
export function selectDayDiverseOptions(input:{meals:DayDiversityMealInput[];foods:CommonFood[];exactFoodCap?:number}){
  const foods=new Map(input.foods.map(food=>[food.id,food]));
  const foodMealHeads=new Map<string,Set<MealHead>>();
  const foodCounts=new Map<string,number>();
  const familyCounts=new Map<string,number>();
  const globalHashes=new Set<string>();
  let previousFoods=new Set<string>();
  let previousFamilies=new Set<string>();
  const exactFoodCap=input.exactFoodCap??3;
  const results:DayDiversityMealResult[]=[];

  for(const meal of input.meals){
    const required=meal.required??5;
    const chosen:GeneratedCombination[]=[];
    const penalties:DayDiversityMealResult['penalties']=[];
    const remaining=meal.options.map((option,rank)=>({option,rank}));
    while(chosen.length<required&&remaining.length){
      const scored=remaining.map(entry=>{
        const ids=[...new Set(entry.option.components.map(component=>component.foodId))];
        const families=[...new Set(ids.flatMap(id=>{const food=foods.get(id);return food?[genericFamily(food)]:[]}))];
        const hardCap=ids.some(id=>(foodMealHeads.get(id)?.size??0)>=exactFoodCap);
        const exactFood=ids.reduce((sum,id)=>sum+(foodCounts.get(id)??0)*18,0);
        const family=families.reduce((sum,key)=>sum+(familyCounts.get(key)??0)*5,0);
        const adjacentFood=ids.reduce((sum,id)=>sum+(previousFoods.has(id)?28:0),0);
        const adjacentFamily=families.reduce((sum,key)=>sum+(previousFamilies.has(key)?10:0),0);
        const rank=entry.rank*.15;
        const total=exactFood+family+adjacentFood+adjacentFamily+rank+(hardCap?10000:0);
        return {...entry,ids,families,hash:optionHash(entry.option),hardCap,penalty:{exactFood,family,adjacentFood,adjacentFamily,rank,total}};
      }).filter(entry=>!globalHashes.has(entry.hash));
      if(!scored.length)break;
      const feasible=scored.filter(entry=>!entry.hardCap);
      const pool=feasible.length?feasible:scored;
      pool.sort((a,b)=>a.penalty.total-b.penalty.total||b.option.overallScore-a.option.overallScore||a.option.combinationId.localeCompare(b.option.combinationId));
      const winner=pool[0];
      chosen.push({...winner.option,rankingVersion:COMMON_FOOD_DAY_DIVERSITY_VERSION_V4,rankingFactors:{...(winner.option.rankingFactors??{}),dayExactFoodPenalty:winner.penalty.exactFood,dayFamilyPenalty:winner.penalty.family,dayAdjacentPenalty:winner.penalty.adjacentFood+winner.penalty.adjacentFamily,daySelectionPenalty:winner.penalty.total}});
      penalties.push({combinationId:winner.option.combinationId,penalty:winner.penalty});
      globalHashes.add(winner.hash);
      remaining.splice(remaining.findIndex(entry=>entry.option===winner.option),1);
    }
    const mealFoods=new Set(chosen.flatMap(option=>option.components.map(component=>component.foodId)));
    const mealFamilies=new Set([...mealFoods].flatMap(id=>{const food=foods.get(id);return food?[genericFamily(food)]:[]}));
    for(const id of mealFoods){foodCounts.set(id,(foodCounts.get(id)??0)+1);const heads=foodMealHeads.get(id)??new Set<MealHead>();heads.add(meal.mealHead);foodMealHeads.set(id,heads);}
    for(const family of mealFamilies)familyCounts.set(family,(familyCounts.get(family)??0)+1);
    previousFoods=mealFoods;previousFamilies=mealFamilies;
    results.push({mealHead:meal.mealHead,options:chosen,shortage:chosen.length<required?{state:'SHORTAGE',available:chosen.length,required,missing:required-chosen.length,reason:'DIVERSITY_CONSTRAINED_POOL'}:null,penalties});
  }
  return {version:COMMON_FOOD_DAY_DIVERSITY_VERSION_V4,meals:results,usage:{foodCounts:Object.fromEntries(foodCounts),familyCounts:Object.fromEntries(familyCounts)}};
}
