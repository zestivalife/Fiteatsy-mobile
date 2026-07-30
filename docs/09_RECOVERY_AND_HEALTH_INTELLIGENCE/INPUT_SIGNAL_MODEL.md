# Fiteatsy — Recovery Input Signal Model

## Signal Categories

### Wearable / Health-App Signals

Examples may include:

- steps;
- sleep duration;
- resting heart rate;
- HRV;
- SpO2;
- activity/workout data;
- other approved canonical metrics.

### Medical Report Signals

Examples:

- approved biomarkers;
- biomarker direction over time;
- report freshness;
- validated/normalised values.

### User Context

Potential inputs:

- profile context;
- user-reported check-ins;
- approved goals;
- programme context.

### Medication / Intervention Context

May be used only when product methodology explicitly defines its role.

A user tapping "Taken" is not proof of pharmacological effect.

## Eligibility

Every methodology should define which signals are:

- required;
- optional;
- excluded;
- stale;
- insufficient.

## Provenance

Derived intelligence must preserve references to the input observation versions or periods used.

## Guard

Do not feed every stored field into an AI model and call the output a recovery score.
