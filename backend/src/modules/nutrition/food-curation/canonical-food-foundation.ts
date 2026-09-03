import crypto from 'node:crypto';

export const SOURCE_DECISIONS = ['PENDING','APPROVED_EXACT_SOURCE','APPROVED_EQUIVALENT_SOURCE','APPROVED_MEASURED_LOCAL_REFERENCE','REJECTED_SOURCE','NO_ACCEPTABLE_SOURCE'] as const;
export type SourceDecision = typeof SOURCE_DECISIONS[number];
export type NutrientValue = { state: 'KNOWN'; value: number } | { state: 'UNKNOWN' | 'NOT_REPORTED'; value: null };

export interface CanonicalIngredientIdentity {
  ingredientId: string; canonicalName: string; form: string; preparationState: string;
  speciesOrVariety: string | null; grade: string | null; nutrientBasis: string;
}
export interface SourceMapping {
  mappingId: string; ingredientId: string; sourceId: string; sourceRecordId: string;
  sourceVersion: string; decision: SourceDecision; rationale: string | null;
  reviewerId: string | null; reviewerQualification: string | null; reviewedAt: string | null;
  sourceHash: string; nutrients: Record<string, NutrientValue>; supersedesMappingId: string | null;
  identity: Omit<CanonicalIngredientIdentity, 'ingredientId' | 'canonicalName'>;
}
export interface HumanGateSubmission {
  submissionId: string; taskHash: string; expectedTaskHash: string; evidenceHash: string;
  expectedEvidenceHash: string; reviewerId: string; reviewerQualification: string;
  authority: 'NUTRITIONIST' | 'SOURCE_STEWARD'; submittedAt: string;
  decisions: Array<{ itemId: string; decision: SourceDecision; rationale: string }>;
  expectedItemIds: string[]; supersededSubmissionId?: string; acknowledgesSupersession?: boolean;
}

