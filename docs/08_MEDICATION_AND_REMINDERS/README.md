# Fiteatsy — 08 Medication & Reminders

**Document Group:** Medication Tracking & Reminder Platform  
**Status:** Target Contract + Safety Guardrails

## Purpose

Defines how Fiteatsy should manage user-entered medication records, reminder schedules, reminder delivery, adherence events, offline behaviour and optional Practitioner visibility.

This capability supports medication organisation and adherence tracking. It does not give Fiteatsy prescribing authority.

## Documents

- `MEDICATION_PLATFORM.md`
- `MEDICATION_RECORD_MODEL.md`
- `REMINDER_SCHEDULING_MODEL.md`
- `NOTIFICATION_ARCHITECTURE.md`
- `ADHERENCE_EVENT_MODEL.md`
- `OFFLINE_AND_TIMEZONE_BEHAVIOUR.md`
- `PRACTITIONER_MEDICATION_CONTEXT.md`
- `MEDICATION_SAFETY_AND_GUARDS.md`
- `IMPLEMENTATION_SEQUENCE.md`

## Core Rule

Fiteatsy may record what a user says they take and remind them according to a configured schedule. It must not independently start, stop, prescribe or change medication.
