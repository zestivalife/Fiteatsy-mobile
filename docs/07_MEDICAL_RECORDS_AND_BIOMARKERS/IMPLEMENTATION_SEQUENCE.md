# Fiteatsy — Medical Records & Biomarkers Implementation Sequence

## M0 — Runtime Foundation

Before expanding report processing:

- Railway backend operational;
- PostgreSQL operational;
- authentication verified;
- Fiteatsy Client identity available.

## M1 — Private File Storage

Implement:

- storage provider decision;
- private bucket/container;
- upload intent;
- file metadata;
- controlled retrieval;
- ownership tests.

## M2 — Report Lifecycle

Implement durable:

- report record;
- upload status;
- processing status;
- report history;
- failure state.

## M3 — Processing Worker

Introduce asynchronous processing.

Start with deterministic/native parsing where practical before adding expensive AI/OCR paths indiscriminately.

## M4 — Launch Biomarker Registry

Approve a bounded set of biomarkers/units required for initial supported report types.

## M5 — Structured Extraction

Implement:

- candidate extraction;
- provenance;
- confidence/review state;
- canonical mapping;
- deterministic unit conversion.

## M6 — Longitudinal Comparison

Implement compatible history/trends.

Do not add clinical interpretation until its rules are approved.

## M7 — User Insights

Add governed report summaries and longitudinal explanations.

Use CAP-010 for AI capabilities where applicable.

## M8 — Practitioner Context

After CAP-003 and trusted API foundations:

- report timeline;
- biomarker trends;
- summaries;
- controlled raw report access if approved.

## Engineering Efficiency

Do not give Codex a single task to build upload + OCR + AI + biomarker registry + Consultant sync.

Each stage should be independently testable and deployable.
