import { createNotificationRecord, createHealthTicket, addTimelineEvent, addHealthEvent, updateCareCase } from './platform.store.js';
const nowIso = () => new Date().toISOString();
const stageOrder = [
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
export const validateStageTransition = (from, to) => {
    const currentIndex = stageOrder.indexOf(from);
    const nextIndex = stageOrder.indexOf(to);
    return nextIndex >= currentIndex && nextIndex - currentIndex <= 2;
};
export const transitionCareCaseStage = (careCase, nextStage, detail) => {
    if (!validateStageTransition(careCase.currentStage, nextStage)) {
        throw new Error(`Invalid care case transition from ${careCase.currentStage} to ${nextStage}`);
    }
    const updated = updateCareCase(careCase.id, {
        previousStage: careCase.currentStage,
        currentStage: nextStage,
        lastTransitionAtISO: nowIso(),
    });
    const timeline = addTimelineEvent({
        careCaseId: careCase.id,
        userId: careCase.userId,
        kind: 'stage_changed',
        title: `Care case moved to ${nextStage.replace(/_/g, ' ')}`,
        detail,
        eventTimeISO: nowIso(),
        metadata: {
            previousStage: careCase.currentStage,
            nextStage,
        },
    });
    addHealthEvent({
        careCaseId: careCase.id,
        userId: careCase.userId,
        type: 'stage_changed',
        summary: `Care case changed from ${careCase.currentStage} to ${nextStage}`,
        payload: {
            previousStage: careCase.currentStage,
            nextStage,
            detail,
        },
        replayKey: `${careCase.id}:${nextStage}:${timeline.id}`,
        eventTimeISO: nowIso(),
    });
    createNotificationRecord({
        userId: careCase.userId,
        careCaseId: careCase.id,
        channel: 'in_app',
        title: 'Care plan updated',
        body: `Your recovery program is now in ${nextStage.replace(/_/g, ' ')}.`,
        sentAtISO: nowIso(),
    });
    return updated;
};
export const createOperationalTicket = (careCaseId, userId, type, priority, ownerId, dueAtISO, reason) => {
    const timeline = addTimelineEvent({
        careCaseId,
        userId,
        kind: 'ticket_created',
        title: `${type.replace(/_/g, ' ')} ticket created`,
        detail: reason,
        eventTimeISO: nowIso(),
        metadata: { type, priority, dueAtISO },
    });
    addHealthEvent({
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
