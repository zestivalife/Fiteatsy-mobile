# Fiteatsy — Master Implementation Roadmap

## Current Starting Point

The repository already contains:

- Expo / React Native mobile application;
- Node / Express / TypeScript backend;
- Phase 1B PostgreSQL persistence implementation;
- durable session/authentication foundation;
- existing health/wearable/report/platform modules;
- legacy/local mobile state that still requires migration;
- Railway production deployment accepted.

## Current Programme Marker

- `M0` through `M2` are historical/completed sequence items for the accepted backend baseline.
- `G6 — Production Acceptance Gate` is complete.
- The next governed milestone is `M3 — Fiteatsy Client & Identity`.
- `M3` definition/architecture is approved.
- `M3A — Client Identity Foundation` is production-accepted.
- `M3B` definition is ready for Product Owner review.
- `M3B` and `M3C` implementation remain unauthorized pending later governance.

## Programme Sequence

```text
M0 Documentation & Architecture Baseline
          |
          v
M1 Phase 1B Runtime Closure
          |
          v
M2 Railway Runtime Foundation
          |
          v
M3 Fiteatsy Client & Identity
          |
          v
M4 Core Backend / DB / API Stabilisation
          |
          +------------------+
          |                  |
          v                  v
M5 Health Data          M6 Medical Records
          |                  |
          +--------+---------+
                   |
                   v
             M7 Medication
                   |
                   v
        M8 Recovery Intelligence
                   |
                   v
        M9 Consultant Integration
                   |
                   v
       M10 Production Hardening
                   |
                   v
       M11 Production Acceptance
```

## M0 — Documentation Baseline

Architecture/document packages `00` through `13` form the planning baseline.

Exit:
- documents stored in repository;
- no known contradictory legacy docs treated as authority;
- implementation roadmap approved.

## M1 — Phase 1B Runtime Closure

Goal:
Verify already-written persistence/auth code against a real PostgreSQL runtime.

Exit evidence:
- migrations applied;
- backend starts;
- auth works;
- session persists;
- profile/care data persists;
- restart persistence verified;
- negative ownership tests pass.

## M2 — Railway Runtime Foundation

Goal:
Establish staging first.

Exit:
- Fiteatsy Railway project;
- staging API;
- staging PostgreSQL;
- health/readiness/version;
- expected Git SHA running;
- mobile staging configuration reaches API.

Production environment follows only after staging acceptance.

## M3 — Fiteatsy Client & Identity

Goal:
Create explicit Account → Fiteatsy Client contract.

Exit:
- stable `fiteatsy_client_id`;
- cardinality approved;
- lifecycle approved;
- ownership mapping;
- CAP-001 correlation contract prepared;
- migrations/API/tests.

Current state:

- definition/architecture approved;
- `M3A` is closed as `PRODUCTION_ACCEPTED`;
- `M3B` definition/architecture review is complete and awaiting Product Owner approval before any implementation work.

Recommended implementation decomposition after definition approval:

- `M3A — Client Identity Foundation`
- `M3B — Existing Domain Ownership Transition`
- `M3C — Mobile Client Context Integration`

## M4 — Core Backend / API Stabilisation

Goal:
Remove remaining demo/in-memory authority from capabilities required by launch.

Prioritise only launch-critical state.

## M5 — Health Data

Goal:
Persist canonical longitudinal health observations from approved mobile health sources.

Exit:
- source adapters;
- canonical metrics;
- checkpoints;
- idempotent sync;
- provenance;
- freshness;
- longitudinal queries.

## M6 — Medical Records & Biomarkers

Goal:
Secure report lifecycle and structured biomarker history.

Do not introduce expensive AI processing before storage/lifecycle/registry foundations are verified.

## M7 — Medication

Goal:
Move medication/schedule authority to durable backend while retaining reliable local notification delivery.

## M8 — Recovery Intelligence

Goal:
Implement an approved versioned methodology.

No arbitrary score implementation.

## M9 — Consultant Integration

Goal:
Synchronise Fiteatsy Client projection and expose authorised health context.

CAP-003 must be operational before Practitioner health access is accepted.

## M10 — Production Hardening

Security, privacy, observability, backups, failure recovery, performance and mobile release hardening.

## M11 — Production Acceptance

Production acceptance requires runtime evidence, not only successful CI/build/deployment.
