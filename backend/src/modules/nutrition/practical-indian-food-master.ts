import master from './food-master/data/fiteatsy-indian-food-master-v1.json' with {type:'json'};
import type { CommonFood, ComponentRole, MealHead, Nutrients } from './common-food-engine.js';

type MasterRow={id:string;canonicalCode:string;canonicalName:string;displayName:string;aliases:string[];category:string;referenceState:string;nutritionPer100g:Nutrients;dataStatus:'REFERENCE'|'INCOMPLETE';referencePreparation:string|null;verificationStatus:string;sourceNote:string;sourceMappingId:string;sourceVersion:string;roles:ComponentRole[];mealHeads:MealHead[];vegetarianClass:CommonFood['vegetarianClass'];generatorEligible:boolean;manualAddable:boolean;clientConsumable:boolean};
export type PracticalFood=CommonFood&{dataStatus:'REFERENCE';referenceState:string;referenceLabel:'Reference data';sourceNote:string;referencePreparation:string|null};

export const practicalFoodMasterRows=master.rows as MasterRow[];
export const createPracticalReferenceFoods=():PracticalFood[]=>(master.rows as MasterRow[]).filter(row=>row.dataStatus==='REFERENCE'&&row.manualAddable).map(row=>({
  id:row.id,version:1,canonicalCode:row.canonicalCode,canonicalName:row.canonicalName.toLowerCase(),displayName:row.displayName,foodType:'COMMON_FOOD',family:row.canonicalName.toLowerCase(),category:row.category.toLowerCase(),countryContext:'INDIA_REFERENCE',isIndianSpecificFood:false,sourcePolicyClass:'REFERENCE_CATALOGUE',sourceMappingId:row.sourceMappingId,sourceVersion:row.sourceVersion,vegetarianClass:row.vegetarianClass,dietTags:[row.vegetarianClass.toLowerCase(),'indian-reference'],allergens:[],intolerances:[],clinicalTags:[],avoidTags:[],mealHeads:row.mealHeads,roles:row.roles,nutrientsPer100g:row.nutritionPer100g,servings:[{id:`SV_${row.id}_100G`,version:1,label:'100 g',grams:100,millilitres:null,unit:'g',isDefault:true,minMultiplier:.05,maxMultiplier:5,allowedMultipliers:[.25,.5,.75,1,1.5,2],active:true}],active:true,clientConsumable:row.clientConsumable,generatorEligible:row.generatorEligible,aliases:row.aliases,dataStatus:'REFERENCE',referenceState:row.referenceState,referenceLabel:'Reference data',sourceNote:row.sourceNote,referencePreparation:row.referencePreparation
}));

export const isPracticalReferenceFood=(food:CommonFood):food is PracticalFood=>'dataStatus' in food&&(food as PracticalFood).dataStatus==='REFERENCE';
