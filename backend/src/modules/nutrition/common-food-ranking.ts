import type { CommonFood, MealComponent, Nutrients } from './common-food-engine.js';

export const COMMON_FOOD_RANKING_VERSION_V2 = 'COMMON_FOOD_RANKING_V2' as const;

export type VegetableClass = 'NON_STARCHY_VEGETABLE'|'MODERATE_STARCH_VEGETABLE'|'STARCHY_VEGETABLE'|'LEAFY_GREEN'|'CRUCIFEROUS'|'GOURD'|'LEGUME_VEGETABLE'|'ROOT_VEGETABLE'|'OTHER_VEGETABLE';
export type StarchClass = 'NON_STARCHY'|'MODERATE_STARCH'|'STARCHY'|'NOT_APPLICABLE';
export type VegetableMetadata = { vegetableClass: VegetableClass|null; vegetableFamily: string|null; starchClass: StarchClass };
export type DailyFoodUsage = { foodCounts: Record<string,number>; familyCounts: Record<string,number> };

const normalized=(value:string)=>value.toLowerCase().replace(/[_-]+/g,' ').trim();
const has=(name:string,terms:string[])=>terms.some(term=>name.includes(term));

/** Product ranking taxonomy, not a clinical diagnosis. Unknown foods remain explicit. */
export const classifyVegetable=(food:Pick<CommonFood,'canonicalName'|'displayName'|'category'|'roles'|'family'>):VegetableMetadata=>{
  const name=normalized(`${food.canonicalName} ${food.displayName} ${food.family}`);
  const vegetable=food.category==='vegetable'||food.roles.includes('VEGETABLE');
  if(!vegetable)return {vegetableClass:null,vegetableFamily:null,starchClass:has(name,['rice','chapati','roti','bread','poha','oat','millet','corn','sweet potato','potato'])?'STARCHY':'NOT_APPLICABLE'};
  if(has(name,['sweet potato','potato','corn']))return {vegetableClass:'STARCHY_VEGETABLE',vegetableFamily:has(name,['potato'])?'POTATO':'CORN',starchClass:'STARCHY'};
  if(has(name,['beet','carrot','turnip','radish']))return {vegetableClass:'ROOT_VEGETABLE',vegetableFamily:'ROOT_VEGETABLE',starchClass:'MODERATE_STARCH'};
  if(has(name,['spinach','palak','methi','fenugreek','amaranth','leafy']))return {vegetableClass:'LEAFY_GREEN',vegetableFamily:'LEAFY_GREEN',starchClass:'NON_STARCHY'};
  if(has(name,['cauliflower','broccoli','cabbage']))return {vegetableClass:'CRUCIFEROUS',vegetableFamily:'CRUCIFEROUS',starchClass:'NON_STARCHY'};
  if(has(name,['gourd','lauki','tori','turai','pumpkin']))return {vegetableClass:'GOURD',vegetableFamily:'GOURD',starchClass:'NON_STARCHY'};
  if(has(name,['pea','bean','legume']))return {vegetableClass:'LEGUME_VEGETABLE',vegetableFamily:'LEGUME_VEGETABLE',starchClass:'MODERATE_STARCH'};
  if(has(name,['bhindi','okra']))return {vegetableClass:'NON_STARCHY_VEGETABLE',vegetableFamily:'OKRA',starchClass:'NON_STARCHY'};
  return {vegetableClass:'OTHER_VEGETABLE',vegetableFamily:normalized(food.family)||'OTHER_VEGETABLE',starchClass:'NON_STARCHY'};
};

export const emptyDailyFoodUsage=():DailyFoodUsage=>({foodCounts:{},familyCounts:{}});
export const addCombinationToDailyUsage=(usage:DailyFoodUsage,components:MealComponent[],foods:Map<string,CommonFood>)=>{
  for(const component of components){const food=foods.get(component.foodId);if(!food)continue;usage.foodCounts[food.id]=(usage.foodCounts[food.id]??0)+1;const family=classifyVegetable(food).vegetableFamily;if(family)usage.familyCounts[family]=(usage.familyCounts[family]??0)+1;}
  return usage;
};

const priority:Record<NonNullable<VegetableMetadata['vegetableClass']>,number>={NON_STARCHY_VEGETABLE:8,LEAFY_GREEN:8,CRUCIFEROUS:7,GOURD:6,LEGUME_VEGETABLE:5,OTHER_VEGETABLE:4,ROOT_VEGETABLE:3,MODERATE_STARCH_VEGETABLE:2,STARCHY_VEGETABLE:0};
const majorStarch=(metadata:VegetableMetadata)=>metadata.starchClass==='STARCHY';
const repetitionPenalty=(count:number)=>count<=0?0:count===1?5:count===2?14:30;

export const scoreHealthAndDiversity=(input:{components:MealComponent[];nutrition:Nutrients;foods:Map<string,CommonFood>;dailyUsage?:DailyFoodUsage})=>{
  const metadata=input.components.map(component=>({component,food:input.foods.get(component.foodId)})).filter((x):x is {component:MealComponent;food:CommonFood}=>Boolean(x.food)).map(x=>({...x,metadata:classifyVegetable(x.food)}));
  const vegetables=metadata.filter(x=>x.metadata.vegetableClass);
  const starches=metadata.filter(x=>majorStarch(x.metadata));
  const vegetablePriority=vegetables.reduce((sum,x)=>sum+priority[x.metadata.vegetableClass!],0);
  const fibreContribution=input.nutrition.fibre===null?0:Math.min(4,input.nutrition.fibre);
  const starchStackingPenalty=starches.length>1?(starches.length-1)*12:0;
  const ingredientRepetitionPenalty=metadata.reduce((sum,x)=>sum+repetitionPenalty(input.dailyUsage?.foodCounts[x.food.id]??0),0);
  const familyDiversityPenalty=vegetables.reduce((sum,x)=>sum+Math.min(8,(input.dailyUsage?.familyCounts[x.metadata.vegetableFamily!]??0)*3),0);
  const vegetableHealthScore=vegetablePriority+fibreContribution;
  return {vegetableHealthScore,starchStackingPenalty,ingredientRepetitionPenalty,familyDiversityPenalty,healthDiversityScore:vegetableHealthScore-starchStackingPenalty-ingredientRepetitionPenalty-familyDiversityPenalty};
};
