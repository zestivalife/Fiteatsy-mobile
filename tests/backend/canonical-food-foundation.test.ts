import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { assertIngredientSourceState, assertMandatoryNutritionVector, assertSourceMappingEligible, assertSourceRights, canonicalHash, evaluateStageBReview, ingestHumanGateSubmission, ingredientIdentityKey, measureCoverage, servingVariant, type CanonicalIngredientIdentity, type SourceMapping, type StageBReviewInput } from '../../backend/src/modules/nutrition/food-curation/canonical-food-foundation.js';

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

test('v10 closes sunflower from official SR Legacy evidence and keeps IFCT rights fail-closed',()=>{
  const source=JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.source-resolution.v10.json',import.meta.url),'utf8'));
  const byId=new Map(source.ingredients.map((x:any)=>[x.ingredientId,x]));
  const sunflower:any=byId.get('REFINED_SUNFLOWER_OIL');
  assert.deepEqual(sunflower.mandatoryVector,{energyKcal:884,proteinG:0,carbohydrateG:0,fatG:100,fibreG:0});
  assert.equal(sunflower.selectedSource.externalId,'171025'); assert.equal(sunflower.calculationReady,true);
  for(const id of ['SPLIT_HULLED_YELLOW_MOONG_DAL','DRY_FLATTENED_RICE_POHA']) { const item:any=byId.get(id); assert.equal(item.calculationReady,false); assert.ok(item.remainingBlockers.includes('SOURCE_RIGHTS_BLOCK_CANONICAL_INGESTION')); }
});

test('v10 partially auto-advances only complete recipes through Stage B package generation',()=>{
  const gate=JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.gate-report.v10.json',import.meta.url),'utf8'));
  const calculations=JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.calculations.v10.json',import.meta.url),'utf8'));
  assert.equal(gate.counts.formulaHashes,2); assert.equal(gate.counts.canonicalMeasurementRuns,2); assert.equal(gate.counts.calculations,2); assert.equal(gate.counts.stageBPacks,2); assert.equal(gate.counts.validationReleases,0);
  assert.deepEqual(calculations.calculations.map((x:any)=>x.recipeId),['CP_CHAPATI','CP_BHINDI_SABJI']);
  assert.ok(calculations.calculations.every((x:any)=>x.reconciliation==='PASS' && /^[a-f0-9]{64}$/.test(x.formulaHash) && /^[a-f0-9]{64}$/.test(x.measurementHash) && /^[a-f0-9]{64}$/.test(x.calculationHash)));
  assert.equal(gate.productionStatus,'UNCHANGED');
});

test('v10 scaling reconciles batch, per-100g and serving without intermediate rounding',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.calculations.v10.json',import.meta.url),'utf8'));
  for(const x of data.calculations) for(const code of ['energyKcal','proteinG','carbohydrateG','fatG','fibreG']) {
    assert.ok(Math.abs(x.per100gNutrition[code]-x.batchNutrition[code]*100/(x.recipeId==='CP_CHAPATI'?175:110))<1e-12);
    assert.ok(Math.abs(x.servingNutrition[code]-x.per100gNutrition[code]*x.servingGrams/100)<1e-12);
  }
});

test('v10 Stage B packs require human review and contain no validation release',()=>{
  for(const file of ['batch-1.stage-b.CP_CHAPATI.v10.json','batch-1.stage-b.CP_BHINDI_SABJI.v10.json']) { const pack=JSON.parse(fs.readFileSync(new URL(`../../backend/src/modules/nutrition/food-curation/data/${file}`,import.meta.url),'utf8')); assert.equal(pack.state,'STAGE_B_HUMAN_REVIEW_REQUIRED'); assert.equal(pack.reconciliation,'PASS'); assert.equal(pack.validationRelease,null); }
});

