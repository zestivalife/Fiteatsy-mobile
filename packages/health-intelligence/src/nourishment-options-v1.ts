export const NOURISHMENT_OPTIONS_VERSION='NOURISHMENT_OPTIONS_V1_PROPOSAL' as const;
export const STRICT_CLINICAL_NOURISHMENT_VERSION='STRICT_CLINICAL_NOURISHMENT_V1' as const;
export const EVERYDAY_NOURISHMENT_VERSION='EVERYDAY_NOURISHMENT_V1_PROPOSAL' as const;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const clamp=(value:number)=>Math.max(0,Math.min(100,value));
const mean=(values:number[])=>values.reduce((sum,value)=>sum+value,0)/values.length;

/** Proposal only: dimensions must be derived from completed consumed-food logs. */
export const projectConsumedFoodQuality=(input:{logComplete:boolean;consumedFoods:Array<{verified:boolean;foodGroup:string|null;fibreGrams:number|null;addedSugarGrams:number|null}>})=>{
  if(!input.logComplete||input.consumedFoods.length===0)return {score:null,status:'UNAVAILABLE' as const,reason:'COMPLETE_CONSUMPTION_LOG_REQUIRED'};
  if(input.consumedFoods.some(food=>!food.verified||!finite(food.fibreGrams)||!finite(food.addedSugarGrams)||!food.foodGroup))return {score:null,status:'UNAVAILABLE' as const,reason:'VERIFIED_FOOD_DIMENSIONS_REQUIRED'};
  const groups=new Set(input.consumedFoods.map(food=>food.foodGroup));
  const diversity=clamp(groups.size/5*100);
  const fibre=clamp(input.consumedFoods.reduce((sum,food)=>sum+food.fibreGrams!,0)/25*100);
  const sugar=clamp(100-input.consumedFoods.reduce((sum,food)=>sum+food.addedSugarGrams!,0)/50*100);
  return {score:Number(mean([diversity,fibre,sugar]).toFixed(2)),status:'PROPOSAL_ONLY' as const,reason:'NON_DIAGNOSTIC_CONSUMED_FOOD_PROJECTION'};
};

export const evaluateStrictClinicalComposite=(components:{protein:number;hydration:number;foodQuality:number;clinicalMarkers:number|null})=>
  Object.values(components).every(finite)?{score:Number((components.protein*.25+components.hydration*.2+components.foodQuality*.3+components.clinicalMarkers!*.25).toFixed(2)),status:'CALCULATED' as const,version:STRICT_CLINICAL_NOURISHMENT_VERSION}:{score:null,status:'UNAVAILABLE' as const,version:STRICT_CLINICAL_NOURISHMENT_VERSION,reason:'VALIDATED_MARKER_SPECIFIC_DATA_REQUIRED' as const};

/** Separate label/version: clinical weight is not silently redistributed. */
export const evaluateEverydayNutritionProposal=(components:{protein:number;hydration:number;foodQuality:number})=>
  Object.values(components).every(finite)?{score:Number((components.protein/3+components.hydration/3+components.foodQuality/3).toFixed(2)),status:'PROPOSAL_ONLY' as const,version:EVERYDAY_NOURISHMENT_VERSION,label:'Non-diagnostic everyday nourishment' as const,weights:{protein:1/3,hydration:1/3,foodQuality:1/3}}:{score:null,status:'UNAVAILABLE' as const,version:EVERYDAY_NOURISHMENT_VERSION,label:'Non-diagnostic everyday nourishment' as const,reason:'COMPLETE_CONSUMPTION_PROTEIN_HYDRATION_AND_FOOD_QUALITY_REQUIRED' as const};
