import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationalTicket, transitionCareCaseStage, validateStageTransition } from '../../backend/src/modules/platform/platform.lifecycle.js';
import { createCareCaseIfMissing, createOrUpdateHealthProfile, listHealthEvents, listHealthTickets, listNotificationsForUser, listTimelineEvents, resetPlatformStoreForTests } from '../../backend/src/modules/platform/platform.store.js';

test.beforeEach(async () => {
  await resetPlatformStoreForTests();
});

test('care case state machine accepts short forward transitions and blocks long jumps', () => {
  assert.equal(validateStageTransition('new_client', 'health_profile_pending'), true);
  assert.equal(validateStageTransition('new_client', 'ready_for_consultant'), false);
  assert.equal(validateStageTransition('new_client', 'diet_published'), false);
  assert.equal(validateStageTransition('consultant_review', 'blood_report_pending'), false);
});

test('care case transition writes timeline, health event, and notification', async () => {
  const profile = await createOrUpdateHealthProfile('lifecycle-user', {});
  const careCase = await createCareCaseIfMissing('lifecycle-user', profile.id, 'health_profile_pending');
  const updated = await transitionCareCaseStage(
    careCase,
    'blood_report_pending',
    'Profile completion improved but report is still missing.'
  );
  assert.equal(updated?.currentStage, 'blood_report_pending');
  assert.equal((await listTimelineEvents(careCase.id))[0]?.kind, 'stage_changed');
  assert.equal((await listHealthEvents(careCase.id))[0]?.type, 'stage_changed');
  assert.equal((await listNotificationsForUser('lifecycle-user')).length, 1);
});

test('care case ticket creation records operational work items', async () => {
  const profile = await createOrUpdateHealthProfile('ticket-user', {});
  const careCase = await createCareCaseIfMissing('ticket-user', profile.id);
  const ticket = await createOperationalTicket(
    careCase.id,
    'ticket-user',
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
