import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRecoveryCandidate,evaluateEverydayNutritionProposal,evaluateSelfReportedMindWellnessProposal,evaluateStrictClinicalComposite,projectConsumedFoodQuality,resolveGovernedGoal } from '../../packages/health-intelligence/src/index.js';

test('governed goal resolution rejects absent display defaults and accepts explicit active user goals',()=>{
  assert.equal(resolveGovernedGoal({}, {min:1000,max:50000}).value,null);
  assert.deepEqual(resolveGovernedGoal({user:{value:8000,source:'USER',active:true,approved:true,updatedAt:'2026-11-18T00:00:00Z'}},{min:1000,max:50000}),{value:8000,source:'USER',status:'RESOLVED',reason:'Active approved user goal.'});
});

test('food-quality proposal fails closed for incomplete or unverified consumption logs',()=>{
  assert.equal(projectConsumedFoodQuality({logComplete:false,consumedFoods:[]}).score,null);
  assert.equal(projectConsumedFoodQuality({logComplete:true,consumedFoods:[{verified:false,foodGroup:'fruit',fibreGrams:2,addedSugarGrams:0}]}).score,null);
  assert.equal(projectConsumedFoodQuality({logComplete:true,consumedFoods:[{verified:true,foodGroup:'fruit',fibreGrams:5,addedSugarGrams:0},{verified:true,foodGroup:'legume',fibreGrams:10,addedSugarGrams:5}]}).score,63.33);
});

test('strict clinical option remains unavailable without markers while everyday option is separately versioned',()=>{
  assert.equal(evaluateStrictClinicalComposite({protein:80,hydration:90,foodQuality:70,clinicalMarkers:null}).score,null);
  assert.equal(evaluateStrictClinicalComposite({protein:80,hydration:90,foodQuality:70,clinicalMarkers:60}).score,74);
  const everyday=evaluateEverydayNutritionProposal({protein:80,hydration:90,foodQuality:70});
  assert.equal(everyday.score,80);assert.equal(everyday.status,'PROPOSAL_ONLY');
});

test('self-reported Mind alternative is separately versioned, non-diagnostic and fail closed',()=>{
  assert.equal(evaluateSelfReportedMindWellnessProposal({moodScores:[70],completedSessions:1,sessionGoal:1}).score,null);
  const result=evaluateSelfReportedMindWellnessProposal({moodScores:[70,70,70,70,70,70,70],completedSessions:2,sessionGoal:2});
  assert.equal(result.score,82);assert.equal(result.status,'PROPOSAL_ONLY');
  assert.equal(evaluateSelfReportedMindWellnessProposal({moodScores:[70,70,70,70,70,70,70,70],completedSessions:2,sessionGoal:2}).score,null);
  assert.match(result.label,/Non-diagnostic/);
});

test('Recovery body baseline is independent of Sleep and does not depend on Mind or Nourishment',()=>{
  const score=(sleepScore:number)=>calculateRecoveryCandidate({healthDay:'2026-11-18',calculatedAt:'2026-11-18T12:00:00Z',freshness:'CURRENT',sleep:{domain:'sleep',score:sleepScore,status:'CALCULATED',methodologyId:'qa',methodologyVersion:'qa',healthDay:'2026-11-18',calculatedAt:'2026-11-18T12:00:00Z',confidence:'HIGH',inputFreshness:'CURRENT',inputsUsed:[],inputsMissing:[],contributingFactors:[],explanation:'qa',activation:'CANDIDATE_ONLY',clinicalValidation:'PENDING'},activityBalance:80,currentHrv:50,hrvBaselineSameType:50,currentRestingHeartRate:60,restingHeartRateBaseline:60,baselineDays:28,sleepBehaviour:80,activityDistribution:80,mindfulnessPractice:80,explicitLifestyleHabits:[80]});
  const high=score(80),low=score(60);assert.equal(high.score,71);assert.equal(low.score,63);
  assert.equal(high.inputsMissing.includes('mind_score'),false);assert.equal(high.inputsMissing.includes('nourishment_score'),false);
});
