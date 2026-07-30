# Fiteatsy — 05 API

**Document Group:** API & Integration Contracts  
**Status:** Contract Baseline + Target Direction

## Purpose

Defines the API families Fiteatsy needs for the mobile application, health-data ingestion, reports, biomarkers, medication, recovery/progress and future trusted Zestiva/Consultant integrations.

This package defines contract rules and ownership. It does not claim that every endpoint described here already exists.

## Current Baseline

The current backend already exposes `/v1/auth/*`, `/v1/platform/*`, `/v1/reports/*`, `/v1/wearables/*`, `/v1/intelligence/*` and related routes.

Phase 1B introduced stronger Bearer authentication and server-side ownership for protected platform/report/wearable routes.

The target API model should evolve from this baseline without breaking working mobile flows unnecessarily.

## Documents

- `API_ARCHITECTURE.md`
- `MOBILE_API_CONTRACT.md`
- `HEALTH_INGESTION_API.md`
- `REPORT_AND_BIOMARKER_API.md`
- `MEDICATION_API.md`
- `RECOVERY_PROGRESS_API.md`
- `CONSULTANT_TRUSTED_API.md`
- `API_SECURITY_AND_AUTHORIZATION.md`
- `API_VERSIONING_IDEMPOTENCY_AND_ERRORS.md`
- `API_EVOLUTION_MAP.md`

## Rule

Public/mobile APIs and trusted backend-to-backend APIs are separate trust boundaries even when they are temporarily served by the same Express application.
