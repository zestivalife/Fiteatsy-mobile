import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationalTicket, transitionCareCaseStage, validateStageTransition } from '../../backend/src/modules/platform/platform.lifecycle.js';
import { createCareCaseIfMissing, createOrUpdateHealthProfile, listHealthEvents, listHealthTickets, listNotificationsForClient, listTimelineEvents } from '../../backend/src/modules/platform/platform.store.js';
import { resolveVerifiedAccountIdentity } from '../../backend/src/modules/auth/auth.repository.js';
import { ClientOwnershipContext } from '../../backend/src/modules/platform/platform.types.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';

test.beforeEach(async () => {
  await resetBackendStateForTests();
});

const createOwner = async (label: string): Promise<ClientOwnershipContext> => {
  const { user, client } = await resolveVerifiedAccountIdentity({
    name: `${label} User`,
    email: `${label}@example.com`,
    mobileNumber: `+9198767${label.replace(/\D/g, '').padStart(5, '0').slice(-5)}`
  });
  return { accountId: user.id, clientId: client.id };
};

test('care case state machine accepts short forward transitions and blocks long jumps', () => {
  assert.equal(validateStageTransition('new_client', 'health_profile_pending'), true);
  assert.equal(validateStageTransition('new_client', 'ready_for_consultant'), false);
  assert.equal(validateStageTransition('new_client', 'diet_published'), false);
  assert.equal(validateStageTransition('consultant_review', 'blood_report_pending'), false);
});

test('care case transition writes timeline, health event, and notification', async () => {
  const owner = await createOwner('lifecycle-001');
  const profile = await createOrUpdateHealthProfile(owner, {});
  const careCase = await createCareCaseIfMissing(owner, profile.id, 'health_profile_pending');
  const updated = await transitionCareCaseStage(
    careCase,
    'blood_report_pending',
    'Profile completion improved but report is still missing.'
  );
  assert.equal(updated?.currentStage, 'blood_report_pending');
  assert.equal(updated?.clientId, owner.clientId);
  assert.equal((await listTimelineEvents(careCase.id))[0]?.kind, 'stage_changed');
  assert.equal((await listHealthEvents(careCase.id))[0]?.type, 'stage_changed');
  assert.equal((await listNotificationsForClient(owner.clientId)).length, 1);
});

test('care case ticket creation records operational work items', async () => {
  const owner = await createOwner('ticket-002');
  const profile = await createOrUpdateHealthProfile(owner, {});
  const careCase = await createCareCaseIfMissing(owner, profile.id);
  const ticket = await createOperationalTicket(
    careCase.id,
    owner.accountId,
    'missing_health_profile',
    'high',
    'consultant-1',
    null,
    'Core fields are still missing.'
  );
  assert.equal(ticket.ticketStatus, 'open');
  assert.equal((await listHealthTickets(careCase.id)).length, 1);
  assert.equal((await listTimelineEvents(careCase.id))[0]?.kind, 'ticket_created');
});
