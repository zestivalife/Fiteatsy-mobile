import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTimelineEvent,
  createCareCaseIfMissing,
  createNotificationRecord,
  createOrUpdateHealthProfile,
  getCareCaseByUserId,
  getHealthProfileByUserId,
  listNotificationsForUser,
  listTimelineEvents,
  resetPlatformStoreForTests,
  saveNutritionProfile,
  updateCareCase,
} from '../../backend/src/modules/platform/platform.store.js';

test.beforeEach(async () => {
  await resetPlatformStoreForTests();
});

test('repository layer upserts health profile and increments version', async () => {
  const created = await createOrUpdateHealthProfile('repo-user', { gender: 'Female' });
  const updated = await createOrUpdateHealthProfile('repo-user', { heightCm: 165 });
  assert.equal(created.id, updated.id);
  assert.equal(updated.version, 2);
  assert.equal((await getHealthProfileByUserId('repo-user'))?.heightCm, 165);
});

test('repository layer creates care case and updates stage', async () => {
  const profile = await createOrUpdateHealthProfile('case-user', {});
  const careCase = await createCareCaseIfMissing('case-user', profile.id);
  const updated = await updateCareCase(careCase.id, { currentStage: 'consultant_review' });
  assert.equal(updated?.currentStage, 'consultant_review');
  assert.equal(updated?.version, 2);
  assert.equal((await getCareCaseByUserId('case-user'))?.id, careCase.id);
});

test('repository layer persists nutrition profiles, timeline, and notifications', async () => {
  const profile = await createOrUpdateHealthProfile('timeline-user', {});
  await saveNutritionProfile('timeline-user', profile.id, {
    completionPercent: 45,
    readinessScore: 40,
    aiReady: false,
    missingFields: ['Date of Birth'],
    sectionScores: [],
  });
  const careCase = await createCareCaseIfMissing('timeline-user', profile.id);
  await addTimelineEvent({
    careCaseId: careCase.id,
    userId: 'timeline-user',
    kind: 'registration',
    title: 'Client registered',
    detail: 'Initial registration completed.',
    eventTimeISO: '2026-07-02T10:00:00.000Z',
    metadata: {},
  });
  await createNotificationRecord({
    userId: 'timeline-user',
    careCaseId: careCase.id,
    channel: 'in_app',
    title: 'Welcome',
    body: 'Start your health profile.',
    sentAtISO: '2026-07-02T10:05:00.000Z',
  });
  assert.equal((await listTimelineEvents(careCase.id)).length, 1);
  assert.equal((await listNotificationsForUser('timeline-user')).length, 1);
});
