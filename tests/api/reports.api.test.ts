import test from 'node:test';
import assert from 'node:assert/strict';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
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

test.beforeEach(async () => {
  await resetTestState();
});

test('GET /v1/reports/supported-formats returns 200', async () => {
  const { response, body } = await getJson(server.baseUrl, '/v1/reports/supported-formats');
  assert.equal(response.status, 200);
  assert.equal(Array.isArray(body.formats), true);
});

test('upload init and complete validate metadata, 201, 400, 404, 413, and 415 paths', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const created = await postJson(server.baseUrl, '/v1/reports/upload/init', {
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(created.response.status, 201);

  const completed = await postJson(server.baseUrl, '/v1/reports/upload/complete', {
    uploadId: created.body.uploadId,
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(completed.response.status, 200);

  const invalid = await postJson(server.baseUrl, '/v1/reports/upload/init', {
    fileName: '',
    mimeType: 'application/pdf',
    fileSize: 0,
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(invalid.response.status, 400);

  const unsupported = await postJson(server.baseUrl, '/v1/reports/upload/init', {
    fileName: 'report.txt',
    mimeType: 'text/plain',
    fileSize: 100,
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(unsupported.response.status, 415);

  const oversized = await postJson(server.baseUrl, '/v1/reports/upload/init', {
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    fileSize: 13 * 1024 * 1024,
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(oversized.response.status, 413);

  const missingUpload = await postJson(server.baseUrl, '/v1/reports/upload/complete', {
    uploadId: 'upl_missing',
  }, {
    headers: authHeaders(session.token)
  });
  assert.equal(missingUpload.response.status, 404);
});

test('report list, detail, metadata patch, status, feedback, delete, and 404 paths work', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const analyzed = await fetch(`${server.baseUrl}/v1/reports/analyze`, {
    method: 'POST',
    headers: authHeaders(session.token),
    body: buildMultipartReportForm(),
  });
  const analyzedBody = await analyzed.json();
  assert.equal(analyzed.status, 200);

  const list = await getJson(server.baseUrl, '/v1/reports?userId=report-owner', {
    headers: authHeaders(session.token)
  });
  assert.equal(list.response.status, 200);
  assert.equal(list.body.total, 1);

  const detail = await getJson(server.baseUrl, `/v1/reports/${analyzedBody.reportId}?userId=report-owner`, {
    headers: authHeaders(session.token)
  });
  assert.equal(detail.response.status, 200);

  const status = await getJson(server.baseUrl, `/v1/reports/${analyzedBody.reportId}/status?userId=report-owner`, {
    headers: authHeaders(session.token)
  });
  assert.equal(status.response.status, 200);

  const metadata = await patchJson(
    server.baseUrl,
    `/v1/reports/${analyzedBody.reportId}/metadata?userId=report-owner`,
    { labName: 'Updated Lab' },
    { headers: authHeaders(session.token) }
  );
  assert.equal(metadata.response.status, 200);
  assert.equal(metadata.body.labName, 'Updated Lab');

  const feedback = await postJson(
    server.baseUrl,
    `/v1/reports/${analyzedBody.reportId}/feedback?userId=report-owner`,
    { note: 'Corrected OCR label' },
    { headers: authHeaders(session.token) }
  );
  assert.equal(feedback.response.status, 201);

  const missing = await getJson(server.baseUrl, '/v1/reports/rep_missing?userId=report-owner', {
    headers: authHeaders(session.token)
  });
  assert.equal(missing.response.status, 404);

  const removed = await deleteRequest(server.baseUrl, `/v1/reports/${analyzedBody.reportId}?userId=report-owner`, {
    headers: authHeaders(session.token)
  });
  assert.equal(removed.response.status, 204);
});

test('report comparison and reanalyze endpoints return expected 200, 400, 404, and 501 states', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const first = await fetch(`${server.baseUrl}/v1/reports/analyze`, {
    method: 'POST',
    headers: authHeaders(session.token),
    body: buildMultipartReportForm({ reportName: 'first.pdf', reportDate: '14 Mar 2026' }),
  });
  const firstBody = await first.json();
  const second = await fetch(`${server.baseUrl}/v1/reports/analyze`, {
    method: 'POST',
    headers: authHeaders(session.token),
    body: buildMultipartReportForm({ reportName: 'second.pdf', reportDate: '20 Apr 2026' }),
  });
  const secondBody = await second.json();

  const compared = await getJson(
    server.baseUrl,
    `/v1/reports/${secondBody.reportId}/comparison?userId=comparison-user&previousReportId=${firstBody.reportId}`,
    { headers: authHeaders(session.token) }
  );
  assert.equal(compared.response.status, 200);

  const missingPrevious = await getJson(
    server.baseUrl,
    `/v1/reports/${secondBody.reportId}/comparison?userId=comparison-user`,
    { headers: authHeaders(session.token) }
  );
  assert.equal(missingPrevious.response.status, 400);

  const unknownPrevious = await getJson(
    server.baseUrl,
    `/v1/reports/${secondBody.reportId}/comparison?userId=comparison-user&previousReportId=rep_missing`,
    { headers: authHeaders(session.token) }
  );
  assert.equal(unknownPrevious.response.status, 404);

  const reanalyze = await postJson(
    server.baseUrl,
    `/v1/reports/${secondBody.reportId}/reanalyze`,
    {},
    { headers: authHeaders(session.token) }
  );
  assert.equal(reanalyze.response.status, 501);
});

test('POST /v1/reports/analyze returns 400 without a file', async () => {
  const session = await createAuthenticatedSession(server.baseUrl);
  const form = new FormData();
  const response = await fetch(`${server.baseUrl}/v1/reports/analyze`, {
    method: 'POST',
    headers: authHeaders(session.token),
    body: form
  });
  assert.equal(response.status, 400);
});

test('reports routes reject missing tokens and ignore spoofed query ownership', async () => {
  const missing = await getJson(server.baseUrl, '/v1/reports');
  assert.equal(missing.response.status, 401);

  const owner = await createAuthenticatedSession(server.baseUrl, {
    email: 'owner-reports@example.com',
    mobileNumber: '+919876543240'
  });
  const intruder = await createAuthenticatedSession(server.baseUrl, {
    email: 'intruder-reports@example.com',
    mobileNumber: '+919876543241'
  });

  const analyzed = await fetch(`${server.baseUrl}/v1/reports/analyze`, {
    method: 'POST',
    headers: authHeaders(owner.token),
    body: buildMultipartReportForm({ reportName: 'owner.pdf', reportDate: '10 Jun 2026' })
  });
  const analyzedBody = await analyzed.json();

  const spoofedList = await getJson(server.baseUrl, '/v1/reports?userId=someone-else', {
    headers: authHeaders(owner.token)
  });
  assert.equal(spoofedList.response.status, 200);
  assert.equal(spoofedList.body.total, 1);

  const stolenDetail = await getJson(server.baseUrl, `/v1/reports/${analyzedBody.reportId}`, {
    headers: authHeaders(intruder.token)
  });
  assert.equal(stolenDetail.response.status, 404);
});
