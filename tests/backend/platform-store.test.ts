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

test.beforeEach(() => {
  resetPlatformStoreForTests();
});

test('repository layer upserts health profile and increments version', () => {
  const created = createOrUpdateHealthProfile('repo-user', { gender: 'Female' });
  const updated = createOrUpdateHealthProfile('repo-user', { heightCm: 165 });
  assert.equal(created.id, updated.id);
  assert.equal(updated.version, 2);
  assert.equal(getHealthProfileByUserId('repo-user')?.heightCm, 165);
});

test('repository layer creates care case and updates stage', () => {
  const profile = createOrUpdateHealthProfile('case-user', {});
  const careCase = createCareCaseIfMissing('case-user', profile.id);
  const updated = updateCareCase(careCase.id, { currentStage: 'consultant_review' });
  assert.equal(updated?.currentStage, 'consultant_review');
  assert.equal(updated?.version, 2);
  assert.equal(getCareCaseByUserId('case-user')?.id, careCase.id);
});

test('repository layer persists nutrition profiles, timeline, and notifications', () => {
  const profile = createOrUpdateHealthProfile('timeline-user', {});
  saveNutritionProfile('timeline-user', profile.id, {
    completionPercent: 45,
    readinessScore: 40,
    aiReady: false,
    missingFields: ['Date of Birth'],
    sectionScores: [],
  });
  const careCase = createCareCaseIfMissing('timeline-user', profile.id);
  addTimelineEvent({
    careCaseId: careCase.id,
    userId: 'timeline-user',
    kind: 'registration',
    title: 'Client registered',
    detail: 'Initial registration completed.',
    eventTimeISO: '2026-07-02T10:00:00.000Z',
    metadata: {},
  });
  createNotificationRecord({
    userId: 'timeline-user',
    careCaseId: careCase.id,
    channel: 'in_app',
    title: 'Welcome',
    body: 'Start your health profile.',
    sentAtISO: '2026-07-02T10:05:00.000Z',
  });
  assert.equal(listTimelineEvents(careCase.id).length, 1);
  assert.equal(listNotificationsForUser('timeline-user').length, 1);
});
