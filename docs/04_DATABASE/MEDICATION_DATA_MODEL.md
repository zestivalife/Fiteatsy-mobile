# Fiteatsy — Medication Data Model

## Scope

Medication functionality currently focuses on user-maintained records and reminders.

It does not establish prescribing authority.

## Conceptual Entities

### Medication Record

May include:

- medication_id;
- client_ref;
- display name;
- dosage text/structured dosage where approved;
- route/form where relevant;
- start date;
- end date;
- active status;
- user notes;
- source;
- created_at / updated_at.

### Reminder Schedule

May include:

- reminder_id;
- medication_ref;
- schedule/time;
- timezone;
- recurrence;
- enabled status;
- next occurrence;
- notification preference.

## Practitioner Visibility

Whether medication context is visible in Consultant requires an explicit product/privacy decision.

## Historical Integrity

Editing a medication should not destroy clinically useful historical context where the product requires longitudinal history.
