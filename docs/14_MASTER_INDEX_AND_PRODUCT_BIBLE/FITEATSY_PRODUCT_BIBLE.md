# Fiteatsy Product Bible

**Product:** Fiteatsy  
**Product Type:** Mobile-first health tracking, disease-management and recovery-support platform  
**Primary Client:** Fiteatsy mobile user  
**Professional Workspace:** Zestiva Consultant / Practitioner System  
**Status:** Backend production runtime verified and accepted on 30 July 2026; `M3A — Client Identity Foundation` is production-accepted on 30 July 2026; `M3B` architecture is approved; `M3B.1 — Ownership Schema Foundation` is production-accepted on 1 August 2026; `M3B.2+` and `M3C` remain future governed slices

## 1. Product Mission

Fiteatsy provides a unified platform through which users can:

- collect health data from supported phone health platforms and wearable ecosystems;
- maintain longitudinal health history;
- upload and retain medical/laboratory reports;
- structure and compare biomarkers over time;
- organise medication reminders;
- understand governed progress/recovery indicators;
- share approved health context with authorised Practitioners;
- receive professional diet/recovery interventions through the wider Zestiva ecosystem.

The product supports tracking, management and recovery-oriented workflows. It must not overstate its ability to diagnose, prescribe or guarantee recovery.

## 2. Core Runtime

```text
Fiteatsy Mobile
      |
      v
Fiteatsy Backend
      |
      +--> Fiteatsy PostgreSQL
      +--> Private Report Storage [when implemented]
      +--> Workers [when required]
      |
      +<--> Consultant Backend
                |
                v
              CAP-003
                |
                v
           Practitioner
```

## 3. Domain Authority

- CAP-001: platform Person / IAM authority.
- Fiteatsy/CAP-011: Fiteatsy Client and Fiteatsy-owned health/product state.
- CAP-003: Practitioner assignment/access.
- CAP-004: assessment capability where platform-owned contracts apply.
- CAP-005: nutrition capability where platform-owned contracts apply.
- CAP-010: governed AI platform capabilities when available.
- CAP-002: Nuetra Client / Corporate Health only; not Fiteatsy authority.

## 4. Core Invariants

1. Fiteatsy and Consultant are separate systems.
2. They do not share an authoritative application database.
3. Fiteatsy owns detailed Fiteatsy health truth.
4. Consultant stores minimal projections and queries approved health context.
5. Practitioner access is determined by CAP-003.
6. Fiteatsy Client existence does not grant Practitioner access.
7. Health-data provenance and freshness must remain visible.
8. Original medical reports remain distinguishable from extracted/derived data.
9. AI explanation is not authoritative source health data.
10. Recovery methodology must be versioned and approved.
11. Production acceptance requires runtime evidence.

## 5. Current Programme Position

Architecture/documentation foundation is established.

The current backend production runtime has been technically verified and explicitly accepted by the Product Owner.

Accepted deployment facts:

- service: `Fiteatsy Backend`
- production URL: `https://fiteatsy-mobile-production.up.railway.app`
- branch: `main`
- Git SHA: `49c2276dd1bd46b428eea37885961895806c672d`
- environment: `production`
- health/readiness/database connectivity verified
- OTP debug exposure removed
- M3A migration `0002` recorded in the production migration ledger
- M3B.1 migration `0003` recorded in the production migration ledger
- M3B.1 direct-root schema verified for `health_profiles`, `care_cases`, `nutrition_profiles`, and `notifications`
- current production dataset verified as `0 users / 0 clients`

The next engineering objective is not another feature build.

The next objective is:

```text
M3A — Client Identity Foundation
          |
          v
Production Accepted
          |
          v
M3B.1 — Ownership Schema Foundation
          |
          v
Production Accepted
          |
          v
M3B.2 — Repository and Authorization Transition
          |
          v
Definition / Readiness Review Required
```

Known limitations:

- constraint/index metadata for `fiteatsy_clients` was not independently runtime-inspected during acceptance;
- production currently has zero users and zero clients, so populated live evidence for account -> client mappings and live public-ID uniqueness remains deferred rather than blocked.

Current governance rule:

- `M3A — Client Identity Foundation` is closed as `PRODUCTION_ACCEPTED`;
- `M3B` architecture is approved;
- `M3B.1 — Ownership Schema Foundation` is closed as `PRODUCTION_ACCEPTED`;
- accepted M3B.1 production scope is limited to direct-root persisted ownership surfaces that exist in the deployed `0001 + 0002` baseline: `health_profiles`, `care_cases`, `nutrition_profiles`, and `notifications`;
- deferred persistence/ownership surfaces remain future governed work until authoritative persistence exists: `daily_checkins`, `ai_decision_logs`, `nudges`, `lab_reports`, `attachments`;
- `M3B.2`, `M3B.3`, `M3B.4`, and `M3C` remain out of scope until separately governed.

## 6. Engineering Rule

Every implementation prompt must specify:

- exact scope;
- authoritative documents;
- prohibited scope;
- tests;
- runtime verification;
- Git requirements;
- completion-report format.

Do not ask Codex to read the entire Product Bible tree for every task.
