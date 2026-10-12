import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { externalClientBrandName } from '../../backend/src/modules/external-clients/external-client-intake.repository.js';

const migration=fs.readFileSync(new URL('../../backend/src/db/migrations/0096_external_client_p0_hardening.sql',import.meta.url),'utf8');
const intake=fs.readFileSync(new URL('../../backend/src/modules/external-clients/external-client-intake.repository.ts',import.meta.url),'utf8');
const client360=fs.readFileSync(new URL('../../backend/src/modules/external-clients/external-client360.repository.ts',import.meta.url),'utf8');
const intakeRoutes=fs.readFileSync(new URL('../../backend/src/modules/external-clients/external-client-invitations.routes.ts',import.meta.url),'utf8');
const clientRoutes=fs.readFileSync(new URL('../../backend/src/modules/external-clients/external-clients.routes.ts',import.meta.url),'utf8');

test('report processing schema matches runtime retry contract',()=>{
  assert.match(migration,/processing_attempts integer not null default 0/);
  assert.match(migration,/processing_started_at timestamptz/);
  for(const state of ['QUEUED','PROCESSING','EXTRACTED','REVIEW_REQUIRED','CONFIRMED','FAILED','NOT_APPLICABLE'])assert.match(migration,new RegExp(`'${state}'`));
  assert.match(intake,/category==='LAB_REPORT'\?'QUEUED':'NOT_APPLICABLE'/);
  assert.ok(migration.indexOf("set processing_status = 'QUEUED'")<migration.indexOf('add constraint external_client_document_processing_check'));
});

test('canonical client identity cannot silently diverge through public intake',()=>{
  for(const field of ['first_name','last_name','date_of_birth','mobile','email'])assert.match(intake,new RegExp(`a\\.client\\.${field}`));
  assert.match(intake,/canonicalPayload=section==='aboutYou'/);
});

test('Client 360 missing state uses required fields rather than optional sections',()=>{
  assert.match(client360,/intakeRequiredState\(sections\)/);
  assert.doesNotMatch(client360,/missingSections = applicable\.filter/);
});

test('external branding is tenant-aware and never requires Zestiva as a fallback',()=>{
  assert.equal(externalClientBrandName('INDEPENDENT_CONSULTANT','Private tenant','Dr QA'),'Dr QA');
  assert.equal(externalClientBrandName('PRACTICE','Governed QA Practice','Dr QA'),'Governed QA Practice');
  assert.equal(externalClientBrandName('CLINIC','Governed QA Clinic','Dr QA'),'Governed QA Clinic');
  assert.equal(externalClientBrandName('INDEPENDENT_CONSULTANT','',''),'Your consultant');
});

test('external intake accepts structured location and external errors are safe contracts',()=>{
  for(const field of ['locationCountry','locationRegion','locationCity'])assert.match(intakeRoutes,new RegExp(field));
  for(const source of [intakeRoutes,clientRoutes]){
    assert.match(source,/safe_message/);
    assert.match(source,/correlation_id/);
    assert.match(source,/retryable/);
    assert.doesNotMatch(source,/message:error instanceof Error\?error\.message/);
  }
});
