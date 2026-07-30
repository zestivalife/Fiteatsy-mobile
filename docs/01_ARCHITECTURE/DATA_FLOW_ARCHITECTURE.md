# Fiteatsy — Data Flow Architecture

**Status:** TARGET DATA FLOWS

## 1. Wearable / Health Metric Flow

```text
Health App / Wearable
        |
        v
OS Health Store or Provider API
        |
        v
Fiteatsy Ingestion
        |
        v
Validation + Normalisation
        |
        v
Longitudinal Health Data
        |
        +----------------------+
        |                      |
        v                      v
Recovery/Trend Engine     Consultant Health Context
        |
        v
User Daily Progress
```

## 2. Medical Report Flow

```text
User uploads report
        |
        v
Authenticated Upload API
        |
        +----------------------+
        |                      |
        v                      v
Private Object Storage    Report Metadata
                               |
                               v
                        Processing Pipeline
                               |
                               v
                      Biomarker Extraction
                               |
                               v
                    Normalisation / Validation
                               |
                  +------------+------------+
                  |                         |
                  v                         v
           Biomarker History        Report Summary
                  |                         |
                  +------------+------------+
                               |
                               v
                    Longitudinal Comparison
                               |
                    +----------+----------+
                    |                     |
                    v                     v
               User Insight       Practitioner Context
```

Extraction is not equivalent to clinical interpretation. Confidence, validation and provenance must be preserved where relevant.

## 3. Medication Reminder Flow

```text
User Medication Record
        |
        v
Medication Schedule
        |
        v
Reminder Scheduler
        |
        v
Mobile Notification
```

Medication tracking/reminders do not imply prescribing authority.

## 4. Recovery / Improvement Flow

```text
Wearable Metrics
      +
Biomarker Trends
      +
Health/Profile Context
      +
Approved Intervention/Adherence Context
      |
      v
Validated Feature Layer
      |
      v
Deterministic Rules / Scoring Methodology
      |
      v
Recovery / Improvement Indicator
      |
      +------------------+
      |                  |
      v                  v
User Experience     Practitioner Dashboard
      |
      v
Optional AI Explanation
```

The scoring methodology must be governed and testable.

## 5. Practitioner Intervention Flow

```text
Fiteatsy Health Context
          |
          v
Consultant / Practitioner Workspace
          |
          v
Practitioner Assessment
          |
          v
Nutrition / Recovery Intervention
          |
          v
Governed Plan Contract
          |
          v
Fiteatsy User Experience
          |
          v
Ongoing Health/Adherence Signals
          |
          +------ feedback loop ------> Practitioner
```

CAP-003 controls practitioner access. CAP-005 ownership must be respected for platform nutrition authority where adopted.

## 6. Cross-System Data Rule

Every cross-system flow must identify:

- source authority;
- destination;
- purpose;
- minimum fields;
- identity key;
- authorization;
- freshness;
- version/order semantics;
- retry/idempotency;
- retention;
- audit requirement.

No flow should exist merely because two systems can technically connect.
