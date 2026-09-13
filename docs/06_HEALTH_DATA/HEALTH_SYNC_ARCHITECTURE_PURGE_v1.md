# Health Sync Architecture Purge v1

## Canonical runtime path

`CanonicalHealthDataSyncScreen` is a rendering and command surface only. It consumes `useCanonicalHealthSyncCoordinator`, which owns the provider, per-metric query, and upload state machines. The coordinator selects exactly one `HealthPlatformAdapter`, persists native observations through `healthSyncLocalStore`, and delegates authenticated backend traffic to the existing canonical API-client path in `healthSyncManager` and `wearablePlatformService`.

Native reads and local persistence complete before backend session creation or upload. A backend failure therefore preserves and renders local measurements while independently marking upload as pending.

## Architecture inventory

| File or symbol | Responsibility | Referenced by | State owned | Classification |
| --- | --- | --- | --- | --- |
| `CanonicalHealthDataSyncScreen.tsx` | Health source and metric presentation; user commands | App navigation | UI disclosure only | CANONICAL |
| `canonicalHealthSyncCoordinator.ts` | Platform selection, provider/metric/upload FSMs, foreground refresh, orchestration | Canonical screen | Provider, metric query, upload, snapshot | CANONICAL |
| `healthPlatformAdapter.ts` | Platform-neutral native contract and Apple/Android adapters | Coordinator, sync manager | None | CANONICAL |
| `appleHealthService.ts` | Primitive Apple HealthKit bridge DTOs and isolated queries | Apple adapter | Native query diagnostics/anchors | COMPATIBILITY_REQUIRED |
| `healthConnectService.ts` | Primitive Health Connect bridge DTOs and isolated queries | Android adapter | Native query diagnostics/change tokens | COMPATIBILITY_REQUIRED |
| `healthSyncLocalStore.ts` | One durable observation, cursor, tombstone, dedup, and upload-ack store | Sync manager/coordinator | Canonical local health data | CANONICAL |
| `healthSyncManager.ts` | Normalize, persist locally, schedule upload, and acknowledge | Coordinator/background task | Per-run result only | CANONICAL |
| `wearablePlatformService.ts` | Canonical authenticated backend connection/status API | Coordinator/manager | Server DTOs only | COMPATIBILITY_REQUIRED |
| `wearableBackgroundSync.ts` | OS background task registration and invocation of canonical manager | Coordinator/app bootstrap | Background policy keys only | COMPATIBILITY_REQUIRED |
| `FiteatsyHealthKitModule.swift` | Sole iOS Expo HealthKit module registration | Apple health service | Native anchors in canonical bridge contract | CANONICAL |
| `SyncWearableScreen.tsx` | Independent legacy connection and sync screen | No remaining caller | Duplicate provider/sync state | REMOVED |
| `HealthDataSyncScreen.tsx` | Previous overlapping health screen | Replaced navigation route | Duplicate provider/metric/upload state | REMOVED |
| `healthAppService.ts` | Duplicate platform selection and orchestration | Callers migrated | Duplicate adapter authority | REMOVED |
| `healthSyncRouting.ts` | Home-owned provider routing inference | Callers migrated | Duplicate connection authority | REMOVED |

The profile-only connected-metrics report and development-only diagnostic screen are retained as non-authoritative inspection surfaces. They do not participate in the production Health Data Sync route or its state machine.

## State authority

| State | Initial value | Writer | Reader | Persistence | Authority |
| --- | --- | --- | --- | --- | --- |
| Provider | `AVAILABLE` | Coordinator from adapter availability/native permission/server snapshot | Canonical screen | Server connection record; never duplicated in UI storage | CANONICAL |
| Metric query | `IDLE` | Coordinator from isolated adapter results | Canonical screen/cards | Canonical local observations/cursors | CANONICAL |
| Upload | `IDLE` | Coordinator from manager upload outcome | Canonical screen/cards | Per-record uploaded acknowledgement | CANONICAL |
| Last sync/activity | empty | Coordinator from backend snapshot | Canonical screen | Backend activity | CANONICAL |
| Available metrics | derived | `countAvailableHealthMetrics` from `DATA_AVAILABLE` states | Canonical screen | Not persisted | CANONICAL |

## Storage migration

- Keep `@fiteatsy/health-sync-local-v1:<scope>` for observations, tombstones, cursor/change-token state, and upload acknowledgement.
- Keep canonical `@fiteatsy/health-sync-local-v1:installation-id`.
- Migrate and remove `@fiteatsy/wearable-installation-id`.
- Remove obsolete screen-owned `@fiteatsy/wearable-last-foreground-sync`.
- Retain background task configuration/retry keys because they express scheduling policy, not provider or metric truth.

## Invariants

- `CONNECTED` never renders global checking or connecting copy.
- Exactly one production health foreground listener belongs to the coordinator.
- Permission review return performs one throttled local refresh without re-registering the provider.
- One metric error cannot remove another metric's value.
- Local HealthKit/Health Connect reads do not require network availability.
- Upload failure retains local values and is represented only by upload state.
- Available metric count is the count of `DATA_AVAILABLE` metric states, never a backend record count.
