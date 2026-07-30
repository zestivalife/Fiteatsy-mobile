# Fiteatsy — Report & Biomarker API

**Status:** TARGET CONTRACT

## Report Lifecycle

Conceptual API flow:

```text
Create Upload
    |
    v
Upload File
    |
    v
Confirm / Register
    |
    v
PROCESSING
    |
    +--> COMPLETED
    +--> FAILED
```

## Target Report Operations

Potential responsibilities:

- create controlled upload;
- list user's reports;
- retrieve report metadata;
- retrieve processing status;
- retrieve controlled report access;
- delete/archive according to approved lifecycle.

## Object Storage

The API should avoid routing large files through the application server when a secure direct-upload mechanism is appropriate.

A future pattern may use short-lived signed upload/download access.

## Biomarker Operations

Target capabilities:

- list biomarkers by report;
- retrieve longitudinal biomarker history;
- compare compatible historical observations;
- retrieve extraction/validation provenance.

## Provenance

API responses should distinguish:

- source value;
- source unit;
- canonical value/unit;
- extraction status;
- confidence where applicable;
- report/date provenance;
- generated explanation.

## Guard

A report-processing response must not present an AI-generated inference as though it were a laboratory-measured value.
