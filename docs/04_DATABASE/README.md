# Fiteatsy — 04 Database

**Document Group:** Persistence & Data Architecture  
**Status:** Architecture Baseline + Target Model

## Purpose

Defines the authoritative persistence model for Fiteatsy without prematurely freezing every physical table.

The database must support longitudinal health data, reports, biomarkers, medication, recovery/progress, integration and audit requirements while preserving product/domain ownership.

## Documents

- `PERSISTENCE_ARCHITECTURE.md`
- `DATA_DOMAIN_MODEL.md`
- `HEALTH_OBSERVATION_MODEL.md`
- `MEDICAL_REPORT_AND_BIOMARKER_MODEL.md`
- `MEDICATION_DATA_MODEL.md`
- `RECOVERY_PROGRESS_DATA_MODEL.md`
- `INTEGRATION_AND_AUDIT_DATA.md`
- `MIGRATION_AND_SCHEMA_GOVERNANCE.md`
- `DATA_RETENTION_AND_DELETION.md`

## Current Direction

Railway PostgreSQL is the planned authoritative relational persistence for Fiteatsy backend state.

Medical-report binaries should use private object storage, with PostgreSQL storing metadata and structured derived information.

No other Zestiva product may directly read or write Fiteatsy database tables.
