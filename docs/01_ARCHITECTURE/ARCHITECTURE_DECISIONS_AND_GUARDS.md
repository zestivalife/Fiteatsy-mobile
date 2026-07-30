# Fiteatsy — Architecture Decisions and Guards

**Status:** ACTIVE ARCHITECTURE GUARDS

## Approved Direction

### AD-01 — Fiteatsy is a product platform, not only a frontend
Fiteatsy requires backend authority, durable persistence, health ingestion, report processing and governed external integration.

### AD-02 — Fiteatsy owns Fiteatsy product health state
Other Zestiva systems consume governed projections/APIs rather than sharing its database.

### AD-03 — Start modular, extract services deliberately
The current Express backend may evolve as a modular monolith. Microservice extraction requires evidence.

### AD-04 — Device and cloud health integrations differ
Phone-only health stores synchronize through the mobile app. Cloud providers may integrate server-to-server where supported.

### AD-05 — Consultant access is CAP-003 governed
Legacy `assigned_consultant_id` / `assigned_mentor_id` are not platform authorization.

### AD-06 — Account is not automatically the permanent Client aggregate
`users.id` remains account identity until Account → Client cardinality and the external Fiteatsy client contract are approved.

### AD-07 — Cross-system database access is prohibited
Integration uses APIs, projections and governed events.

### AD-08 — Medical report files require private file/object storage
PostgreSQL stores structured metadata/derived observations rather than becoming the default binary document store.

### AD-09 — Health intelligence requires provenance
Calculated indicators must be explainable from governed inputs and methodology.

### AD-10 — AI does not define clinical truth
Generative AI may assist explanation/summarisation under CAP-010 governance; deterministic/validated logic remains authoritative for governed calculations.

### AD-11 — Near-real-time, not guaranteed live
Health-source freshness must be visible.

### AD-12 — Railway is the current backend hosting direction
Initial topology is Fiteatsy API + isolated Fiteatsy PostgreSQL. Additional services are introduced later as justified.

## Prohibited Shortcuts

Do not:

- make email/mobile/name a permanent cross-system identity;
- make `users.id` the external Fiteatsy client contract before Phase 1C approval;
- share Fiteatsy PostgreSQL directly with Consultant/Nuetra;
- reuse the Nuetra database merely to reduce infrastructure;
- route every Fiteatsy request through existing Nuetra microservices by default;
- grant Practitioner access from subscription/profile/care-case existence;
- represent stale device data as live telemetry;
- let AI invent biomarker values or overwrite source observations;
- treat report extraction as a medical diagnosis;
- store service secrets in the mobile app;
- create microservices solely because a logical capability exists.

## Open Decisions

The following remain intentionally unresolved:

1. Account → Fiteatsy Client cardinality.
2. Permanent `fiteatsy_client_id` contract.
3. Active/inactive Fiteatsy Client lifecycle.
4. Deactivation/deletion semantics.
5. Exact health metrics supported at launch.
6. Exact cloud wearable/provider integrations at launch.
7. Medical-report file storage provider.
8. Biomarker extraction/validation technology.
9. Recovery/improvement scoring methodology.
10. Medication context visible to practitioners.
11. Service-to-service identity mechanism.
12. Event transport/outbox technology.
13. Which logical capabilities ultimately become independent Railway services.

These must not be silently resolved by implementation.
