# Fiteatsy — Product Boundaries

**Status:** ACTIVE

## 1. Fiteatsy Owns

Subject to implementation maturity, Fiteatsy is the product authority for:

- Fiteatsy product account/client context;
- Fiteatsy health profile;
- device/wearable ingestion;
- Fiteatsy longitudinal health observations;
- Fiteatsy medical report records;
- Fiteatsy biomarker history derived through governed processing;
- medication/reminder product functionality;
- Fiteatsy recovery/progress indicators;
- Fiteatsy user experience;
- Fiteatsy-specific integration state.

## 2. Fiteatsy Does Not Own

### CAP-001
Platform Person identity/IAM correlation.

### CAP-003
Practitioner Assignment and practitioner-client authorization.

### CAP-004
Shared platform Assessment authority where adopted.

### CAP-005
Shared platform Nutrition authority where adopted.

### CAP-010
Platform AI governance/capabilities.

The existence of a local implementation does not automatically transfer platform capability ownership.

## 3. Consultant Boundary

The Consultant system:

- receives governed Fiteatsy client projections;
- may retrieve authorised health context;
- provides practitioner workflows;
- uses CAP-003 to determine access;
- must not directly query/write Fiteatsy PostgreSQL;
- must not become the source of truth for Fiteatsy health observations.

## 4. Clinical Boundary

Fiteatsy may support:

- tracking;
- longitudinal comparison;
- health-management workflows;
- recovery/improvement monitoring;
- practitioner review;
- reminders;
- governed health insights.

Fiteatsy must not automatically claim:

- diagnosis;
- cure;
- guaranteed recovery;
- medication prescribing;
- emergency monitoring;
- replacement of a qualified healthcare professional.

## 5. Data Boundary

Not all Fiteatsy data should be replicated to Consultant.

Cross-system data transfer requires a defined purpose and authorization.

Detailed health records may remain Fiteatsy-owned and be queried through trusted APIs when appropriate.

## 6. AI Boundary

AI output must be distinguishable from:

- source health observations;
- laboratory values;
- deterministic calculations;
- practitioner decisions.

AI must not silently modify authoritative health data.

## 7. Subscription Boundary

Subscription/payment remains a future product workstream until its business model, lifecycle and payment authority are approved.

Subscription status must not grant Practitioner access.

## 8. Fitness vs Health-Management Boundary

Fiteatsy contains both lower-risk fitness/wellness functionality and higher-sensitivity health-management functionality.

Features involving medical reports, biomarkers, medication context, condition tracking, practitioner intervention and health conclusions require stronger privacy, security, audit and validation controls than ordinary fitness metrics.
