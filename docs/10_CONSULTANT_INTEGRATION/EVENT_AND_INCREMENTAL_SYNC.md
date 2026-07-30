# Fiteatsy — Events & Incremental Synchronisation

## Why Events

Consultant needs to know when relevant Fiteatsy state changes without continuously scanning every client.

## Candidate Events

Future governed events may include:

```text
fiteatsy.client.created
fiteatsy.client.updated
fiteatsy.client.activated
fiteatsy.client.deactivated

fiteatsy.health.updated
fiteatsy.report.processed
fiteatsy.biomarker.updated
fiteatsy.progress.updated
```

Names are proposed contract families, not frozen runtime events.

## Event Envelope

A future event should carry:

- event_id;
- event_type;
- occurred_at;
- producer;
- schema_version;
- client reference;
- source entity version;
- correlation_id;
- minimal payload.

## Minimise PHI

Events should usually signal change and provide minimal projection data.

Do not place full report contents or huge raw health datasets on the event bus.

## Outbox

Domain change and outbox creation should be committed atomically where reliable delivery matters.

## Delivery

Consumers must tolerate:

- duplicate delivery;
- delayed delivery;
- out-of-order delivery.

Therefore processing must be idempotent and version-aware.

## Event ≠ Authorization

Receiving an event about a client does not grant a Practitioner permission to access that client's health data.
