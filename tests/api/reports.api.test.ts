import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteRequest, getJson, patchJson, postJson } from '../helpers/http.js';
import { buildMultipartReportForm } from '../helpers/reportFixtures.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => {
  server = await startTestServer();
});

test.after(async () => {
  await server.close();
});

test.beforeEach(() => {
  resetTestState();
});

test('GET /v1/reports/supported-formats returns 200', async () => {
  const { response, body } = await getJson(server.baseUrl, '/v1/reports/supported-formats');
  assert.equal(response.status, 200);
  assert.equal(Array.isArray(body.formats), true);
});

test('upload init and complete validate metadata, 201, 400, 404, 413, and 415 paths', async () => {
  const created = await postJson(server.baseUrl, '/v1/reports/upload/init', {
    userId: 'report-user',
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
  });
  assert.equal(created.response.status, 201);

  const completed = await postJson(server.baseUrl, '/v1/reports/upload/complete', {
    uploadId: created.body.uploadId,
  });
  assert.equal(completed.response.status, 200);

  const invalid = await postJson(server.baseUrl, '/v1/reports/upload/init', {
    fileName: '',
    mimeType: 'application/pdf',
    fileSize: 0,
  });
  assert.equal(invalid.response.status, 400);

  const unsupported = await postJson(server.baseUrl, '/v1/reports/upload/init', {
    fileName: 'report.txt',
    mimeType: 'text/plain',
    fileSize: 100,
  });
  assert.equal(unsupported.response.status, 415);

  const oversized = await postJson(server.baseUrl, '/v1/reports/upload/init', {
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    fileSize: 13 * 1024 * 1024,
  });
  assert.equal(oversized.response.status, 413);

  const missingUpload = await postJson(server.baseUrl, '/v1/reports/upload/complete', {
    uploadId: 'upl_missing',
  });
  assert.equal(missingUpload.response.status, 404);
});

test('report list, detail, metadata patch, status, feedback, delete, and 404 paths work', async () => {
  const analyzed = await fetch(`${server.baseUrl}/v1/reports/analyze`, {
    method: 'POST',
    headers: { 'x-user-id': 'report-owner' },
    body: buildMultipartReportForm(),
  });
  const analyzedBody = await analyzed.json();
  assert.equal(analyzed.status, 200);

  const list = await getJson(server.baseUrl, '/v1/reports?userId=report-owner');
  assert.equal(list.response.status, 200);
  assert.equal(list.body.total, 1);

  const detail = await getJson(server.baseUrl, `/v1/reports/${analyzedBody.reportId}?userId=report-owner`);
  assert.equal(detail.response.status, 200);

  const status = await getJson(server.baseUrl, `/v1/reports/${analyzedBody.reportId}/status?userId=report-owner`);
  assert.equal(status.response.status, 200);

  const metadata = await patchJson(
    server.baseUrl,
    `/v1/reports/${analyzedBody.reportId}/metadata?userId=report-owner`,
    { labName: 'Updated Lab' }
  );
  assert.equal(metadata.response.status, 200);
  assert.equal(metadata.body.labName, 'Updated Lab');

  const feedback = await postJson(
    server.baseUrl,
    `/v1/reports/${analyzedBody.reportId}/feedback?userId=report-owner`,
    { note: 'Corrected OCR label' }
  );
  assert.equal(feedback.response.status, 201);

  const missing = await getJson(server.baseUrl, '/v1/reports/rep_missing?userId=report-owner');
  assert.equal(missing.response.status, 404);

  const removed = await deleteRequest(server.baseUrl, `/v1/reports/${analyzedBody.reportId}?userId=report-owner`);
  assert.equal(removed.response.status, 204);
});

test('report comparison and reanalyze endpoints return expected 200, 400, 404, and 501 states', async () => {
  const first = await fetch(`${server.baseUrl}/v1/reports/analyze`, {
    method: 'POST',
    headers: { 'x-user-id': 'comparison-user' },
    body: buildMultipartReportForm({ reportName: 'first.pdf', reportDate: '14 Mar 2026' }),
  });
  const firstBody = await first.json();
  const second = await fetch(`${server.baseUrl}/v1/reports/analyze`, {
    method: 'POST',
    headers: { 'x-user-id': 'comparison-user' },
    body: buildMultipartReportForm({ reportName: 'second.pdf', reportDate: '20 Apr 2026' }),
  });
  const secondBody = await second.json();

  const compared = await getJson(
    server.baseUrl,
    `/v1/reports/${secondBody.reportId}/comparison?userId=comparison-user&previousReportId=${firstBody.reportId}`
  );
  assert.equal(compared.response.status, 200);

  const missingPrevious = await getJson(
    server.baseUrl,
    `/v1/reports/${secondBody.reportId}/comparison?userId=comparison-user`
  );
  assert.equal(missingPrevious.response.status, 400);

  const unknownPrevious = await getJson(
    server.baseUrl,
    `/v1/reports/${secondBody.reportId}/comparison?userId=comparison-user&previousReportId=rep_missing`
  );
  assert.equal(unknownPrevious.response.status, 404);

  const reanalyze = await postJson(
    server.baseUrl,
    `/v1/reports/${secondBody.reportId}/reanalyze`,
    {}
  );
  assert.equal(reanalyze.response.status, 501);
});

test('POST /v1/reports/analyze returns 400 without a file', async () => {
  const form = new FormData();
  const response = await fetch(`${server.baseUrl}/v1/reports/analyze`, { method: 'POST', body: form });
  assert.equal(response.status, 400);
});

test.skip('reports endpoints should return 401 and 403 once report ownership auth is enforced centrally');
