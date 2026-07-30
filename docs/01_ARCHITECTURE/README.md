# Fiteatsy — 01 Architecture

**Document Group:** Implementation Architecture  
**Product:** Fiteatsy  
**Status:** Architecture Baseline  
**Scope:** Fiteatsy mobile, backend, data, integrations, and Zestiva ecosystem boundaries

## Purpose

This folder defines how Fiteatsy should be structured technically while preserving the product boundaries defined by the Zestiva Product Bible / CAP-011.

Fiteatsy is a longitudinal health-management, fitness, disease/condition-management and recovery-support platform. It collects health signals from user-authorised sources, stores and normalises longitudinal health information, manages medical reports and medication reminders, produces governed health/recovery insights, and exposes authorised health context to the Consultant / Practitioner system.

## Architecture Principles

1. Fiteatsy remains authoritative for Fiteatsy-owned product data.
2. Mobile-device health sources and cloud health providers use different ingestion patterns.
3. Raw health data is not indiscriminately copied into other Zestiva systems.
4. Consultant access is governed by CAP-003 Practitioner Assignment.
5. Cross-system identity is governed through CAP-001; email, phone and name are not permanent integration keys.
6. CAP-004, CAP-005 and CAP-010 remain separate capability authorities where adopted.
7. PostgreSQL is the authoritative transactional persistence target for backend-owned Fiteatsy state.
8. Medical report binaries require object/file storage; they should not be stored as large database blobs by default.
9. APIs and events are the system boundaries. Cross-database access is prohibited.
10. Microservices are introduced by justified capability boundaries, not by default.
11. Health and recovery intelligence must distinguish deterministic/rule-based calculations from AI-generated explanations.
12. "Real-time" interfaces must expose source freshness. Mobile health data is generally near-real-time, not guaranteed live telemetry.

## Documents

- `TARGET_PLATFORM_ARCHITECTURE.md` — target Fiteatsy platform topology and major runtime components.
- `SERVICE_BOUNDARIES.md` — capability/service boundaries and when components may become independent services.
- `HEALTH_DATA_INGESTION_ARCHITECTURE.md` — phone-based and cloud-based health/wearable ingestion.
- `ZESTIVA_INTEGRATION_ARCHITECTURE.md` — governed integration with Consultant and shared Zestiva capabilities.
- `DATA_FLOW_ARCHITECTURE.md` — end-to-end health, report, biomarker, progress and intervention data flows.
- `ARCHITECTURE_DECISIONS_AND_GUARDS.md` — explicit decisions, prohibited shortcuts and unresolved architecture questions.

## Relationship to CAP-011

These documents describe Fiteatsy implementation architecture.

They do not replace the CAP-011 Product Bible. Where a cross-product/domain ownership question exists, CAP-011 and the relevant platform capability remain authoritative.

Implementation evidence may reveal that a target component is not yet present. Documentation must preserve the distinction between CURRENT and TARGET architecture.
