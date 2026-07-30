# Fiteatsy — Reminder Scheduling Model

## Schedule Responsibilities

A reminder schedule may define:

- medication reference;
- local time(s);
- recurrence;
- timezone;
- start/end date;
- enabled state;
- notification preference;
- next expected occurrence.

## Occurrence Model

The schedule definition and each expected reminder occurrence are different concepts.

For reliable adherence history, a future occurrence may have:

```text
SCHEDULED
   |
   +--> DELIVERED
   |       |
   |       +--> TAKEN
   |       +--> SKIPPED
   |       +--> DISMISSED
   |
   +--> MISSED
   +--> CANCELLED
```

Exact state names require implementation approval.

## Local vs Server Scheduling

Mobile local notifications are useful because they can fire without an active network connection.

Server-side scheduling may later be useful for:

- cross-device consistency;
- remote push;
- monitoring;
- escalation workflows where explicitly approved.

The initial implementation does not need a distributed scheduler merely to support ordinary local reminders.

## Changes

Changing a schedule should affect future occurrences without corrupting historical events.
