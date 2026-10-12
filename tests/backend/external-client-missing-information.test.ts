import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCompletion, externalDietMissingFields } from '../../backend/src/modules/external-clients/external-client-intake.repository.js';

const base={aboutYou:{firstName:'QA',lastName:'Client',gender:'FEMALE',mobile:'+919700000000'}};

test('diet eligibility returns only the three canonical missing required fields',()=>{
  const missing=externalDietMissingFields(base);
  assert.deepEqual(missing.map(field=>field.code),['PRIMARY_GOAL','DIET_PREFERENCE','CURRENT_WEIGHT']);
  assert.ok(missing.every(field=>field.consultantCanEdit&&field.clientCanEdit));
  assert.ok(missing.every(field=>['PILL_SINGLE','STRUCTURED_NUMBER'].includes(field.control)));
});

test('primary goal, diet preference, and current weight enable eligibility and 100% completeness',()=>{
  const sections={...base,goals:{primaryGoal:'WEIGHT_MANAGEMENT'},nutrition:{dietPreference:'VEGETARIAN'},measurements:{weightKg:72.4}};
  assert.deepEqual(externalDietMissingFields(sections),[]);
  assert.equal(calculateCompletion(sections),100);
});

test('invalid weight remains missing and never becomes a plausible completed value',()=>{
  const sections={...base,goals:{primaryGoal:'WEIGHT_MANAGEMENT'},nutrition:{dietPreference:'VEGETARIAN'},measurements:{weightKg:0}};
  assert.deepEqual(externalDietMissingFields(sections).map(field=>field.code),['CURRENT_WEIGHT']);
  assert.ok(calculateCompletion(sections)<100);
});
