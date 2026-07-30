# Fiteatsy — 10 Consultant Integration

**Document Group:** Cross-System Client & Practitioner Integration
**Status:** Target Architecture + Contract Guardrails

## Purpose

Defines how the standalone Fiteatsy product integrates with the Zestiva Consultant / Practitioner system while preserving product ownership, identity authority, Practitioner authorization and health-data privacy.

Fiteatsy remains authoritative for Fiteatsy health data. Consultant becomes the professional workspace through which authorised Practitioners monitor assigned clients and manage approved interventions.

## Documents

- `INTEGRATION_ARCHITECTURE.md`
- `CROSS_SYSTEM_IDENTITY.md`
- `CLIENT_PROJECTION_MODEL.md`
- `CAP003_PRACTITIONER_ASSIGNMENT_BOUNDARY.md`
- `TRUSTED_SERVICE_AUTHENTICATION.md`
- `HEALTH_CONTEXT_ACCESS.md`
- `EVENT_AND_INCREMENTAL_SYNC.md`
- `INITIAL_BACKFILL_AND_RECONCILIATION.md`
- `FAILURE_RECOVERY_AND_IDEMPOTENCY.md`
- `PRIVACY_AUDIT_AND_DATA_MINIMISATION.md`
- `END_TO_END_SEQUENCE.md`
- `IMPLEMENTATION_SEQUENCE.md`

## Core Invariants

1. CAP-001 owns platform Person identity.
2. Fiteatsy owns Fiteatsy Client and Fiteatsy health truth.
3. CAP-003 owns Practitioner Assignment and professional access.
4. Consultant does not directly query Fiteatsy PostgreSQL.
5. Fiteatsy does not grant Practitioner access because a client exists.
6. Cross-system synchronization must be durable, replay-safe and reconcilable.
