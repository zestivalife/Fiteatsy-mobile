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

## Security

All ingestion, checkpoints, connections, and consent operations derive the client from the authenticated account. Consultant summaries retain existing assignment checks and additionally require active provider consent. Raw provider payloads are never returned in standard Consultant projections.

## Device acceptance

Physical-device acceptance is required for real HealthKit authorization/anchored reads/background delivery and Health Connect permission/change/background behavior. Simulator and CI tests validate contracts and failure boundaries only.

## Canonical metric capability and aggregation contract

The executable mobile source of truth is `src/services/healthMetricRegistry.ts`. A metric is listed there only when its native identifier/record, normalizer, unit, backend validator and downstream use are implemented. UI labels, Apple read scopes and Android read permissions derive from this registry. The backend retains its own strict allow-list at the trust boundary.

| Canonical observation | Apple Health | Health Connect | Unit | Aggregation | Freshness/use |
|---|---|---|---|---|---|
| `steps` | step count | Steps | count | SUM | same day; activity |
| `distance` | walking/running distance | Distance | m | SUM | same day; activity |
| `sleep_minutes` | sleep analysis | SleepSession | min | INTERVAL | last completed sleep; sleep/recovery |
| `heart_rate` | heart rate | — | bpm | SAMPLE_SERIES | recent sample; heart |
| `resting_heart_rate` | resting heart rate | RestingHeartRate | bpm | LATEST | latest seven-day value; recovery |
| `hrv_sdnn_ms` | HRV SDNN | — | ms | SAMPLE_SERIES | seven days; recovery |
| `hrv_rmssd_ms` | — | HeartRateVariabilityRmssd | ms | SAMPLE_SERIES | seven days; recovery |
| `active_energy` | active energy | ActiveCaloriesBurned | kcal | SUM | same day; activity/energy |
| `active_minutes` | Apple exercise time | — | min | SUM | same day; activity |
| `workout_minutes` | HKWorkout | ExerciseSession | min | INTERVAL | seven days; activity/recovery |
| `weight` | body mass | Weight | kg | LATEST | latest measurement; body context |
| `hydration_ml` | dietary water | — | ml | SUM | same day; hydration |
| `spo2` | oxygen saturation | — | pct | AVERAGE | recent sample; respiratory |
| `respiratory_rate` | respiratory rate | — | brpm | AVERAGE | recent sample; respiratory |

SDNN and RMSSD remain distinct source observations. A legacy `hrv_ms` remains read-compatible; it is not used to rewrite either methodology. Recovery is derived and is never requested from either platform.

Metrics named in product discovery but absent from the table are not yet queryable. They must not be advertised or requested until the installed OS/SDK API, normalization, validation and physical parity tests are complete.

## Permission model and least privilege

- Apple requests one read-only HealthKit authorization set. It requests no share/write types. HealthKit intentionally does not reveal per-type read denial, so zero records means `NO_DATA`, not denial.
- Android requests only `read` permissions derived from queryable Health Connect records. It requests no write permission and records explicit granted/not-granted state.
- FitEatsy product consent is separate from operating-system authorization.

## State, timeout, retry and observability

Availability, authorization, each native metric query, backend upload, checkpoint read and checkpoint commit are bounded. Metrics settle independently; one timeout yields a partial result rather than blocking the session. Setup Later and Back invalidate the UI operation immediately, and stale callbacks cannot update an unmounted or replaced session.

Non-sensitive session diagnostics contain only requested/success/no-data/error metric counts, source/normalized/upload/persisted record counts, duration and terminal status. Raw health values, payloads and tokens are excluded from ordinary logs and analytics.

Initial sync uses a bounded 90-day window only when no provider anchor/change token exists. Subsequent sync uses the committed provider checkpoint. A checkpoint is committed only after every bounded upload batch is acknowledged with zero rejected records; failure leaves it unchanged, so retry remains idempotent. Backend identity is client + provider + stable source record ID (with the governed deterministic fallback only when the source lacks an ID).

## Source overlap

Provider source application, device and record identity are preserved. FitEatsy does not filter Apple Watch, iPhone, third-party HealthKit sources, or Health Connect origins. Raw provider records are idempotently stored; daily additive aggregation uses the existing deterministic source/time-overlap policy. Sleep is interval-based and excludes Awake/In Bed from asleep duration. Heart rate and HRV are sample series, never sums.

## Session and account boundaries

All backend records, connections, checkpoints and runs are authenticated and client-scoped. Local app state uses the existing account-scoped storage layer. Logout/account transition clears projected wearable state and invalidates pending UI operations; a later login rehydrates authority from the backend instead of treating a local onboarding flag as authoritative.

## OS and build compatibility

| Platform | Minimum behavior | Health integration | Limitations |
|---|---|---|---|
| iOS deployment target | HealthKit available on supported iPhone hardware | bundled `FiteatsyHealthKit` Expo module, HealthKit entitlement, read-only types | simulator/no Health app cannot prove data parity; availability-gated types are omitted |
| Android 8–13 | Health Connect application/provider dependency | `react-native-health-connect` | provider installation and granted record permissions required |
| Android 14+ | platform Health Connect mode | `react-native-health-connect` | supported record surface remains constrained by installed SDK version |

Native builds are repository-reproducible through committed `package-lock.json`, `ios/Podfile.lock`, Expo configuration, local Expo module metadata, iOS entitlements, Android permissions and Gradle configuration. The only runtime environment input is the documented API base URL (`EXPO_PUBLIC_API_BASE_URL`) with the committed non-loopback Expo fallback. No ignored local native patch is part of the build contract.

## Physical source-parity checklist

For every supported metric capture: source-app displayed value, source record count, FitEatsy raw count, normalized count, deduplicated/persisted count, aggregate value and UI value. Acceptance requires logical-value parity, not merely receipt of records. Repeat the same sync to prove zero duplicate observations; then test offline upload/retry, force-close/restart, logout/account switch, one metric timeout, partial permission, Setup Later and Back.
