# Fiteatsy — Target Platform Architecture

**Status:** TARGET ARCHITECTURE  
**Current implementation note:** Phase 1B is hardening the existing Node/Express backend and PostgreSQL persistence foundation. The target architecture below must not be misreported as fully implemented.

## 1. Architectural Goal

Fiteatsy must support a continuous health-management loop:

**Collect → Normalise → Store → Understand → Monitor → Intervene → Measure → Improve**

The platform must support:

- user-authorised health/wearable data ingestion;
- longitudinal health metrics;
- medical report upload and history;
- biomarker extraction and trends;
- medication/reminder management;
- recovery/improvement indicators;
- practitioner monitoring;
- practitioner-created or modified nutrition/recovery interventions;
- governed integration with Zestiva platform capabilities.

## 2. Logical Architecture

```text
                         FITEATSY MOBILE
                        Expo / React Native
                               |
                 +-------------+-------------+
                 |                           |
                 v                           v
        Device Health Sources         Fiteatsy API Layer
     Apple Health / Health Connect           |
                 |                           |
                 +------ Health Sync --------+
                                             |
                          +------------------+------------------+
                          |                  |                  |
                          v                  v                  v
                    Identity/Client     Health Data        Medical Records
                       Domain            Domain              Domain
                          |                  |                  |
                          |                  |          Report metadata/files
                          |                  |          Biomarker extraction
                          |                  |                  |
                          +----------+-------+---------+--------+
                                     |                 |
                                     v                 v
                              Medication         Health/Recovery
                                Domain            Intelligence
                                     |                 |
                                     +--------+--------+
                                              |
                                              v
                                      Intervention /
                                      Nutrition Context
                                              |
                                  +-----------+-----------+
                                  |                       |
                                  v                       v
                             PostgreSQL              Object Storage
                                                        Reports

                                              |
                                              v
                                   External Integration Layer
                                              |
                    +-------------------------+-------------------------+
                    |                         |                         |
                    v                         v                         v
                 CAP-001              Consultant Platform       Shared Capabilities
                 Identity               / CAP-003              CAP-004 / CAP-005 /
                                                                  CAP-010
```

## 3. Initial Deployment Shape

The target domain architecture does **not** require immediate physical microservice decomposition.

The first reliable deployment should remain operationally simple:

```text
Fiteatsy Mobile
      |
      v
Fiteatsy API (Node / Express)
      |
      +---------- PostgreSQL
      |
      +---------- Object Storage [when report binary persistence is implemented]
      |
      +---------- External Provider APIs [as introduced]
```

The existing backend may act as a modular monolith while boundaries are enforced internally.

## 4. Evolution Path

Independent services may later be extracted when justified:

- health ingestion / normalisation;
- medical report processing;
- biomarker processing;
- notifications;
- health/recovery intelligence;
- integration/event delivery;
- background jobs/workers.

Extraction must be driven by at least one concrete requirement such as:

- independent scaling;
- asynchronous workload;
- security/isolation boundary;
- materially different reliability requirements;
- provider-specific integration complexity;
- independent release cadence;
- compute-intensive processing;
- clear bounded-context ownership.

## 5. Persistence

### PostgreSQL

Expected authoritative structured state includes, as applicable:

- accounts and sessions;
- Fiteatsy client records once the Account → Client model is approved;
- health profiles;
- health metrics / normalised observations;
- care/product lifecycle records;
- biomarker observations;
- report metadata;
- medication schedules;
- recovery/progress records;
- integration state;
- audit/sync metadata.

### Object Storage

Medical report files should use private object/file storage with controlled access.

Database records should reference stored objects and maintain metadata, integrity and ownership.

### Cache / Queue

Redis, queues or brokers are not mandatory merely because the architecture may become distributed.

Introduce them only when asynchronous workloads, retries, rate control, caching or event delivery require them.

## 6. API Boundary

The mobile application communicates with Fiteatsy through versioned APIs.

External Zestiva systems communicate through trusted service APIs/events.

No external system receives direct database access.

## 7. Health Intelligence

Health intelligence should be layered:

```text
Raw / Source Data
       |
       v
Normalisation & Validation
       |
       v
Deterministic Metrics / Clinical Rules
       |
       v
Trend / Recovery Computation
       |
       +----------------+
       |                |
       v                v
User Indicator     Practitioner Context
       |
       v
AI Explanation [where approved]
```

An LLM or generative model must not independently establish clinical truth or fabricate an improvement score.

## 8. Availability and Freshness

Health data freshness varies by source.

Every practitioner-facing health view should eventually support:

- source;
- measured_at;
- received_at;
- last_synced_at;
- data freshness/staleness state.

The product must not represent intermittently synchronized phone health data as guaranteed live telemetry.

## 9. Deployment Platform

Current infrastructure direction:

- Railway — Fiteatsy backend, PostgreSQL and future backend workers/services.
- Expo/native distribution — Fiteatsy iOS/Android application.
- Vercel — not required for the current mobile runtime; may be used later for a web/admin surface if one is introduced.

Deployment details belong in `docs/11_DEPLOYMENT`.
