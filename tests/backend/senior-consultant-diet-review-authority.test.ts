import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const service = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.service.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.store.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../../backend/src/modules/nutrition/nutrition.routes.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../../backend/src/server.ts', import.meta.url), 'utf8');
const productionE2E = readFileSync(new URL('../../backend/src/jobs/run-common-food-production-e2e.ts', import.meta.url), 'utf8');

const functionSlice = (startMarker: string, endMarker: string) => {
  const start = service.indexOf(startMarker);
  const end = service.indexOf(endMarker, start);
  assert.ok(start > -1 && end > start, `${startMarker} must precede ${endMarker}`);
  return service.slice(start, end);
};

test('Senior Consultant review authority is role-based and does not require client assignment', () => {
  const queue = functionSlice(
    'export const getSeniorConsultantDietPlanReviewQueue',
    'const getSeniorDietPlanReviewContext',
  );
  const context = functionSlice(
    'const getSeniorDietPlanReviewContext',
    'export const requestSeniorConsultantDietPlanReviewChanges',
  );
  const seniorActions = functionSlice(
    'export const requestSeniorConsultantDietPlanReviewChanges',
    'export const approveConsultantDietPlan',
  );
  const legacyApprove = functionSlice(
    'export const approveConsultantDietPlan',
    'export const publishConsultantDietPlan',
  );

  assert.match(queue, /canApproveOrPublishDietPlan\(account\)/);
  assert.match(queue, /listDietPlanReviewQueue/);
  assert.match(queue, /resolveActiveTenantContextForUserId\(account\.accountId\)/);
  assert.doesNotMatch(queue, /getRegisteredConsultantClientProfileContext|getWorkspaceContext|requireConsultantClientAssignment/);
  assert.match(context, /canApproveOrPublishDietPlan\(account\)/);
  assert.match(context, /item\.dietPlanId === dietPlanId && item\.version\.id === versionId/);
  assert.match(context, /plan\.currentVersionId !== version\.id/);
  assert.doesNotMatch(context, /getWorkspaceContext|allowSeniorAuthority|publicClientId/);
  assert.match(seniorActions, /actorUserId: account\.accountId/);
  assert.match(seniorActions, /consultantId: plan\.consultantId \?\? account\.accountId/);
  assert.match(seniorActions, /assertLifecycleTransition\(version\.lifecycleStatus, 'approved'\)/);
  assert.match(legacyApprove, /allowSeniorAuthority: true/);
});

test('Senior review routes bypass only the client-assignment path and require an immutable submitted version', () => {
  assert.match(routes, /post\('\/diet-plan-reviews\/:dietPlanId\/approve'/);
  assert.match(routes, /post\('\/diet-plan-reviews\/:dietPlanId\/request-changes'/);
  assert.match(routes, /seniorReviewActionSchema = z\.object\(\{ versionId: z\.string\(\)\.uuid\(\) \}\)/);
  assert.doesNotMatch(routes, /diet-plan-reviews\/:dietPlanId[^\n]*clientId/);
  assert.match(server, /app\.use\('\/v1\/consultants\/clients\/:clientId',requireAuthenticatedAccount,requireConsultantClientAssignment\)/);
  assert.doesNotMatch(server, /app\.use\('\/v1\/consultants\/diet-plan-reviews[^\n]*requireConsultantClientAssignment/);
});

test('Senior lifecycle records the reviewer without replacing the original plan Consultant', () => {
  const start = store.indexOf('export const updateDietPlanLifecycle');
  const end = store.indexOf('export const ', start + 10);
  const lifecycle = store.slice(start, end);
  assert.match(lifecycle, /const actorUserId = input\.actorUserId \?\? input\.consultantId/);
  assert.match(lifecycle, /consultant_id = \$2/);
  assert.match(lifecycle, /reviewed_by = case when[\s\S]*then \$9/);
  assert.match(lifecycle, /actor_user_id[\s\S]*actorUserId/);
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

test('production acceptance follows canonical Senior review authority and Consultant publication', () => {
  assert.match(productionE2E, /tokens\.senior,'POST',`\/v1\/consultants\/diet-plan-reviews\/\$\{planId\}\/request-changes`/);
  assert.match(productionE2E, /versionId:submitted\.body\.version\.id/);
  assert.match(productionE2E, /tokens\.senior,'POST',`\/v1\/consultants\/diet-plan-reviews\/\$\{planId\}\/approve`/);
  assert.match(productionE2E, /versionId:resubmitted\.body\.version\.id/);
  assert.match(productionE2E, /tokens\.consultant,'POST',`\$\{vegBase\}\/diet-plans\/\$\{planId\}\/publish`/);
  assert.doesNotMatch(productionE2E, /tokens\.senior,'POST',`\$\{vegBase\}\/diet-plans\/\$\{planId\}\/(?:request-changes|approve|publish)`/);
});
