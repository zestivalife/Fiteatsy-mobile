# Fiteatsy — Logical Data Domain Model

**Status:** TARGET; NOT A FINAL PHYSICAL SCHEMA

```text
Account
  |
  +-- Session
  |
  +-- Fiteatsy Client [Phase 1C]
         |
         +-- Health Profile
         +-- Health Observation *
         +-- Medical Report *
         |      +-- Biomarker Observation *
         |
         +-- Medication *
         |      +-- Reminder Schedule *
         |
         +-- Recovery / Progress Record *
         +-- Integration State *
```

`*` indicates one-to-many conceptual relationships.

## Account

Authentication/account identity.

Do not freeze Account ID as the public Fiteatsy Client ID.

## Fiteatsy Client

The longitudinal product-health subject.

Requires Phase 1C approval before physical contract freeze.

## Health Profile

Relatively stable/current health context required by approved Fiteatsy features.

## Health Observation

Time-series health measurements from devices, health apps, providers or approved manual sources.

## Medical Report

Metadata and lifecycle for an uploaded report. Binary content is external private storage.

## Biomarker Observation

Structured test/biomarker value tied to source/provenance and time.

## Medication

User-maintained medication context and reminder configuration. Does not imply prescribing.

## Recovery / Progress

Versioned/calculated progress outputs with methodology/version provenance.

## Integration State

Tracks sync/outbox/reconciliation rather than mixing delivery state into health records.
