# Fiteatsy — Background Processing

**Status:** TARGET

## Why Background Work Is Needed

Several Fiteatsy workloads should not block interactive mobile API requests.

Potential workloads include:

- medical-report extraction;
- biomarker normalisation;
- historical report comparison;
- large health-data batches;
- recovery/progress recomputation;
- notification scheduling/delivery;
- Consultant projection delivery;
- reconciliation;
- retrying provider integrations.

## Target Pattern

```text
API Request
    |
    v
Validate + Persist Intent
    |
    v
Create Durable Job/Event
    |
    v
Return Accepted/Current State
    |
    v
Worker
    |
    v
Process
    |
    +--> Persist Result
    +--> Audit
    +--> Emit Follow-up Event
```

## Reliability Requirements

When implemented, background work should support:

- durable work state;
- retry with limits/backoff;
- idempotent processing;
- dead-letter/failure visibility;
- correlation IDs;
- observability;
- safe replay.

## Technology

No queue/broker technology is frozen yet.

Railway workers, PostgreSQL-backed jobs, Redis-backed queues, or a dedicated broker may be evaluated when workload requirements are known.

Do not introduce infrastructure merely to satisfy a diagram.
