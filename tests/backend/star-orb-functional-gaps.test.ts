import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEverydayNutritionProposal,evaluateStrictClinicalComposite,projectConsumedFoodQuality,resolveGovernedGoal } from '../../packages/health-intelligence/src/index.js';

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
  assert.deepEqual(evaluateStrictClinicalComposite({protein:80,hydration:90,foodQuality:70,clinicalMarkers:60}),{score:74,status:'CALCULATED'});
  const everyday=evaluateEverydayNutritionProposal({protein:80,hydration:90,foodQuality:70});
  assert.equal(everyday.score,78.67);assert.equal(everyday.status,'PROPOSAL_ONLY');
});
