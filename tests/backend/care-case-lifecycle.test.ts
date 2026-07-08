import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationalTicket, transitionCareCaseStage, validateStageTransition } from '../../backend/src/modules/platform/platform.lifecycle.js';
import { createCareCaseIfMissing, createOrUpdateHealthProfile, listHealthEvents, listHealthTickets, listNotificationsForUser, listTimelineEvents, resetPlatformStoreForTests } from '../../backend/src/modules/platform/platform.store.js';

test.beforeEach(() => {
  resetPlatformStoreForTests();
});

test('care case state machine accepts short forward transitions and blocks long jumps', () => {
  assert.equal(validateStageTransition('new_client', 'health_profile_pending'), true);
  assert.equal(validateStageTransition('new_client', 'ready_for_consultant'), false);
  assert.equal(validateStageTransition('new_client', 'diet_published'), false);
  assert.equal(validateStageTransition('consultant_review', 'blood_report_pending'), false);
});

test('care case transition writes timeline, health event, and notification', () => {
  const profile = createOrUpdateHealthProfile('lifecycle-user', {});
  const careCase = createCareCaseIfMissing('lifecycle-user', profile.id, 'health_profile_pending');
  const updated = transitionCareCaseStage(
    careCase,
    'blood_report_pending',
    'Profile completion improved but report is still missing.'
  );
  assert.equal(updated.currentStage, 'blood_report_pending');
  assert.equal(listTimelineEvents(careCase.id)[0]?.kind, 'stage_changed');
  assert.equal(listHealthEvents(careCase.id)[0]?.type, 'stage_changed');
  assert.equal(listNotificationsForUser('lifecycle-user').length, 1);
});

test('care case ticket creation records operational work items', () => {
  const profile = createOrUpdateHealthProfile('ticket-user', {});
  const careCase = createCareCaseIfMissing('ticket-user', profile.id);
  const ticket = createOperationalTicket(
    careCase.id,
    'ticket-user',
    'missing_health_profile',
    'high',
    'consultant-1',
    null,
    'Core fields are still missing.'
  );
  assert.equal(ticket.ticketStatus, 'open');
  assert.equal(listHealthTickets(careCase.id).length, 1);
  assert.equal(listTimelineEvents(careCase.id)[0]?.kind, 'ticket_created');
});
