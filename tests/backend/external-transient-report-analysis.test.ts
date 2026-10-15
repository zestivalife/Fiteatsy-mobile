import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repository=readFileSync(new URL('../../backend/src/modules/external-clients/external-transient-report.repository.ts',import.meta.url),'utf8');
const routes=readFileSync(new URL('../../backend/src/modules/external-clients/external-clients.routes.ts',import.meta.url),'utf8');
const intakeRoutes=readFileSync(new URL('../../backend/src/modules/external-clients/external-client-invitations.routes.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../../backend/src/db/migrations/0101_external_transient_report_analysis.sql',import.meta.url),'utf8');
const sharedExtractor=readFileSync(new URL('../../backend/src/modules/reports/reports.service.ts',import.meta.url),'utf8');

test('transient analysis calls the frozen shared extractor without persisting source bytes',()=>{
  assert.match(repository,/analyzeReportBuffer\(input\.buffer,valid\.mimeType\)/);
  assert.doesNotMatch(repository,/original_file|bytea|external_client_documents/);
  assert.match(repository,/fileBytesPersisted:false/);
  assert.ok(sharedExtractor.length>0);
});

test('review token and raw extraction digest bind the save request',()=>{
  assert.match(repository,/review_token_hash/);
  assert.match(repository,/extracted_payload_hash/);
  assert.match(repository,/REPORT_REVIEW_TOKEN_INVALID/);
  assert.match(repository,/REPORT_REVIEW_PAYLOAD_INVALID/);
  assert.match(repository,/redisCommand\(\['SET',reviewKey\(analysisId\)/);
  assert.match(repository,/REVIEW_TTL_SECONDS/);
  assert.match(repository,/redisCommand\(\['DEL',reviewKey\(analysisId\)/);
});

test('only confirmed or corrected values enter the external-only biomarker table',()=>{
  assert.match(repository,/\['CONFIRMED','CORRECTED'\]/);
  assert.match(repository,/insert into external_confirmed_biomarkers/);
  assert.match(migration,/create table external_confirmed_biomarkers/);
  assert.doesNotMatch(migration,/alter table/);
});

test('new endpoints are external-client scoped and preserve legacy endpoints',()=>{
  assert.match(routes,/\/:id\/report-analyses/);
  assert.match(routes,/\/:id\/transient-biomarkers/);
  assert.match(routes,/\/:id\/documents/);
  assert.match(routes,/\/:id\/report-analyses\/pending/);
  assert.match(intakeRoutes,/\/:token\/report-analyses/);
  assert.match(repository,/CLIENT_SELF_REPORTED/);
});

test('repeat save is idempotent and does not create duplicate observations',()=>{
  assert.match(repository,/status==='CONFIRMED'\)return\{status:'CONFIRMED',savedCount:run\.rows\[0\]\.confirmed_count\|\|0,rejectedCount:run\.rows\[0\]\.rejected_count\|\|0,filePersisted:false,alreadySaved:true\}/);
  assert.match(migration,/unique\s*\(tenant_id,client_id,analysis_id,row_identity\)/i);
});
