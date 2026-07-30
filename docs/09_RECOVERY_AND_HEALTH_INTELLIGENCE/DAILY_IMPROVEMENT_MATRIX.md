# Fiteatsy — Daily Improvement Matrix

**Status:** PRODUCT CONCEPT — methodology not frozen

## Purpose

The Daily Improvement Matrix is the user-facing progress layer that combines approved longitudinal signals into understandable daily/periodic progress context.

## It Is Not

- a diagnosis;
- a guarantee of recovery;
- a replacement for a clinician;
- a simple average of every available metric;
- an LLM-generated number.

## Conceptual Dimensions

Potential dimensions may include, only after methodology approval:

- Activity;
- Sleep / Rhythm;
- Cardiovascular recovery;
- Nutrition/adherence context;
- Biomarker trajectory;
- other condition/programme-specific dimensions.

The final dimension set must be explicitly approved.

## Output Model

A future output may contain:

```text
Date / Period
Methodology Version
Overall Status [if approved]
Dimension Results
Input Coverage
Freshness
Baseline Reference
Trend Direction
Explanation
Insufficient-Data Reasons
```

## Status Before Score

The system should support qualitative states such as:

```text
IMPROVING
STABLE
DECLINING
INSUFFICIENT_DATA
```

Exact terminology is a product decision.

A numeric score should only be introduced if it adds validated product value.

## Guard

Do not display false precision such as `82.4% recovered` unless a methodology genuinely supports that meaning.
