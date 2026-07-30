# Fiteatsy — 06 Health Data

**Document Group:** Health Data Platform  
**Status:** Target Contract + Implementation Guardrails

## Purpose

Defines how Fiteatsy collects, normalises, stores, synchronises and exposes longitudinal health data from user-authorised health applications, operating-system health stores, wearable devices and approved provider APIs.

This package is intentionally deeper than the architecture/API documents. It defines the health-data semantics that future implementation must preserve.

## Documents

- `HEALTH_DATA_PLATFORM.md`
- `SOURCE_INTEGRATION_MODEL.md`
- `CANONICAL_METRIC_MODEL.md`
- `SYNC_AND_CHECKPOINT_MODEL.md`
- `DEDUPLICATION_AND_CORRECTION.md`
- `PROVENANCE_QUALITY_AND_FRESHNESS.md`
- `LONGITUDINAL_HEALTH_MODEL.md`
- `HEALTH_DATA_PRIVACY_AND_CONSENT.md`
- `CONSULTANT_HEALTH_DATA_PROJECTION.md`
- `HEALTH_DATA_IMPLEMENTATION_SEQUENCE.md`

## Core Rule

Fiteatsy must preserve the distinction between:

- what was measured;
- when it was measured;
- where it came from;
- when Fiteatsy received it;
- whether it is stale/incomplete;
- what Fiteatsy calculated from it.

No generated insight may silently replace a source health observation.