const stageB:StageBReviewInput={decisionId:'SB1',recipeId:'CP_CHAPATI',recipeVersion:'v1',reviewPackId:'P1',reviewPackVersion:10,formulaHash:'f',expectedFormulaHash:'f',measurementHash:'m',expectedMeasurementHash:'m',calculationHash:'c',expectedCalculationHash:'c',reviewPackHash:'p',evidenceHash:'e',reviewerId:'RD1',reviewerQualification:'Registered Dietitian',qualificationReference:'REG-1',decision:'APPROVED',decisionDate:'2026-09-03',declaration:'I reviewed the bound evidence.',rationale:'Calculation and reconciliation accepted.',reconciliation:'PASS',sourcesActive:true,immutableEvidence:true};
test('v11 Stage B approval with valid hashes is release eligible',()=>assert.equal(evaluateStageBReview(stageB).releaseEligible,true));
test('v11 pending input cannot create a release',()=>assert.equal(evaluateStageBReview({...stageB,decision:'PENDING' as any}).releaseEligible,false));
test('v11 changes required creates no release',()=>assert.deepEqual([evaluateStageBReview({...stageB,decision:'CHANGES_REQUIRED'}).state,evaluateStageBReview({...stageB,decision:'CHANGES_REQUIRED'}).releaseEligible],['STAGE_B_CHANGES_REQUIRED',false]));
test('v11 rejected creates no release',()=>assert.deepEqual([evaluateStageBReview({...stageB,decision:'REJECTED'}).state,evaluateStageBReview({...stageB,decision:'REJECTED'}).releaseEligible],['STAGE_B_REJECTED',false]));
test('v11 stale formula hash blocks release',()=>assert.ok(evaluateStageBReview({...stageB,formulaHash:'stale'}).errors.includes('STALE_FORMULA_HASH')));
test('v11 stale measurement hash blocks release',()=>assert.ok(evaluateStageBReview({...stageB,measurementHash:'stale'}).errors.includes('STALE_MEASUREMENT_HASH')));
test('v11 stale calculation hash blocks release',()=>assert.ok(evaluateStageBReview({...stageB,calculationHash:'stale'}).errors.includes('STALE_CALCULATION_HASH')));
test('v11 failed reconciliation blocks release',()=>assert.ok(evaluateStageBReview({...stageB,reconciliation:'FAIL'}).errors.includes('RECONCILIATION_NOT_PASSED')));
test('v11 superseded source blocks release',()=>assert.ok(evaluateStageBReview({...stageB,sourcesActive:false}).errors.includes('SOURCE_MAPPING_NOT_ACTIVE')));
test('v11 exact duplicate Stage B approval is idempotent',()=>{const x=evaluateStageBReview(stageB);assert.equal(evaluateStageBReview(stageB,{decisionHash:x.decisionHash,decision:'APPROVED'}).accepted,true)});
test('v11 conflicting Stage B decision fails',()=>{const x=evaluateStageBReview(stageB);assert.ok(evaluateStageBReview({...stageB,decision:'REJECTED'},{decisionHash:x.decisionHash,decision:'APPROVED'}).errors.includes('CONFLICTING_STAGE_B_DECISION'))});
test('v11 mutated immutable evidence blocks release',()=>assert.ok(evaluateStageBReview({...stageB,immutableEvidence:false}).errors.includes('EVIDENCE_MUTATION')));
test('v11 valid explicit source rights permit ingestion',()=>assert.doesNotThrow(()=>assertSourceRights({status:'APPROVED',licence:'CC0-1.0',evidence:'official terms',allowedUse:'database'})));
test('v11 missing rights metadata blocks ingestion',()=>assert.throws(()=>assertSourceRights({status:'MISSING',licence:null,evidence:null,allowedUse:null}),/SOURCE_RIGHTS_NOT_APPROVED/));
test('v11 public URL alone is not rights evidence',()=>assert.throws(()=>assertSourceRights({status:'APPROVED',licence:null,evidence:'https://example.test',allowedUse:null}),/SOURCE_RIGHTS_NOT_APPROVED/));
test('v11 source replacement requires rights',()=>assert.throws(()=>assertSourceRights({status:'REJECTED',licence:'unknown',evidence:'source page',allowedUse:'unknown'}),/SOURCE_RIGHTS_NOT_APPROVED/));
test('v11 IFCT ingestion stays blocked without permission artifact',()=>{const v=JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.source-resolution.v11.json',import.meta.url),'utf8'));assert.equal(v.rightsInspection.numericIfctDataIngested,false)});
test('v11 rights status participates in source provenance hash',()=>assert.notEqual(canonicalHash({source:'A',rights:'APPROVED'}),canonicalHash({source:'A',rights:'MISSING'})));
test('v11 missing potato fibre blocks source completeness',()=>assert.throws(()=>assertMandatoryNutritionVector({energyKcal:81,proteinG:2.27,carbohydrateG:17.8,fatG:.36,fibreG:null}),/fibreG/));
test('v11 explicit source-reported zero is accepted',()=>assert.doesNotThrow(()=>assertMandatoryNutritionVector({energyKcal:884,proteinG:0,carbohydrateG:0,fatG:100,fibreG:0})));
test('v11 complete raw potato source is accepted',()=>{assert.doesNotThrow(()=>assertIngredientSourceState('POTATO','Potatoes, flesh and skin, raw'));assert.doesNotThrow(()=>assertMandatoryNutritionVector({energyKcal:77,proteinG:2.05,carbohydrateG:17.5,fatG:.09,fibreG:2.1}))});
test('v11 cooked potato is rejected for raw formula',()=>assert.throws(()=>assertIngredientSourceState('POTATO','Potatoes, cooked, boiled'),/POTATO_STATE_MISMATCH/));
test('v11 potato supersession preserves historical mapping',()=>{const v=JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.source-resolution.v11.json',import.meta.url),'utf8'));const p=v.sources.find((x:any)=>x.ingredientId==='POTATO');assert.equal(p.supersedes,'USDA_FDC:2346401')});
test('v11 potato closure automatically advances Bhindi Aloo',()=>{const v=JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.gate-report.v11.json',import.meta.url),'utf8'));const r=v.recipes.find((x:any)=>x.recipeId==='CP_BHINDI_ALOO');assert.equal(r.reconciliation,'PASS');assert.ok(r.stageBPack)});
for(const [description] of [['Mung beans, mature seeds, raw'],['Mung beans, cooked'],['Mung bean sprouts, raw'],['Lentils, raw']]) test(`v11 rejects non-exact moong identity: ${description}`,()=>assert.throws(()=>assertIngredientSourceState('MOONG',description),/MOONG_IDENTITY_MISMATCH/));
for(const [description] of [['Rice, white, raw'],['Rice, cooked'],['Rice, puffed'],['Poha, prepared']]) test(`v11 rejects non-exact poha identity: ${description}`,()=>assert.throws(()=>assertIngredientSourceState('POHA',description),/POHA_IDENTITY_MISMATCH/));
test('v11 gate report remains partial, fail-closed and production inactive',()=>{const v=JSON.parse(fs.readFileSync(new URL('../../backend/src/modules/nutrition/food-curation/data/batch-1.gate-report.v11.json',import.meta.url),'utf8'));assert.equal(v.counts.stageBDecisions,0);assert.equal(v.counts.validationReleases,0);assert.equal(v.batch1ReleaseStatus,'PARTIAL_0_OF_5_VALIDATION_RELEASES');assert.equal(v.productionStatus,'UNCHANGED');assert.ok(v.recipes.every((x:any)=>x.productionActive===false))});
