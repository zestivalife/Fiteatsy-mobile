# Fiteatsy — Health Management Model

**Status:** TARGET PRODUCT MODEL

## 1. Purpose

Fiteatsy treats health management as a longitudinal process rather than a single assessment.

## 2. Health Context

The platform may combine governed information from:

### Device / Wearable Signals
Activity, sleep, heart-rate-related signals and other approved observations.

### Medical Reports
Laboratory and health-check reports uploaded by the user.

### Biomarkers
Structured values derived from reports or approved sources.

### User Context
Approved health/profile information and relevant user-entered context.

### Medication Context
User-maintained medication/reminder information.

### Intervention Context
Practitioner-guided nutrition/recovery plan and relevant adherence/progress information.

## 3. Longitudinal Model

```text
Baseline
   |
   v
Observation Period
   |
   +-- Wearable/health signals
   +-- Medical reports
   +-- Biomarkers
   +-- User context
   |
   v
Trend / Change Detection
   |
   v
Practitioner Review
   |
   v
Intervention
   |
   v
New Observation Period
   |
   v
Compare With Baseline / Previous Period
   |
   v
Continue / Modify / Escalate Review
```

## 4. Daily Improvement Matrix

The Daily Improvement Matrix is a TARGET capability.

It should not be a vague AI-generated wellness score.

Before implementation, its methodology must define:

- input dimensions;
- minimum data requirements;
- weighting;
- baseline;
- missing-data handling;
- source freshness;
- normalisation;
- scoring range;
- interpretation;
- when no score should be produced;
- validation/testing;
- user-facing explanation.

## 5. Report Comparison

Report comparison should preserve:

- test/biomarker identity;
- value;
- unit;
- reference range where available;
- collection/report date;
- source report;
- extraction provenance;
- historical values;
- change magnitude/direction.

A change is not automatically an improvement. Interpretation depends on the biomarker and context.

## 6. Practitioner Intervention

The practitioner may use Fiteatsy context to support an intervention decision.

The system must distinguish:

- observed health data;
- calculated trends;
- automated insights;
- practitioner judgement;
- practitioner-authored intervention.

## 7. Escalation

Fiteatsy is not an emergency-monitoring system.

If future product logic identifies potentially concerning values, escalation behaviour must be explicitly designed and clinically governed rather than improvised by AI or generic notifications.
