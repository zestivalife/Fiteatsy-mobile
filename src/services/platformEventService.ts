import { HealthEventDraft, HealthEventSource, HealthEventType, OnboardingProfile, SyncQueueItem } from '../types';
import { resolveActiveCareCase } from './platformCaseService';
import { enqueueSyncItem } from './platformSyncService';

type QueueHealthEventInput = {
  eventType: HealthEventType;
  eventSource: HealthEventSource;
  userId: string;
  onboarding: OnboardingProfile | null;
  eventPayload: Record<string, unknown>;
  priority?: 'low' | 'medium' | 'high';
  shouldCreateTimelineEntry?: boolean;
  shouldEvaluateTicket?: boolean;
};

export const queueHealthEvent = async (input: QueueHealthEventInput): Promise<HealthEventDraft> => {
  const nowISO = new Date().toISOString();
  const careCase = await resolveActiveCareCase({
    userId: input.userId,
    onboarding: input.onboarding
  });

  const event: HealthEventDraft = {
    id: `health-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    eventType: input.eventType,
    eventSource: input.eventSource,
    userId: input.userId,
    careCaseId: careCase.id,
    occurredAtISO: nowISO,
    eventPayload: input.eventPayload,
    priority: input.priority ?? 'low',
    shouldCreateTimelineEntry: input.shouldCreateTimelineEntry ?? true,
    shouldEvaluateTicket: input.shouldEvaluateTicket ?? false,
    schemaVersion: 1
  };

  const queueItem: SyncQueueItem = {
    id: `sync-${event.id}`,
    entityType: 'health_event',
    operation: 'enqueue',
    status: 'pending',
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAtISO: null,
    createdAtISO: nowISO,
    updatedAtISO: nowISO,
    payload: event,
    lastError: null
  };

  await enqueueSyncItem(queueItem);
  return event;
};
