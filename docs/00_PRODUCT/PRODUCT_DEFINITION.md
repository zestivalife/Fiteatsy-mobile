# Fiteatsy — Product Definition

**Status:** APPROVED PRODUCT DIRECTION

## 1. Product Definition

Fiteatsy is a personal health, fitness, condition-management and recovery-support platform designed to help people build a continuous, measurable view of their health over time.

The product combines health and wearable signals, medical reports, biomarkers, medication reminders, health trends and practitioner-guided interventions into one longitudinal experience.

Fiteatsy is not intended to be merely a step counter, wearable dashboard or static diet application.

Its primary purpose is to help a user:

1. collect relevant health information;
2. understand changes over time;
3. track health conditions and recovery/improvement;
4. follow appropriate interventions;
5. measure whether health indicators are improving, stable or deteriorating;
6. share authorised health context with a qualified practitioner;
7. support ongoing practitioner-led adjustment of nutrition/recovery interventions.

## 2. Product Vision

Create a continuous health-management platform in which fragmented personal health data becomes understandable, longitudinal and actionable for both the individual and their authorised practitioner.

## 3. Core Product Loop

```text
COLLECT
Health apps / wearables / reports / user inputs
        |
        v
UNDERSTAND
Normalisation / biomarkers / trends / context
        |
        v
TRACK
Longitudinal health and condition progress
        |
        v
INTERVENE
Practitioner-guided nutrition / recovery actions
        |
        v
MEASURE
Wearable + biomarker + adherence/progress signals
        |
        v
IMPROVE
Adjust intervention based on evidence
        |
        +------------------> repeat
```

## 4. Core Product Areas

### Health & Wearable Data

Fiteatsy should collect supported user-authorised health data from sources available on the user's device and approved cloud integrations.

Examples may include:

- activity;
- steps;
- sleep;
- heart rate;
- resting heart rate;
- HRV;
- SpO2;
- energy expenditure;
- workouts;
- weight/body measurements;
- other approved health observations.

Availability varies by device/provider.

### Longitudinal Health Record

Fiteatsy should preserve historical observations so health is understood as a timeline rather than isolated daily values.

### Medical Reports

Users should be able to upload health-check and laboratory reports.

Fiteatsy should preserve report history and structured information derived from those reports.

### Biomarkers

Where technically and clinically appropriate, report processing should extract and normalise biomarkers so users and practitioners can compare values over time.

### Medication Management

Users should be able to maintain medicine/reminder information and receive reminders.

Medication management does not imply prescribing authority.

### Health Progress / Recovery Intelligence

Fiteatsy should combine governed inputs to show meaningful trends and improvement/recovery indicators.

The methodology must be explainable and testable.

### Practitioner Monitoring

Authorised practitioners should be able to monitor relevant Fiteatsy client context through the Consultant system.

This includes governed access to selected health metrics, trends, biomarkers, report insights and progress indicators.

### Practitioner Intervention

Practitioners should be able to use the available health context to create or modify appropriate recovery/improvement nutrition interventions through the governed Zestiva capability model.

## 5. Near-Real-Time Principle

Fiteatsy aims to provide the latest successfully synchronised health context.

Phone/device health sources are not guaranteed continuous clinical telemetry.

User and practitioner interfaces should expose data freshness where relevant.

## 6. Product Outcome

Fiteatsy should help users and practitioners answer:

- What is happening with the user's health?
- How has it changed?
- Which indicators are improving or worsening?
- Is the current intervention associated with measurable progress?
- What information should the practitioner review?
- Does the intervention need to be reconsidered?

## 7. Safety Position

Fiteatsy supports health tracking, health management and recovery/improvement workflows.

It must not claim that the software itself:

- diagnoses disease autonomously;
- cures disease;
- guarantees recovery;
- replaces qualified medical care;
- independently prescribes medication;
- provides emergency monitoring;
- provides guaranteed continuous/live clinical telemetry.
