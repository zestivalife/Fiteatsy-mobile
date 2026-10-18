# Wearable Health Platform v1

## Authority and flow

Apple HealthKit or Android Health Connect remains the source of provider records. The mobile client requests separate product consent and least-privilege read permission, reads a bounded 90-day initial window, then uses provider anchors/change tokens. Batches of at most 500 records are written to `POST /v1/health/observations:batch`. A checkpoint advances only after every batch is committed.

The backend stores canonical, client-owned observations and preserves provider record identity, interval, timezone, source application/device, provider revision, content hash, corrections, and deletion tombstones. Scores and projections are recalculated once per accepted batch by the existing health calculation engine. Mobile Wellness/Star Orb state consumes that server response; it does not create a second scoring model.

## Lifecycle

`wearable_consents` is separate from OS authorization. Connections, sync runs, per-metric checkpoints, and audit events are durable and client-scoped. Withdrawing consent revokes matching connections and background scheduling. Existing canonical observations remain retained under current health-data retention policy; they are no longer exposed in the wearable Consultant projection once consent is withdrawn.

Foreground resume is throttled. Expo BackgroundTask provides battery-conscious OS scheduling and restart restoration. Temporary failures use a durable, bounded five-attempt exponential retry schedule. Permission, consent, schema, and unsupported-provider failures are terminal and are not retried indefinitely.

## Platform details

- iOS: read-only HealthKit entitlement, anchored queries, provider deletions, source/device metadata, sleep stages, truthful SDNN provenance for Apple's HRV sample, observer queries, and hourly background-delivery requests.
- Android: existing partial-permission semantics, paginated reads, 90-day backfill, Health Connect change tokens, upsert/deletion changes, and OS-managed background tasks.

HealthKit delivery timing and Android background execution remain controlled by the operating system and are not described as real time.

## Metric contract

All windows use the timestamp and offset carried by the source record. Initial reads are bounded to 90 days; later reads use HealthKit anchors or Health Connect change tokens. Additive records remain individual canonical observations so corrections and deletions can be reconciled. Daily UI totals must use source-equivalent local-day boundaries; they must not combine source aggregates with their component records.

| Canonical metric | Apple HealthKit type/query | Health Connect record/read | Canonical unit and aggregation | Availability notes |
| --- | --- | --- | --- | --- |
| `steps` | `HKQuantityType.stepCount`, anchored samples | `Steps`, paginated records/change token | `count`, daily sum with source overlap reconciliation | Exact parity requires the same source-priority rules as Apple Health/Health Connect. |
| `distance` | `distanceWalkingRunning` | `Distance` | `m`, daily sum | Walking/running distance only on iOS. |
| `workout_minutes` | `HKWorkoutType` | `ExerciseSession` | `min`, non-overlapping session duration | Overlapping sessions are retained with provenance and not combined with active minutes. |
| `active_minutes` | `appleExerciseTime` | No source-equivalent record declared | `min`, daily sum | Android is unsupported until an equivalent, verified definition is selected. |
| `active_energy` | `activeEnergyBurned` | `ActiveCaloriesBurned` | `kcal`, daily sum | Active energy only; no fabricated total calorie value. |
| `weight` | `bodyMass` | `Weight` | `kg`, latest sample/history | Source history is preserved. |
| `sleep_minutes` | `sleepAnalysis`, anchored category samples | `SleepSession` | `min`, asleep stages only | Awake/in-bed rows are excluded from sleep duration; stages remain in metadata. |
| `heart_rate` | `heartRate` | `HeartRate` samples | `bpm`, instantaneous samples | Never substituted for resting heart rate. |
| `resting_heart_rate` | `restingHeartRate` | `RestingHeartRate` | `bpm`, latest/average for the selected window | Missing stays unavailable. |
| `hrv_ms` | `heartRateVariabilitySDNN` | `HeartRateVariabilityRmssd` | `ms`, source samples | `providerVersion`/metadata identifies Apple SDNN versus Android RMSSD; values are not treated as interchangeable. |
| `spo2` | `oxygenSaturation` | `OxygenSaturation` | `%`, instantaneous sample | Fractional native values are explicitly converted to percent. |
| `respiratory_rate` | `respiratoryRate` | `RespiratoryRate` | `breaths/min`, instantaneous sample | Available only when recorded and authorised. |
| `hydration_ml` | `dietaryWater` | `Hydration` | `ml`, daily sum | Imported only from a real native record; manual values remain separate. |

Blood pressure, body composition beyond weight, and mindfulness are not declared supported in v1 because both the native reader and canonical backend contract are not yet complete for those types. Stress, mood, focus, breathing, cycle, and calorie estimates are never fabricated from unrelated records.

## Permission and failure semantics

iOS requests read-only HealthKit access. Apple does not expose per-type read-denial status, so an empty result is reported as no recent data/unavailable rather than a fabricated grant. Android reconciles the exact granted record types after the system permission activity returns. Each metric independently reports synced, no permission, no recent data, read failure, unsupported, or unavailable. A rejected record prevents its provider checkpoint from advancing.

## Security

All ingestion, checkpoints, connections, and consent operations derive the client from the authenticated account. Consultant summaries retain existing assignment checks and additionally require active provider consent. Raw provider payloads are never returned in standard Consultant projections.

## Device acceptance

Physical-device acceptance is required for real HealthKit authorization/anchored reads/background delivery and Health Connect permission/change/background behavior. Simulator and CI tests validate contracts and failure boundaries only.
