# Fiteatsy — Medication API

**Status:** TARGET CONTRACT

## Responsibilities

The medication API supports user-maintained medication/reminder functionality.

Potential operations include:

```text
GET    /v1/medications
POST   /v1/medications
GET    /v1/medications/{id}
PATCH  /v1/medications/{id}
DELETE /v1/medications/{id}
```

Exact paths are not frozen.

Reminder operations may be nested or separate depending on implementation.

## Authorization

Medication records are client-scoped and protected.

The mobile user cannot access another client's medication records.

## Practitioner Access

Medication visibility through Consultant is not automatically granted.

It requires an explicit product/privacy decision and CAP-003 authorization.

## Safety

Medication APIs manage records/reminders.

They do not provide prescribing authority.
