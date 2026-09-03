import type { CatalogueFood } from './catalogue/catalogue.types.js';
import type { CommonFood, ComponentRole, MealHead } from './common-food-engine.js';

const CATEGORY_POLICY:Record<string,{roles:ComponentRole[];mealHeads:MealHead[];clientConsumable:boolean}>={
  fruit:{roles:['FRUIT'],mealHeads:['EARLY_MORNING','BREAKFAST','MID_MORNING','EVENING_SNACK'],clientConsumable:true},
  nuts:{roles:['NUT_SEED','PROTEIN'],mealHeads:['EARLY_MORNING','BREAKFAST','MID_MORNING','EVENING_SNACK','BEDTIME'],clientConsumable:true},
  seeds:{roles:['NUT_SEED'],mealHeads:['EARLY_MORNING','BREAKFAST','MID_MORNING','EVENING_SNACK','BEDTIME'],clientConsumable:true},
  dairy:{roles:['DAIRY','PROTEIN','BEVERAGE'],mealHeads:['BREAKFAST','MID_MORNING','LUNCH','EVENING_SNACK','DINNER','BEDTIME'],clientConsumable:true},
  grain:{roles:['GRAIN','STARCH'],mealHeads:['BREAKFAST','LUNCH','EVENING_SNACK','DINNER'],clientConsumable:true},
  legume:{roles:['PULSE','PROTEIN'],mealHeads:['BREAKFAST','LUNCH','EVENING_SNACK','DINNER'],clientConsumable:true},
  protein:{roles:['PROTEIN'],mealHeads:['BREAKFAST','LUNCH','EVENING_SNACK','DINNER'],clientConsumable:true},
  egg:{roles:['PROTEIN'],mealHeads:['BREAKFAST','LUNCH','EVENING_SNACK','DINNER'],clientConsumable:true},
  poultry:{roles:['PROTEIN'],mealHeads:['LUNCH','DINNER'],clientConsumable:true},fish:{roles:['PROTEIN'],mealHeads:['LUNCH','DINNER'],clientConsumable:true},
  vegetable:{roles:['VEGETABLE','ACCOMPANIMENT'],mealHeads:['BREAKFAST','LUNCH','EVENING_SNACK','DINNER'],clientConsumable:true},
  oil:{roles:['FAT'],mealHeads:[],clientConsumable:false},spice:{roles:[],mealHeads:[],clientConsumable:false},
};
const vegetarianClass=(food:CatalogueFood):CommonFood['vegetarianClass']=>food.dietaryTags.includes('non-vegetarian')?(food.foodCategory==='egg'?'EGG':'NON_VEGETARIAN'):food.dietaryTags.includes('vegan')?'VEGAN':'VEGETARIAN';
export function createGovernedCommonFoodPopulation(foods:CatalogueFood[]):CommonFood[]{return foods.flatMap(food=>{const rule=CATEGORY_POLICY[food.foodCategory??''];if(!rule)return [];const n=food.nutrients;if(!['calories','proteinGrams','carbohydrateGrams','fatGrams'].every(k=>n[k]!=null&&Number.isFinite(n[k])))return [];const serving=food.portions.find(x=>x.grams>0)??{id:`${food.id}:100g`,label:'100 g',grams:100};return [{id:`CF_${food.id}`,version:1,canonicalCode:`USDA_${food.fdcId}`,canonicalName:food.canonicalName,displayName:food.displayName,foodType:'COMMON_FOOD',family:food.canonicalName,category:food.foodCategory??'uncategorised',countryContext:'GLOBAL_GENERIC',isIndianSpecificFood:false,sourcePolicyClass:'GLOBAL_GENERIC_APPROVED',sourceMappingId:`USDA_FDC:${food.fdcId}`,sourceVersion:food.publicationDate,vegetarianClass:vegetarianClass(food),dietTags:food.dietaryTags,allergens:food.allergenTags,intolerances:[],clinicalTags:[],avoidTags:[],mealHeads:rule.mealHeads,roles:rule.roles,nutrientsPer100g:{kcal:n.calories,protein:n.proteinGrams,carbohydrate:n.carbohydrateGrams,fat:n.fatGrams,fibre:n.fibreGrams} as CommonFood['nutrientsPer100g'],servings:[{id:`SV_${serving.id}`,version:1,label:serving.label,grams:serving.grams,millilitres:null,unit:'gram',isDefault:true,minMultiplier:.5,maxMultiplier:2,allowedMultipliers:[.5,1,1.5,2],active:true}],active:true,clientConsumable:rule.clientConsumable,generatorEligible:rule.clientConsumable&&rule.roles.length>0,aliases:[food.canonicalName,food.displayName.toLocaleLowerCase()]}];});}
