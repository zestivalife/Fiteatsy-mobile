# Fiteatsy Product Bible

**Product:** Fiteatsy  
**Product Type:** Mobile-first health tracking, disease-management and recovery-support platform  
**Primary Client:** Fiteatsy mobile user  
**Professional Workspace:** Zestiva Consultant / Practitioner System  
**Status:** Architecture baseline established; deployment/runtime foundation next

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

The next engineering objective is not another feature build.

The next objective is:

```text
Railway Deployment Readiness Audit
          |
          v
Staging Railway + PostgreSQL
          |
          v
Close Phase 1B Runtime Verification
          |
          v
Fiteatsy Client / Identity Phase 1C
```

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
