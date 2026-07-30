# Fiteatsy — Medication Notification Architecture

## Initial Direction

For a mobile-first product, medication reminders can primarily use operating-system local notifications when appropriate.

```text
Backend Medication Schedule
        |
        v
Mobile Synchronisation
        |
        v
Local Notification Schedule
        |
        v
Device Notification
```

## Why Keep Backend State

Even when the device delivers the reminder, the backend should eventually own the durable medication/schedule record so that:

- reinstall/device change does not destroy the schedule;
- Consultant context can be governed;
- history can persist;
- future multi-device support is possible.

## Push Notifications

Remote push may be introduced for use cases that actually require server-triggered delivery.

## Notification Permission

If the user denies notification permission:

- medication data remains valid;
- reminder delivery becomes unavailable/degraded;
- the product should expose the state clearly.

## Sensitive Content

Lock-screen notification content should avoid unnecessary disclosure of sensitive health information.

Exact notification copy/privacy behaviour requires product approval.
