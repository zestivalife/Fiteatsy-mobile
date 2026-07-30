# Fiteatsy — Medication Platform

## Objective

Help users organise medication schedules and reminders while creating a reliable longitudinal record of reminder/adherence interactions where the user chooses to track them.

## Product Flow

```text
User Adds Medication
        |
        v
Medication Record
        |
        v
Reminder Schedule
        |
        v
Notification
        |
        +--------------------+
        |                    |
        v                    v
Taken / Completed       Skipped / Missed
        |                    |
        +---------+----------+
                  |
                  v
          Adherence History
```

## Responsibilities

Fiteatsy may support:

- medication record creation;
- dosage/schedule recording;
- start/end dates;
- reminder scheduling;
- reminder enable/disable;
- user acknowledgement;
- adherence history;
- optional Practitioner visibility after explicit approval.

## Authority

The user-entered record is not proof that the medication was prescribed, dispensed or clinically appropriate.

Future prescription integration, if ever introduced, requires a separate governed capability.