const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable)}]` : v && typeof v === 'object'
  ? `{${Object.entries(v as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,x]) => `${JSON.stringify(k)}:${stable(x)}`).join(',')}}`
  : JSON.stringify(v);
export const canonicalHash = (v: unknown) => crypto.createHash('sha256').update(stable(v)).digest('hex');
export const ingredientIdentityKey = (i: CanonicalIngredientIdentity) => canonicalHash({
  name:i.canonicalName.trim().toLocaleLowerCase(), form:i.form, preparationState:i.preparationState,
  speciesOrVariety:i.speciesOrVariety, grade:i.grade, nutrientBasis:i.nutrientBasis,
});

export function assertSourceMappingEligible(ingredient: CanonicalIngredientIdentity, mapping: SourceMapping): void {
  if (!['APPROVED_EXACT_SOURCE','APPROVED_EQUIVALENT_SOURCE','APPROVED_MEASURED_LOCAL_REFERENCE'].includes(mapping.decision)) throw new Error('SOURCE_DECISION_NOT_APPROVED');
  if (!mapping.rationale?.trim() || !mapping.reviewerId?.trim() || !mapping.reviewerQualification?.trim() || !mapping.reviewedAt) throw new Error('SOURCE_APPROVAL_METADATA_REQUIRED');
  for (const field of ['form','preparationState','speciesOrVariety','grade','nutrientBasis'] as const) {
    if (ingredient[field] !== mapping.identity[field]) throw new Error(`SOURCE_IDENTITY_MISMATCH:${field}`);
  }
  for (const [code, nutrient] of Object.entries(mapping.nutrients)) {
    if (nutrient.state === 'KNOWN' && (!Number.isFinite(nutrient.value) || nutrient.value < 0)) throw new Error(`INVALID_NUTRIENT:${code}`);
    if (nutrient.state !== 'KNOWN' && nutrient.value !== null) throw new Error(`UNKNOWN_NUTRIENT_HAS_VALUE:${code}`);
  }
}

export function ingestHumanGateSubmission(input: HumanGateSubmission, seenSubmissionIds: Set<string> = new Set()) {
  const errors: string[] = [];
  if (!input.submissionId.trim() || seenSubmissionIds.has(input.submissionId)) errors.push('DUPLICATE_SUBMISSION');
  if (input.taskHash !== input.expectedTaskHash) errors.push('TASK_HASH_MISMATCH');
  if (input.evidenceHash !== input.expectedEvidenceHash) errors.push('EVIDENCE_MUTATION');
  if (!input.reviewerId.trim() || !input.reviewerQualification.trim() || !/^\d{4}-\d{2}-\d{2}T/.test(input.submittedAt)) errors.push('REVIEWER_METADATA_REQUIRED');
  const ids = input.decisions.map(x => x.itemId);
  if (new Set(ids).size !== ids.length) errors.push('CONFLICTING_DECISIONS');
  if (input.expectedItemIds.some(id => !ids.includes(id)) || ids.some(id => !input.expectedItemIds.includes(id))) errors.push('PARTIAL_OR_UNKNOWN_DECISIONS');
  for (const d of input.decisions) {
    if (!SOURCE_DECISIONS.includes(d.decision) || d.decision === 'PENDING') errors.push(`UNSUPPORTED_OR_PENDING_DECISION:${d.itemId}`);
    if (!d.rationale.trim()) errors.push(`RATIONALE_REQUIRED:${d.itemId}`);
  }
  if (input.supersededSubmissionId && !input.acknowledgesSupersession) errors.push('SUPERSESSION_ACKNOWLEDGEMENT_REQUIRED');
  return { schemaVersion:'FITEATSY_HUMAN_GATE_INGESTION_REPORT_V1', submissionId:input.submissionId, accepted:errors.length===0, errors, reportHash:canonicalHash({submissionId:input.submissionId, errors}) } as const;
}

export interface CandidateFood { foodId:string; familyId:string; mealHeads:string[]; servingVariants:string[]; allergens:string[]; avoids:string[]; diets:string[]; calories:number; protein:number; activeValidationRelease:boolean; }
export interface CoverageProfile { profileId:string; mealHeads:string[]; diet:string; allergens:string[]; avoids:string[]; targetCalories:number; targetProtein:number; }
export const eligibleCandidates = (foods: CandidateFood[], profile: CoverageProfile, mealHead: string) => foods.filter(f =>
  f.activeValidationRelease && f.mealHeads.includes(mealHead) && f.diets.includes(profile.diet) && !f.allergens.some(x=>profile.allergens.includes(x)) && !f.avoids.some(x=>profile.avoids.includes(x))
);
export function measureCoverage(foods:CandidateFood[], profile:CoverageProfile, required=5) {
  const meals = profile.mealHeads.map(mealHead => {
    const eligible=eligibleCandidates(foods,profile,mealHead); const distinctFoods=new Set(eligible.map(x=>x.foodId)).size; const distinctFamilies=new Set(eligible.map(x=>x.familyId)).size;
    return {mealHead,distinctFoods,distinctFamilies,servingVariants:eligible.reduce((n,x)=>n+x.servingVariants.length,0),shortage:Math.max(0,required-distinctFoods)};
  });
  return {profileId:profile.profileId,targetCalories:profile.targetCalories,targetProtein:profile.targetProtein,meals,pass:meals.every(x=>x.shortage===0),hash:canonicalHash(meals)};
}

export const servingVariant = (validationReleaseId:string, label:string, grams:number, per100g:Record<string,number|null>) => {
  if (!(grams>0)) throw new Error('INVALID_SERVING_WEIGHT');
  const nutrients=Object.fromEntries(Object.entries(per100g).map(([k,v])=>[k,v===null?null:v*grams/100]));
  return {validationReleaseId,label,grams,nutrients,servingHash:canonicalHash({validationReleaseId,label,grams,nutrients})};
};

export const STAGE_B_DECISIONS = ['APPROVED','CHANGES_REQUIRED','REJECTED'] as const;
export type StageBDecision = typeof STAGE_B_DECISIONS[number];
export interface StageBReviewInput {
  decisionId:string; recipeId:string; recipeVersion:string; reviewPackId:string; reviewPackVersion:number;
  formulaHash:string; expectedFormulaHash:string; measurementHash:string; expectedMeasurementHash:string;
  calculationHash:string; expectedCalculationHash:string; reviewPackHash:string; evidenceHash:string;
  reviewerId:string; reviewerQualification:string; qualificationReference:string; decision:StageBDecision;
  decisionDate:string; declaration:string; rationale:string; reconciliation:'PASS'|'FAIL';
  expectedReviewPackHash?:string; reviewerAuthority?:string; sourcesActive:boolean; immutableEvidence:boolean;
}
export function evaluateStageBReview(input:StageBReviewInput, prior?:{decisionHash:string;decision:StageBDecision}) {
  const errors:string[]=[];
  if (!STAGE_B_DECISIONS.includes(input.decision)) errors.push('UNSUPPORTED_STAGE_B_DECISION');
  if (!input.reviewerId.trim() || !input.reviewerQualification.trim() || !input.qualificationReference.trim() || !input.declaration.trim() || !input.rationale.trim() || !/^\d{4}-\d{2}-\d{2}/.test(input.decisionDate)) errors.push('STAGE_B_REVIEWER_METADATA_REQUIRED');
  if (input.formulaHash!==input.expectedFormulaHash) errors.push('STALE_FORMULA_HASH');
  if (input.measurementHash!==input.expectedMeasurementHash) errors.push('STALE_MEASUREMENT_HASH');
  if (input.calculationHash!==input.expectedCalculationHash) errors.push('STALE_CALCULATION_HASH');
  if (input.expectedReviewPackHash!==undefined && input.reviewPackHash!==input.expectedReviewPackHash) errors.push('STALE_REVIEW_PACK_HASH');
  if (input.reviewerAuthority!==undefined && !input.reviewerAuthority.trim()) errors.push('STAGE_B_REVIEWER_AUTHORITY_REQUIRED');
  if (input.reconciliation!=='PASS') errors.push('RECONCILIATION_NOT_PASSED');
  if (!input.sourcesActive) errors.push('SOURCE_MAPPING_NOT_ACTIVE');
  if (!input.immutableEvidence) errors.push('EVIDENCE_MUTATION');
  const decisionHash=canonicalHash(input);
  if (prior && prior.decisionHash!==decisionHash) errors.push(prior.decision===input.decision?'DUPLICATE_DECISION_PAYLOAD_CONFLICT':'CONFLICTING_STAGE_B_DECISION');
  const releaseEligible=errors.length===0 && input.decision==='APPROVED';
  return {accepted:errors.length===0,errors,decisionHash,state:errors.length?'STAGE_B_BLOCKED':input.decision==='APPROVED'?'STAGE_B_APPROVED':input.decision==='CHANGES_REQUIRED'?'STAGE_B_CHANGES_REQUIRED':'STAGE_B_REJECTED',releaseEligible};
}

export interface ValidationReleaseInput {
  validationReleaseId:string; recipeId:string; recipeName:string; recipeVersion:string; validationReleaseVersion:number;
  stageADecisionId:string; stageADecisionHash:string; sourceDecisionIds:string[]; sourceDecisionHashes:string[];
  canonicalIngredientMappings:Array<{ingredientId:string;sourceRef:string;sourceHash:string}>;
  formulaHash:string; measurementHash:string; calculationHash:string; reconciliationStatus:'PASS'; reconciliationHash:string;
  stageBDecisionId:string; stageBDecisionHash:string; releaseStatus:'VALIDATED_RELEASED'; productionActivationStatus:'NOT_PRODUCTION_ACTIVE'; createdBy:string;
}
export function createValidationRelease(input:ValidationReleaseInput) {
  const releaseHash=canonicalHash(input);
  return deepFreeze({...input,releaseHash,immutable:true as const});
}
function deepFreeze<T>(value:T):T {
  if (value && typeof value==='object') { Object.freeze(value); for (const child of Object.values(value as Record<string,unknown>)) deepFreeze(child); }
  return value;
}

export interface SourceRights { status:'APPROVED'|'MISSING'|'REJECTED'; licence:string|null; evidence:string|null; allowedUse:string|null; }
export function assertSourceRights(rights:SourceRights):void {
  if (rights.status!=='APPROVED' || !rights.licence?.trim() || !rights.evidence?.trim() || !rights.allowedUse?.trim()) throw new Error('SOURCE_RIGHTS_NOT_APPROVED');
}
export function assertMandatoryNutritionVector(v:Record<'energyKcal'|'proteinG'|'carbohydrateG'|'fatG'|'fibreG',number|null>):void {
  for (const [field,value] of Object.entries(v)) if (value===null || !Number.isFinite(value) || value<0) throw new Error(`MANDATORY_NUTRIENT_NOT_KNOWN:${field}`);
}
export function assertIngredientSourceState(kind:'MOONG'|'POHA'|'POTATO', description:string):void {
  const d=description.toLocaleLowerCase();
  if (kind==='MOONG' && (!d.includes('mung') || !d.includes('split') || !d.includes('hulled') || !d.includes('yellow') || d.includes('cooked') || d.includes('sprout'))) throw new Error('MOONG_IDENTITY_MISMATCH');
  if (kind==='POHA' && (!(d.includes('flattened')||d.includes('beaten')) || !d.includes('rice') || d.includes('cooked') || d.includes('puffed') || d.includes('prepared'))) throw new Error('POHA_IDENTITY_MISMATCH');
  if (kind==='POTATO' && (!d.includes('potato') || !d.includes('raw') || d.includes('cooked') || d.includes('fried') || d.includes('dehydrated'))) throw new Error('POTATO_STATE_MISMATCH');
}
