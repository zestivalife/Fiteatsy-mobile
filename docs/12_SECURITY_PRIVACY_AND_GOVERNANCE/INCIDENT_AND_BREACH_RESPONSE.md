# Fiteatsy — Incident & Breach Response

## Purpose

Define engineering readiness for security/privacy incidents without inventing jurisdiction-specific legal notification requirements.

## Detection Sources

Potential sources:

- runtime alerts;
- authentication anomalies;
- audit review;
- provider notifications;
- user reports;
- secret scanning;
- database/storage monitoring.

## Technical Response

Conceptual sequence:

```text
Detect
  |
  v
Contain
  |
  v
Preserve Evidence
  |
  v
Assess Scope
  |
  v
Revoke / Rotate / Patch
  |
  v
Recover
  |
  v
Post-Incident Review
```

## Credential Incident

If a credential is confirmed exposed:

- revoke/rotate;
- inspect usage;
- replace deployment configuration;
- verify old credential no longer works.

## Data Incident

Preserve enough evidence to determine:

- affected systems;
- affected records;
- time window;
- access path;
- actor where possible.

## Legal/Communication

Notification obligations and communication plans require authorised organisational/legal decision-making.
