# Fiteatsy — Medication Adherence Event Model

**Status:** TARGET

## Purpose

Track user interaction with medication reminders without falsely claiming verified ingestion.

## Important Distinction

`TAKEN` means the user indicated that they took the medication.

It does not prove biological ingestion.

## Conceptual Event

An adherence event may include:

- event_id;
- client_ref;
- medication_ref;
- reminder occurrence ref;
- scheduled_at;
- user_action;
- action_at;
- source_device;
- created_at.

## Potential User Actions

Examples:

- taken;
- skipped;
- snoozed;
- dismissed;
- no response.

Exact vocabulary should be product-approved.

## Longitudinal Use

Adherence history may eventually support:

- user history;
- plan adherence context;
- Practitioner review;
- recovery/progress context.

It must not automatically be interpreted as the cause of a health change.

## Correction

Users may need to correct accidental actions.

Corrections should preserve audit/history where required rather than silently rewriting all evidence.
