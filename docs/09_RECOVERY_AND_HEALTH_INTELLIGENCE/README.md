# Fiteatsy — 09 Recovery & Health Intelligence

**Document Group:** Recovery, Progress & Health Intelligence
**Status:** Architecture / Methodology Guardrails — scoring methodology not yet approved

## Purpose

Defines how Fiteatsy should transform longitudinal health observations, biomarkers, report history and approved user context into transparent progress and recovery indicators.

This package does NOT approve a clinical diagnosis engine or an arbitrary AI-generated health score.

## Documents

- `RECOVERY_INTELLIGENCE_PLATFORM.md`
- `DAILY_IMPROVEMENT_MATRIX.md`
- `INPUT_SIGNAL_MODEL.md`
- `BASELINE_AND_TREND_MODEL.md`
- `SCORING_METHODOLOGY_GOVERNANCE.md`
- `DATA_COVERAGE_AND_CONFIDENCE.md`
- `EXPLANATION_AND_AI_BOUNDARY.md`
- `INTERVENTION_AND_OUTCOME_TRACKING.md`
- `PRACTITIONER_RECOVERY_CONTEXT.md`
- `SAFETY_AND_CLINICAL_GUARDS.md`
- `IMPLEMENTATION_SEQUENCE.md`

## Core Rule

A recovery/progress result must be traceable to approved inputs, a versioned methodology, data coverage and freshness. AI may explain an approved result; AI must not invent the underlying score.
