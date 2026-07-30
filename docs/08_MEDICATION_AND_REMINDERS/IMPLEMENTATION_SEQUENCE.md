# Fiteatsy — Medication & Reminder Implementation Sequence

## MED-0 — Preserve Existing Mobile Behaviour

Audit current medication/reminder screens and AsyncStorage behaviour before replacing them.

Do not regress existing UX merely to move persistence server-side.

## MED-1 — Durable Medication Records

After Fiteatsy Client identity is available:

- medication table/model;
- ownership;
- CRUD API;
- migration;
- tests.

## MED-2 — Durable Reminder Schedules

Persist schedule definitions and synchronise them to mobile.

## MED-3 — Local Notification Integration

Ensure schedules reliably map to operating-system notifications.

Test:

- permission denied;
- app restart;
- device restart where applicable;
- schedule edits;
- cancellation;
- timezone changes.

## MED-4 — Adherence Events

Introduce user acknowledgement/history with offline-safe synchronization and idempotency.

## MED-5 — History & User Insights

Show medication/reminder history without overstating adherence certainty.

## MED-6 — Practitioner Context

Only after explicit product approval and CAP-003 trusted integration:

- expose approved medication context;
- implement authorization;
- implement audit requirements.

## MED-7 — Advanced Scheduling

Only if justified:

- server-triggered push;
- multi-device reconciliation;
- advanced scheduling worker.

## Engineering Efficiency Rule

Do not ask Codex to build medication persistence, push infrastructure, adherence analytics and Consultant integration in one task.

Implement and verify each layer independently.
