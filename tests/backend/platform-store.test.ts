import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addTimelineEvent,
  createCareCaseIfMissing,
  createNotificationRecord,
  createOrUpdateHealthProfile,
  getCareCaseByClientId,
  getHealthProfileByClientId,
  listNotificationsForClient,
  listTimelineEvents,
  saveNutritionProfile,
  updateCareCase,
} from '../../backend/src/modules/platform/platform.store.js';
import { resolveVerifiedAccountIdentity } from '../../backend/src/modules/auth/auth.repository.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';
import { ClientOwnershipContext } from '../../backend/src/modules/platform/platform.types.js';

test.beforeEach(async () => {
  await resetBackendStateForTests();
});

const createOwner = async (label: string): Promise<ClientOwnershipContext> => {
  const { user, client } = await resolveVerifiedAccountIdentity({
    name: `${label} User`,
    email: `${label}@example.com`,
    mobileNumber: `+9198765${label.replace(/\D/g, '').padStart(5, '0').slice(-5)}`
  });
  return { accountId: user.id, clientId: client.id };
};

test('repository layer upserts health profile and increments version', async () => {
  const owner = await createOwner('repo-001');
  const created = await createOrUpdateHealthProfile(owner, { gender: 'Female' });
  const updated = await createOrUpdateHealthProfile(owner, { heightCm: 165 });
  assert.equal(created.id, updated.id);
  assert.equal(updated.version, 2);
  assert.equal(updated.clientId, owner.clientId);
  assert.equal((await getHealthProfileByClientId(owner.clientId))?.heightCm, 165);
});

test('repository layer creates care case and updates stage', async () => {
  const owner = await createOwner('case-002');
  const profile = await createOrUpdateHealthProfile(owner, {});
  const careCase = await createCareCaseIfMissing(owner, profile.id);
  const updated = await updateCareCase(careCase.id, owner.clientId, { currentStage: 'consultant_review' });
  assert.equal(updated?.currentStage, 'consultant_review');
  assert.equal(updated?.version, 2);
  assert.equal(updated?.clientId, owner.clientId);
  assert.equal((await getCareCaseByClientId(owner.clientId))?.id, careCase.id);
});

test('repository layer persists nutrition profiles, timeline, and notifications', async () => {
  const owner = await createOwner('timeline-003');
  const profile = await createOrUpdateHealthProfile(owner, {});
  await saveNutritionProfile(owner, profile.id, {
    completionPercent: 45,
    readinessScore: 40,
    aiReady: false,
    missingFields: ['Date of Birth'],
    sectionScores: [],
  });
  const careCase = await createCareCaseIfMissing(owner, profile.id);
  await addTimelineEvent({
    careCaseId: careCase.id,
    userId: owner.accountId,
    kind: 'registration',
    title: 'Client registered',
    detail: 'Initial registration completed.',
    eventTimeISO: '2026-07-02T10:00:00.000Z',
    metadata: {},
  });
  await createNotificationRecord({
    userId: owner.accountId,
    clientId: owner.clientId,
    careCaseId: careCase.id,
    channel: 'in_app',
    title: 'Welcome',
    body: 'Start your health profile.',
    sentAtISO: '2026-07-02T10:05:00.000Z',
  });
  assert.equal((await listTimelineEvents(careCase.id)).length, 1);
  assert.equal((await listNotificationsForClient(owner.clientId)).length, 1);
});
