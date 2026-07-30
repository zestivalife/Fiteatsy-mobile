# Fiteatsy — 11 Deployment & Railway

**Document Group:** Runtime, Deployment & Production Operations
**Status:** Target Deployment Baseline

## Purpose

Defines the deployment architecture for the Fiteatsy backend using Railway, with PostgreSQL as authoritative persistence and the Expo/React Native application consuming the deployed API.

Fiteatsy does not require Vercel to run its mobile application. Vercel may be used later for web/admin surfaces if needed.

## Documents

- `RAILWAY_TARGET_ARCHITECTURE.md`
- `ENVIRONMENT_STRATEGY.md`
- `SERVICE_AND_DATABASE_LAYOUT.md`
- `ENVIRONMENT_VARIABLES_AND_SECRETS.md`
- `DATABASE_MIGRATION_DEPLOYMENT.md`
- `HEALTH_VERSION_AND_READINESS.md`
- `WORKERS_AND_BACKGROUND_JOBS.md`
- `MEDICAL_REPORT_STORAGE_DEPLOYMENT.md`
- `MOBILE_API_CONFIGURATION.md`
- `OBSERVABILITY_AND_LOGGING.md`
- `DEPLOYMENT_VERIFICATION_AND_ACCEPTANCE.md`
- `ROLLBACK_AND_RECOVERY.md`
- `IMPLEMENTATION_SEQUENCE.md`

## Core Rule

A successful Railway build is not equivalent to a verified production deployment. Runtime acceptance requires health, version, database, migration, authentication and API evidence.
