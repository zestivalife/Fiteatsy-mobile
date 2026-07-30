# Fiteatsy — Health Synchronisation & Checkpoints

## Objective

Synchronise health data reliably without repeatedly uploading the user's entire history.

## Incremental Flow

```text
Read Last Successful Checkpoint
          |
          v
Query Source for Window/Changes
          |
          v
Normalise to Upload Contract
          |
          v
Create Bounded Batch
          |
          v
POST to Fiteatsy
          |
          v
Server Persists / Rejects
          |
          v
Server Acknowledgement
          |
          v
Advance Checkpoint
```

## Checkpoint Rule

Advance a durable checkpoint only after server acknowledgement.

## Initial Backfill

First connection may require historical backfill.

Backfill should be:

- bounded;
- paginated/batched;
- resumable;
- observable;
- idempotent.

## Foreground / Background

Mobile operating systems constrain background execution.

Fiteatsy must not promise continuous sync merely because a background task is configured.

## Retry

Retry behaviour must distinguish:

- network failure;
- authentication failure;
- validation failure;
- server transient failure;
- permanent unsupported data.

## Batch Size

Batch size must be bounded to avoid excessive memory, payload and timeout behaviour.

Exact limits belong in implementation/API configuration.
