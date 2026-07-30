# Fiteatsy — Workers & Background Jobs on Railway

## Do Not Deploy a Worker Yet Without Work

Phase 1 deployment can remain API + PostgreSQL.

## Add Worker When Needed

Strong candidates:

- medical-report processing;
- OCR/document extraction;
- biomarker normalisation;
- large health-data jobs;
- recovery recalculation;
- integration event delivery.

## Pattern

```text
API
 |
 +--> PostgreSQL Job/Outbox
          |
          v
       Worker
          |
          +--> Process
          +--> Persist Result
          +--> Retry / Failure State
```

## Deployment

A Railway worker can use the same repository/image with a different start command when appropriate.

## Reliability

Background jobs require:

- durable state;
- idempotency;
- bounded retry;
- failure visibility;
- correlation IDs;
- safe replay.

## Scaling

Scale workers based on measured workload rather than predicted future volume.
