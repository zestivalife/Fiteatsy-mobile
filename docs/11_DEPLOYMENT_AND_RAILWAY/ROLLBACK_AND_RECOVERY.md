# Fiteatsy — Rollback & Recovery

## Application Rollback

A previous application version can only be safely redeployed if it remains compatible with the current database schema.

## Database Reality

Database migrations are often not safely reversible.

Prefer:

- backward-compatible migrations;
- expand/migrate/contract patterns;
- forward fixes where appropriate.

## Backup

Production PostgreSQL backup/recovery capability must be understood before storing irreplaceable user health data.

## Incident Recovery

Recovery planning should cover:

- failed deployment;
- database unavailability;
- accidental destructive migration;
- object-storage failure;
- credential compromise;
- integration outage.

## Mobile Compatibility

Because mobile releases cannot be instantly rolled back for every user, backend APIs should tolerate supported older app versions during rollout windows.

## Evidence

Rollback/recovery actions should record deployment and migration identity.
