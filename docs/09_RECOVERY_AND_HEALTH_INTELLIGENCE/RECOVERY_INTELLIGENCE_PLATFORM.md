# Fiteatsy — Recovery Intelligence Platform

## Objective

Help users and authorised Practitioners understand whether tracked health indicators are improving, stable, deteriorating, or currently too incomplete to assess.

## Conceptual Pipeline

```text
Wearable / Health App Data
          +
Medical Reports / Biomarkers
          +
Approved User Context
          +
Medication / Intervention Context [where approved]
          |
          v
Data Quality & Freshness Gate
          |
          v
Baseline / Trend Engine
          |
          v
Versioned Methodology
          |
          v
Progress / Recovery Indicators
          |
     +----+----------------+
     |                     |
     v                     v
User Experience      Practitioner Context
          |
          v
Optional AI Explanation
```

## Intelligence Layers

Keep these layers separate:

1. source observations;
2. normalised observations;
3. aggregates/trends;
4. deterministic or governed calculations;
5. interpretation categories;
6. AI-generated explanation.

## No Single Universal Truth

Different health goals and conditions may require different approved indicator sets.

Do not assume one universal score can accurately represent every disease, recovery pathway or user.
