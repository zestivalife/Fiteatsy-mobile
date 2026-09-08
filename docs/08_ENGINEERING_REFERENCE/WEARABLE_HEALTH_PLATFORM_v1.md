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
