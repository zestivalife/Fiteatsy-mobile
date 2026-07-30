import { createNotificationRecord, createHealthTicket, addTimelineEvent, addHealthEvent, updateCareCase } from './platform.store.js';
import { CareCaseRecord, CareCaseStage, HealthTicketType, TicketPriority } from './platform.types.js';

const nowIso = () => new Date().toISOString();

const stageOrder: CareCaseStage[] = [
  'new_client',
  'health_profile_pending',
  'blood_report_pending',
  'ready_for_consultant',
  'consultant_review',
  'ai_draft_generated',
  'diet_published',
  'active_monitoring',
  'followup_due',
  'program_completed',
];

export const validateStageTransition = (from: CareCaseStage, to: CareCaseStage) => {
  const currentIndex = stageOrder.indexOf(from);
  const nextIndex = stageOrder.indexOf(to);
  return nextIndex >= currentIndex && nextIndex - currentIndex <= 2;
};

export const transitionCareCaseStage = async (
  careCase: CareCaseRecord,
  nextStage: CareCaseStage,
  detail: string
) => {
  if (!validateStageTransition(careCase.currentStage, nextStage)) {
    throw new Error(`Invalid care case transition from ${careCase.currentStage} to ${nextStage}`);
  }

  const previousStage = careCase.currentStage;
  const updated = await updateCareCase(careCase.id, {
    previousStage: careCase.currentStage,
    currentStage: nextStage,
    lastTransitionAtISO: nowIso(),
  });

  const timeline = await addTimelineEvent({
    careCaseId: careCase.id,
    userId: careCase.userId,
    kind: 'stage_changed',
    title: `Care case moved to ${nextStage.replace(/_/g, ' ')}`,
    detail,
    eventTimeISO: nowIso(),
    metadata: {
      previousStage,
      nextStage,
    },
  });

  await addHealthEvent({
    careCaseId: careCase.id,
    userId: careCase.userId,
    type: 'stage_changed',
    summary: `Care case changed from ${previousStage} to ${nextStage}`,
    payload: {
      previousStage,
      nextStage,
      detail,
    },
    replayKey: `${careCase.id}:${nextStage}:${timeline.id}`,
    eventTimeISO: nowIso(),
  });

  await createNotificationRecord({
    userId: careCase.userId,
    careCaseId: careCase.id,
    channel: 'in_app',
    title: 'Care plan updated',
    body: `Your recovery program is now in ${nextStage.replace(/_/g, ' ')}.`,
    sentAtISO: nowIso(),
  });

  return updated;
};

export const createOperationalTicket = async (
  careCaseId: string,
  userId: string,
  type: HealthTicketType,
  priority: TicketPriority,
  ownerId: string | null,
  dueAtISO: string | null,
  reason: string
) => {
  const timeline = await addTimelineEvent({
    careCaseId,
    userId,
    kind: 'ticket_created',
    title: `${type.replace(/_/g, ' ')} ticket created`,
    detail: reason,
    eventTimeISO: nowIso(),
    metadata: { type, priority, dueAtISO },
  });

  await addHealthEvent({
    careCaseId,
    userId,
    type: 'ticket_created',
    summary: `${type} operational ticket created`,
    payload: { type, priority, dueAtISO, reason },
    replayKey: `${careCaseId}:${type}:${timeline.id}`,
    eventTimeISO: nowIso(),
  });

  return createHealthTicket({
    careCaseId,
    userId,
    type,
    priority,
    ownerId,
    dueAtISO,
    ticketStatus: 'open',
    resolution: null,
    timelineEventIds: [timeline.id],
  });
};
