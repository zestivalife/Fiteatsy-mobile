# Fiteatsy — Backend Authority

**Status:** ACTIVE

## 1. Backend-Owned State

The backend should be authoritative for durable state including, as capabilities mature:

- accounts and sessions;
- Fiteatsy Client lifecycle;
- health profile;
- normalised health observations;
- health-data synchronization state;
- medical-report metadata;
- biomarker observations;
- medication records/schedules where server persistence is required;
- recovery/progress calculations and history;
- integration/outbox/reconciliation state;
- audit-relevant lifecycle information.

## 2. Mobile-Owned Responsibilities

The mobile application owns:

- native UI state;
- platform permission interaction;
- reading device-local health sources such as Apple Health / Health Connect;
- temporary/offline cache;
- local notification presentation where appropriate;
- device-specific integration mechanics;
- collection of user inputs before authoritative submission.

Mobile storage must not silently override newer server state.

## 3. Shared / Synchronised State

Some information exists locally for responsiveness but is authoritative on the backend.

Such state requires explicit synchronization semantics:

- server version;
- updated timestamp;
- conflict strategy;
- retry;
- failed-write handling;
- offline behaviour.

## 4. External Authority

The Fiteatsy backend must respect external Zestiva capability ownership:

- CAP-001 — platform Person/IAM correlation;
- CAP-003 — Practitioner Assignment/access;
- CAP-004 — shared Assessment where adopted;
- CAP-005 — shared Nutrition where adopted;
- CAP-010 — platform AI governance.

Fiteatsy must not duplicate these authorities merely for convenience.

## 5. Consultant Boundary

Consultant/Practitioner systems consume Fiteatsy through authenticated APIs, projections and future governed events.

Direct Consultant database access to Fiteatsy persistence is prohibited.
