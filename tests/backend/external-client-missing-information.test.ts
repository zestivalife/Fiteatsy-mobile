import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateCompletion, deriveExternalDietEligibility, externalDietMissingFields } from '../../backend/src/modules/external-clients/external-client-intake.repository.js';

const auditMigration=readFileSync(new URL('../../backend/src/db/migrations/0097_external_missing_information_audit.sql',import.meta.url),'utf8');

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

test('production audit constraint accepts focused missing-information completion',()=>{
  assert.match(auditMigration,/CLIENT_REQUIRED_INFORMATION_COMPLETED/);
  assert.match(auditMigration,/external_client_audit_events_event_type_check/);
});

test('zero missing fields never bypasses consent or canonical intake completion',()=>{
  const sections={...base,goals:{primaryGoal:'WEIGHT_MANAGEMENT'},nutrition:{dietPreference:'VEGETARIAN'},measurements:{weightKg:72.4}};
  assert.deepEqual(deriveExternalDietEligibility(sections,{consentedAt:null,intakeStatus:'IN_PROGRESS',clientIntakeState:'IN_PROGRESS'}),{
    eligible:false,reasons:['CONSENT_REQUIRED','INTAKE_NOT_COMPLETED'],missingRequiredFields:[],
  });
  assert.equal(deriveExternalDietEligibility(sections,{consentedAt:new Date(),intakeStatus:'COMPLETED',clientIntakeState:'COMPLETED'}).eligible,true);
});

test('Save and Recheck finalises only an already-consented complete intake',()=>{
  const repository=readFileSync(new URL('../../backend/src/modules/external-clients/external-client360.repository.ts',import.meta.url),'utf8');
  assert.match(repository,/missing\.length===0&&intake\.consented_at/);
  assert.match(repository,/external_client_intakes set status='COMPLETED'/);
  assert.match(repository,/external_clients set intake_state='COMPLETED'/);
  assert.match(repository,/status=case when status in \('INVITED','INTAKE_STARTED'\) then 'INTAKE_COMPLETED' else status end/);
});
