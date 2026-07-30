# Fiteatsy — Offline & Timezone Behaviour

## Offline Reminders

Local reminders should continue where the operating system permits even when the backend is temporarily unavailable.

## Offline Actions

User acknowledgement can be queued locally and synchronised later.

The client should retain:

- local event identifier;
- event timestamp;
- associated reminder occurrence;
- sync status.

## Timezones

Medication reminders are time-sensitive.

The product must define behaviour when the user changes timezone.

Possible schedule semantics include:

- wall-clock/local-time schedule;
- fixed absolute-time schedule.

Do not silently assume these are equivalent.

## Daylight Saving

Where applicable, daylight-saving changes must be handled by the chosen scheduling semantics.

## Clock Changes

The system should tolerate device-clock changes and avoid creating uncontrolled duplicate adherence events.

## Multi-Device

Multi-device conflict behaviour is FUTURE unless explicitly implemented.

Backend-owned schedules make future reconciliation possible.
