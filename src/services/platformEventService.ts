import { HealthEventDraft, HealthEventSource, HealthEventType, OnboardingProfile, SyncQueueItem } from '../types';
import { enqueueSyncItem, getPendingSyncItems, removeSyncQueueItem, updateSyncQueueItem } from './platformSyncService';
import { apiFetch, ApiClientError } from './apiClient';
import type { StorageIdentity } from '../utils/identityScopedStorage';

type QueueHealthEventInput = {
  eventType: HealthEventType;
  eventSource: HealthEventSource;
  userId: string;
  clientId?: string | null;
  onboarding: OnboardingProfile | null;
  eventPayload: Record<string, unknown>;
  priority?: 'low' | 'medium' | 'high';
  shouldCreateTimelineEntry?: boolean;
  shouldEvaluateTicket?: boolean;
};

export const queueHealthEvent = async (input: QueueHealthEventInput): Promise<HealthEventDraft> => {
  const nowISO = new Date().toISOString();
  const identity = { userId: input.userId, clientId: input.clientId };
  const event: HealthEventDraft = {
    id: `health-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    eventType: input.eventType,
    eventSource: input.eventSource,
    userId: input.userId,
    // Delivery resolves the authoritative server care case. Keeping a stable
    // placeholder here makes local persistence independent of network latency.
    careCaseId: `pending:${input.clientId ?? input.userId}`,
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

  await enqueueSyncItem(queueItem, identity);
  void processPendingHealthEvents(identity);
  return event;
};

const retryAt = (attempt: number) => new Date(Date.now() + Math.min(300_000, 2 ** attempt * 1_000)).toISOString();

const activeProcessors = new Map<string, Promise<number>>();
const processorKey = (identity?: StorageIdentity | null) => `${identity?.userId ?? 'none'}:${identity?.clientId ?? 'none'}`;

const processPendingHealthEventsOnce = async (identity?: StorageIdentity | null) => {
  const items = (await getPendingSyncItems(identity))
    .filter((item) => item.entityType === 'health_event' && item.operation === 'enqueue')
    .sort((a, b) => new Date(a.createdAtISO).getTime() - new Date(b.createdAtISO).getTime());
  let processed = 0;
  for (const item of items) {
    if (item.nextAttemptAtISO && new Date(item.nextAttemptAtISO).getTime() > Date.now()) continue;
    const event = item.payload as HealthEventDraft;
    const attemptedAt = new Date().toISOString();
    await updateSyncQueueItem(item.id, (current) => ({ ...current, status: 'processing', updatedAtISO: attemptedAt }), identity);
    try {
      const currentCase = await apiFetch<{ id: string }>('/v1/platform/care-cases/current');
      await apiFetch(`/v1/platform/care-cases/${encodeURIComponent(currentCase.id)}/events`, {
        method: 'POST',
        body: JSON.stringify({ ...event, careCaseId: currentCase.id }),
        retryPolicy: 'idempotent',
        idempotencyKey: event.id
      });
      await removeSyncQueueItem(item.id, identity);
      processed += 1;
    } catch (error) {
      // Authentication failures must survive reauthentication without consuming
      // the clinical event's finite transport retry budget.
      const unauthorised = error instanceof ApiClientError && error.code === 'UNAUTHORIZED';
      const attempts = unauthorised ? item.attempts : item.attempts + 1;
      await updateSyncQueueItem(item.id, (current) => ({
        ...current,
        status: attempts >= item.maxAttempts ? 'failed' : 'pending',
        attempts,
        nextAttemptAtISO: unauthorised ? null : retryAt(attempts),
        updatedAtISO: attemptedAt,
        lastError: error instanceof Error ? error.message : 'health_event_sync_failed'
      }), identity);
    }
  }
  return processed;
};

export const processPendingHealthEvents = (identity?: StorageIdentity | null) => {
  const key = processorKey(identity);
  const active = activeProcessors.get(key);
  if (active) return active;
  const processor = processPendingHealthEventsOnce(identity).finally(() => {
    if (activeProcessors.get(key) === processor) activeProcessors.delete(key);
  });
  activeProcessors.set(key, processor);
  return processor;
};
