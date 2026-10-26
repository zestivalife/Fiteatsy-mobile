# Apple Health Sync (iOS) — Findings and Changes

Status: implemented, unit-tested, **not yet verified on a physical iPhone**.

## Findings

| Area | Android (Health Connect) | iOS (Apple Health), before this change |
| --- | --- | --- |
| Native reader | `healthConnectService.ts` via `react-native-health-connect` | None. `syncConnectedHealthApp` threw `apple_health_native_reader_not_available` |
| Native library / config | Library + manifest permissions + permission delegate plugin | No HealthKit library, entitlement or usage description |
| Sync screen | Full flow | Hard-gated to Android ("Apple Health is not available in this build") |
| Backend | Provider-agnostic observation ingest; status already exposes `appleHealth` and `healthConnect` blocks | Same, no change needed |

The shared pipeline (`runHealthSync` → `/v1/health/observations:batch` → scores/status) was already platform neutral. Only the iOS reader, native configuration and screen wiring were missing.

## Changes

- `src/services/appleHealthService.ts` (new): HealthKit reader producing the same `WearableSyncPayload` and `HealthObservationDraft` shape as Android, with `sourceProvider: 'apple_health'`.
- `src/services/healthAppService.ts`: routes iOS + `apple-health` to the new reader.
- `src/screens/sync/SyncWearableScreen.tsx`: iOS permission request, sync, error mapping, settings link and copy.
- `app.json`: `@kingstinct/react-native-healthkit` config plugin, read-only (`NSHealthShareUsageDescription` set, `NSHealthUpdateUsageDescription` disabled).
- Dependencies: `@kingstinct/react-native-healthkit`, `react-native-nitro-modules`.
- Tests: `test/appleHealthSync.test.ts` (12 cases); two existing contract tests updated for platform-aware wording.

### Library choice

`@kingstinct/react-native-healthkit` was chosen because it is actively maintained, fully typed, supports React Native 0.79+ and ships an Expo config plugin that sets the entitlement and `Info.plist` strings. It requires a native dev build (not Expo Go).

## Metric mapping

| Metric (`metricType`, unit) | Android record | iOS HealthKit type | Window |
| --- | --- | --- | --- |
| `steps`, count | `Steps` | `StepCount` (hourly sums) | 24 h |
| `sleep_minutes`, min | `SleepSession` | `SleepAnalysis` (asleep stages, one source) | 48 h |
| `resting_heart_rate`, bpm | `RestingHeartRate` | `RestingHeartRate` | 7 d |
| `hrv_ms`, ms | `HeartRateVariabilityRmssd` | `HeartRateVariabilitySDNN` | 7 d |
| `workout_minutes`, min | `ExerciseSession` | `Workout` | 7 d |
| `active_energy`, kcal | `ActiveCaloriesBurned` | `ActiveEnergyBurned` (hourly sums) | 7 d |
| `weight`, kg | `Weight` | `BodyMass` | 7 d |
| `distance`, m | `Distance` | `DistanceWalkingRunning` (hourly sums) | 7 d |

## Design decisions

- **No double counting.** iPhone and Apple Watch both write steps and sleep. Cumulative metrics use HealthKit statistics buckets, which de-duplicate overlapping sources. Sleep uses only the source with the most asleep time.
- **Idempotent sync.** Only completed hourly buckets are emitted, and ids are deterministic (`<metric>:<bucketStartISO>` or the HealthKit sample UUID). `syncKey` is `apple_health:<recordType>:<bundleId>:<id>`, so repeat syncs are de-duplicated by the backend.
- **Partial failure tolerant.** A failed metric is marked `read_failed` and the sync continues; the operation ends as `PARTIAL_SUCCESS`.
- **Shared single-flight lock** (`healthConnectOperationCoordinator`) prevents concurrent permission/sync operations.
- **Read-only.** No HealthKit write access is requested.

## Known limitations and follow-ups

1. **HRV is not equivalent across platforms.** Apple provides SDNN, Health Connect provides RMSSD. Both are stored as `hrv_ms`; iOS records carry `recordType: HeartRateVariabilitySDNN`. Decide whether recovery scoring needs per-algorithm baselines.
2. **Read permissions are opaque on iOS.** HealthKit never reveals which read types were granted, so a declined metric shows as "no recent data", not "permission needed".
3. **Not yet device-tested.** Requires a native iOS build with the HealthKit capability enabled for `com.fiteatsy.health`.
4. No background delivery yet; sync is user-initiated, matching Android.

## Verification checklist (physical iPhone)

1. `npx expo prebuild --platform ios`, then build a dev client; confirm the HealthKit capability and usage string are present.
2. Open Sync → grant access → run sync; records appear in `/v1/health/observations`.
3. Run sync twice; second run reports duplicates, not new records.
4. Deny all types; sync shows an honest empty state, no crash.
5. With Watch + iPhone data, confirm steps and sleep are not doubled.
