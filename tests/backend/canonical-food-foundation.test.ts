import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { assertSourceMappingEligible, canonicalHash, ingestHumanGateSubmission, ingredientIdentityKey, measureCoverage, servingVariant, type CanonicalIngredientIdentity, type SourceMapping } from '../../backend/src/modules/nutrition/food-curation/canonical-food-foundation.js';

const ingredient:CanonicalIngredientIdentity={ingredientId:'ING_ATTA',canonicalName:'Whole-wheat atta',form:'FLOUR',preparationState:'RAW',speciesOrVariety:'Triticum aestivum',grade:'ATTA',nutrientBasis:'PER_100_G'};
const mapping:SourceMapping={mappingId:'M1',ingredientId:'ING_ATTA',sourceId:'IFCT',sourceRecordId:'A1',sourceVersion:'2017',decision:'APPROVED_EXACT_SOURCE',rationale:'Exact identity reviewed',reviewerId:'r1',reviewerQualification:'Registered Dietitian',reviewedAt:'2026-09-03T10:00:00Z',sourceHash:'a'.repeat(64),supersedesMappingId:null,identity:{form:'FLOUR',preparationState:'RAW',speciesOrVariety:'Triticum aestivum',grade:'ATTA',nutrientBasis:'PER_100_G'},nutrients:{energy_kcal:{state:'KNOWN',value:0},vitamin_c_mg:{state:'NOT_REPORTED',value:null}}};

test('canonical identity is stable and separates form, preparation, species, grade and basis',()=>{
  assert.equal(ingredientIdentityKey(ingredient),ingredientIdentityKey(structuredClone(ingredient)));
  assert.notEqual(ingredientIdentityKey(ingredient),ingredientIdentityKey({...ingredient,form:'WHOLE_GRAIN'}));
});
test('source approval fails closed and zero remains different from unknown',()=>{
  assert.doesNotThrow(()=>assertSourceMappingEligible(ingredient,mapping));
  assert.equal(mapping.nutrients.energy_kcal.value,0); assert.equal(mapping.nutrients.vitamin_c_mg.value,null);
  assert.throws(()=>assertSourceMappingEligible(ingredient,{...mapping,decision:'PENDING'}),/SOURCE_DECISION_NOT_APPROVED/);
  assert.throws(()=>assertSourceMappingEligible({...ingredient,grade:'OTHER'},mapping),/SOURCE_IDENTITY_MISMATCH:grade/);
});
test('human ingestion rejects stale, mutated, partial, duplicate, conflicting and unacknowledged evidence',()=>{
  const base={submissionId:'S1',taskHash:'t',expectedTaskHash:'t',evidenceHash:'e',expectedEvidenceHash:'e',reviewerId:'R',reviewerQualification:'RD',authority:'NUTRITIONIST' as const,submittedAt:'2026-09-03T10:00:00Z',expectedItemIds:['A'],decisions:[{itemId:'A',decision:'APPROVED_EXACT_SOURCE' as const,rationale:'reviewed'}]};
  assert.equal(ingestHumanGateSubmission(base).accepted,true);
  assert.equal(ingestHumanGateSubmission({...base,taskHash:'old',evidenceHash:'changed',decisions:[]},new Set(['S1'])).accepted,false);
  const conflicting={...base,decisions:[...base.decisions,{...base.decisions[0],decision:'REJECTED_SOURCE' as const}]};
  assert.ok(ingestHumanGateSubmission(conflicting).errors.includes('CONFLICTING_DECISIONS'));
  assert.ok(ingestHumanGateSubmission({...base,supersededSubmissionId:'S0'}).errors.includes('SUPERSESSION_ACKNOWLEDGEMENT_REQUIRED'));
});
test('hard safety filtering precedes coverage and reports truthful 5x7 shortages',()=>{
  const heads=['early','breakfast','mid','lunch','evening','dinner','bedtime'];
  const safe=Array.from({length:5},(_,i)=>({foodId:`F${i}`,familyId:`FM${i}`,mealHeads:heads,servingVariants:['standard'],allergens:[],avoids:[],diets:['VEG'],calories:100,protein:5,activeValidationRelease:true}));
  const unsafe={...safe[0],foodId:'PEANUT',familyId:'PEANUT',allergens:['PEANUT']};
  const profile={profileId:'TEST_PRITANSHI_EQUIVALENT',mealHeads:heads,diet:'VEG',allergens:['PEANUT'],avoids:[],targetCalories:2101,targetProtein:131};
  assert.equal(measureCoverage([...safe,unsafe],profile).pass,true);
  const shortage=measureCoverage(safe.slice(0,4),profile); assert.equal(shortage.pass,false); assert.ok(shortage.meals.every(x=>x.shortage===1));
});
test('serving variants derive deterministically from an accepted validation identity',()=>{
  const a=servingVariant('VR1','1 katori',150,{energy_kcal:100,iron_mg:null});
  assert.deepEqual(a.nutrients,{energy_kcal:150,iron_mg:null}); assert.equal(a.servingHash,servingVariant('VR1','1 katori',150,{energy_kcal:100,iron_mg:null}).servingHash);
});
test('additive migration contains governed registry, lineage, release, serving, batch and KPI persistence',()=>{
  const sql=fs.readFileSync(new URL('../../backend/src/db/migrations/0047_canonical_ingredient_recipe_foundation.sql',import.meta.url),'utf8');
  for(const table of ['canonical_ingredients','canonical_ingredient_source_mappings','controlled_food_human_gate_submissions','canonical_recipe_versions','controlled_food_validation_releases','controlled_food_serving_variants','food_population_batches','food_coverage_runs']) assert.match(sql,new RegExp(table));
  assert.match(sql,/APPROVED_MEASURED_LOCAL_REFERENCE/); assert.match(sql,/CANONICAL_INGREDIENT_SOURCE_SUPERSESSION_REQUIRED/); assert.match(sql,/CANONICAL_FOUNDATION_HISTORY_IS_APPEND_ONLY/);
});
test('Batch 1 remains pending and no downstream release is fabricated',()=>{
  const status=JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/stage-b.machine-status.json',import.meta.url),'utf8'));
  assert.equal(status.realCalculationsExecuted,0); assert.equal(status.realStageBApprovals,0); assert.equal(status.canonicalMeasurementRunsFound,0); assert.equal(status.validationRelease,'NOT_CREATED');
  const stageA=JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/stage-a.batch-1.pending-approval.json',import.meta.url),'utf8'));
  assert.ok(stageA.formulas.every((x:any)=>x.review.decision==='PENDING'));
});
test('hashing is deterministic and material changes alter lineage hashes',()=>{assert.equal(canonicalHash({b:2,a:1}),canonicalHash({a:1,b:2}));assert.notEqual(canonicalHash({a:1}),canonicalHash({a:2}));});

