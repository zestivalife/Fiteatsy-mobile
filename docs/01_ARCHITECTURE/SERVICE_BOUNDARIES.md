# Fiteatsy — Service and Capability Boundaries

**Status:** TARGET BOUNDARIES; PHYSICAL SERVICE EXTRACTION IS NOT IMPLIED

## Principle

A capability boundary and a deployable microservice are not the same thing.

Fiteatsy should first maintain clean modules/domains. A module should become an independent service only when operational or ownership requirements justify the cost.

## Logical Capabilities

| Capability | Responsibility | Initial Runtime Direction | Potential Future Service |
|---|---|---|---|
| Account/Auth | Fiteatsy account, session, authentication | Existing Fiteatsy API | Identity-facing service only if justified |
| Client | Product client identity/lifecycle after Phase 1C decision | Not finalised | Client service/module |
| Health Ingestion | Receive phone/cloud health data | API module | Health ingestion service |
| Health Normalisation | Convert provider-specific metrics into canonical observations | API/module/worker | Health data service |
| Medical Reports | Upload metadata, report lifecycle, access | API module | Report service |
| Report Processing | Extraction/processing pipeline | Worker boundary | Report-processing worker/service |
| Biomarkers | Normalised biomarker observations/trends | Module | Biomarker service if justified |
| Medication | Medication records/reminders | Module | Medication service if scale/notification complexity requires |
| Notifications | Reminder delivery/push scheduling | Module/worker | Notification service |
| Recovery Intelligence | Deterministic progress/recovery calculations | Module/worker | Intelligence service |
| Nutrition/Intervention | Fiteatsy consumption/display of governed plans/context | Integration/module | Depends on CAP-005 ownership |
| Consultant Integration | Projection/events/query APIs for authorised monitoring | Integration module | Integration service |
| Audit/Sync | Delivery/reconciliation metadata | Shared backend module | Integration/event worker |

## Shared Zestiva Capabilities

Fiteatsy must not duplicate platform capability authority simply because it needs the capability.

- CAP-001: platform Person/IAM correlation.
- CAP-003: Practitioner Assignment and practitioner-client access.
- CAP-004: platform Assessment boundary where adopted.
- CAP-005: platform Nutrition boundary where adopted.
- CAP-010: governed AI platform capabilities.
- CAP-011: Fiteatsy product bounded context.

## API Gateway

A dedicated Fiteatsy API Gateway is **not required for the initial deployment**.

The existing Express backend may provide the public Fiteatsy API boundary.

Introduce a gateway when justified by multiple independently deployed services, central routing, workload authentication, rate limiting, policy enforcement or external integration complexity.

Do not route Fiteatsy through the existing Nuetra gateway by default.

## Background Processing

The following are natural asynchronous candidates:

- large report processing;
- OCR/extraction where approved;
- biomarker normalisation;
- health-data batch ingestion;
- trend recomputation;
- notifications;
- integration event delivery;
- reconciliation jobs.

These workloads should not unnecessarily block user-facing API requests.

## Prohibited Boundary Violations

- Health providers must not write directly to Fiteatsy PostgreSQL.
- Consultant system must not query Fiteatsy PostgreSQL directly.
- Mobile clients must not possess trusted service credentials.
- Fiteatsy subscription/profile existence must not grant Practitioner access.
- AI output must not silently overwrite authoritative health observations.
- Provider-specific metric formats must not leak throughout the domain model; normalise at the ingestion boundary.
