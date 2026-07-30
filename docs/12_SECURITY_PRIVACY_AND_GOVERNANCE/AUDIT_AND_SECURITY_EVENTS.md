# Fiteatsy — Audit & Security Events

## Audit vs Operational Logs

Audit records represent security/business-relevant actions.

Operational logs support runtime debugging.

Do not treat them as interchangeable.

## Candidate Audit Events

- authentication/session lifecycle;
- consent change;
- report access;
- Practitioner health-context access;
- administrative correction;
- client identity correlation;
- data export/deletion request;
- privileged configuration changes;
- integration repair.

## Audit Record

May include:

- event ID;
- actor;
- actor type;
- action;
- target;
- timestamp;
- result;
- correlation ID;
- environment;
- safe metadata.

## Sensitive Payload

Audit records should not duplicate entire health payloads.

## Integrity

Audit records should be append-oriented and protected from ordinary user modification.
