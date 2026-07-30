# Fiteatsy — Report Processing Pipeline

**Status:** TARGET

## Pipeline

```text
STORED REPORT
     |
     v
Processing Job
     |
     v
Document Preparation
     |
     v
Text / Structure Extraction
     |
     v
Candidate Test / Biomarker Extraction
     |
     v
Normalisation
     |
     v
Validation / Confidence
     |
     +------> NEEDS_REVIEW [where required]
     |
     v
COMPLETED
```

## Processing Stages

Conceptual statuses may include:

- UPLOADED;
- STORED;
- QUEUED;
- PROCESSING;
- COMPLETED;
- PARTIALLY_PROCESSED;
- NEEDS_REVIEW;
- FAILED.

Exact state machine requires implementation approval.

## Extraction

The system may eventually combine:

- native PDF text extraction;
- document parsing;
- OCR where needed;
- table extraction;
- deterministic parsing;
- approved document AI;
- governed LLM assistance.

No technology is assumed to be reliable for every report format.

## Structured Output

Processing should preserve:

- source text/value;
- page/location where feasible;
- extracted test name;
- extracted value;
- extracted unit;
- reference range;
- report/test date;
- confidence/validation state;
- processor/model/parser version.

## Human Review

Low-confidence or ambiguous extraction must be representable.

The system should prefer "needs review" over confidently storing a fabricated value.