test('v8 audit fails closed when only an execution contract, not human decisions, is supplied',()=>{
  const report=JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.gate-report.v8.json',import.meta.url),'utf8'));
  assert.equal(report.inputClassification,'EXECUTION_CONTRACT_ONLY_NO_AUTHORISED_HUMAN_DECISION_SUBMISSION');
  assert.equal(report.packageValidation.status,'REJECTED_AS_DECISION_EVIDENCE');
  assert.deepEqual(report.counts,{stageAApproved:0,sourceDecisionsAccepted:0,formulaHashes:0,canonicalMeasurementRuns:0,calculations:0,reconciled:0,stageBPackages:0,validationReleases:0});
  assert.equal(report.recipes.length,5);
  assert.ok(report.recipes.every((recipe:any)=>recipe.stageA==='PENDING' && recipe.formulaHash===null && recipe.calculationHash===null));
  assert.equal(report.programmeState.production,'UNCHANGED');
});

test('v9 ingests 5/5 human approvals while incomplete source vectors block every calculation',()=>{
  const decisions=JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.human-gate-decisions.v2.json',import.meta.url),'utf8'));
  const report=JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.gate-report.v9.json',import.meta.url),'utf8'));
  assert.equal(decisions.status,'IMMUTABLE_ACCEPTED');
  assert.equal(decisions.stageA.length,5); assert.ok(decisions.stageA.every((x:any)=>x.decision==='APPROVED' && /^[a-f0-9]{64}$/.test(x.decisionHash)));
  assert.equal(decisions.sourceDecisions.length,5); assert.ok(decisions.sourceDecisions.every((x:any)=>x.humanDecision==='APPROVED'));
  assert.equal(report.counts.stageAApproved,5); assert.equal(report.counts.sourceHumanDecisionsApproved,5);
  assert.equal(report.counts.calculationReadySources,2); assert.equal(report.counts.canonicalIngredientMappings,2);
  assert.equal(report.counts.formulaHashes,0); assert.equal(report.counts.canonicalMeasurementRuns,0); assert.equal(report.counts.calculations,0); assert.equal(report.counts.validationReleases,0);
  assert.ok(report.recipes.every((x:any)=>x.stageADecision==='APPROVED' && x.formulaHash===null && x.remainingBlockers.length===1));
  assert.equal(report.productionStatus,'UNCHANGED');
});

test('v9 preserves v8 history and never promotes missing nutrients to zero',()=>{
  const v8=JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.gate-report.v8.json',import.meta.url),'utf8'));
  const decisions=JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.human-gate-decisions.v2.json',import.meta.url),'utf8'));
  assert.equal(v8.packageValidation.status,'REJECTED_AS_DECISION_EVIDENCE');
  const incomplete=decisions.sourceDecisions.filter((x:any)=>!x.nutrientVectorComplete);
  assert.deepEqual(incomplete.map((x:any)=>x.ingredientId),['REFINED_SUNFLOWER_OIL','SPLIT_HULLED_YELLOW_MOONG_DAL','DRY_FLATTENED_RICE_POHA']);
  assert.ok(incomplete.every((x:any)=>x.calculationEligible===false));
});
