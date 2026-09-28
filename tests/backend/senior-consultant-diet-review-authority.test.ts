import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.store.ts', import.meta.url), 'utf8');

const functionSlice = (startMarker: string, endMarker: string) => {
  const start = service.indexOf(startMarker);
  const end = service.indexOf(endMarker, start);
  assert.ok(start > -1 && end > start, `${startMarker} must precede ${endMarker}`);
  return service.slice(start, end);
};

test('Senior Consultant review authority is role-based and does not require client assignment', () => {
  const queue = functionSlice(
    'export const getSeniorConsultantDietPlanReviewQueue',
    'export const approveConsultantDietPlan',
  );
  const requestChanges = functionSlice(
    'export const requestConsultantDietPlanChanges',
    'export const getSeniorConsultantDietPlanReviewQueue',
  );
  const approve = functionSlice(
    'export const approveConsultantDietPlan',
    'export const publishConsultantDietPlan',
  );

  assert.match(queue, /canApproveOrPublishDietPlan\(account\)/);
  assert.match(queue, /listDietPlanReviewQueue/);
  assert.doesNotMatch(queue, /getRegisteredConsultantClientProfileContext|account\.accountId/);
  assert.match(requestChanges, /allowSeniorAuthority: true/);
  assert.match(approve, /allowSeniorAuthority: true/);
  assert.match(approve, /currentVersion/);
  assert.match(approve, /assertLifecycleTransition\(currentVersion\.lifecycleStatus, 'approved'\)/);
});

test('Consultant authoring and submission retain active-assignment enforcement', () => {
  const generate = functionSlice(
    'export const generateConsultantDietPlanDraft',
    'export const updateConsultantDietPlanDraft',
  );
  const update = functionSlice(
    'export const updateConsultantDietPlanDraft',
    'export const generateConsultantOptionalGuidance',
  );
  const submit = functionSlice(
    'export const submitConsultantDietPlanForReview',
    'export const requestConsultantDietPlanChanges',
  );

  for (const authoringPath of [generate, update, submit]) {
    assert.match(authoringPath, /getWorkspaceContext\(publicClientId, account\)/);
    assert.doesNotMatch(authoringPath, /allowSeniorAuthority: true/);
  }
  assert.match(submit, /account\.user\.role\?\.toLowerCase\(\) === 'senior_consultant'/);
});

test('review queue excludes drafts and contains only reviewable lifecycle states', () => {
  const queueStart = store.indexOf('export const listDietPlanReviewQueue');
  const queueEnd = store.indexOf('export const ', queueStart + 10);
  const queue = store.slice(queueStart, queueEnd);

  assert.ok(queueStart > -1 && queueEnd > queueStart);
  assert.match(queue, /dp\.plan_status in \('submitted_for_review', 'changes_requested'\)/);
  assert.doesNotMatch(queue, /dp\.plan_status in \([^)]*'draft'/);
  assert.match(queue, /dpv\.id = dp\.current_version_id/);
});

test('approval and publication remain distinct lifecycle operations', () => {
  const approve = functionSlice(
    'export const approveConsultantDietPlan',
    'export const publishConsultantDietPlan',
  );

  assert.match(approve, /lifecycle: 'approved'/);
  assert.doesNotMatch(approve, /lifecycle: 'published'/);
  assert.doesNotMatch(approve, /publishConsultantDietPlan/);
});
