# Fiteatsy — Health Data Privacy

## Data Classes

Fiteatsy processes sensitive health-related information including:

- wearable/health-app observations;
- medical reports;
- biomarkers;
- medication context;
- user-entered health information;
- derived progress/recovery results.

## Data Minimisation

Collect and retain only information needed for approved product capabilities.

## Source Access

Health-platform permissions should be requested granularly where supported.

Do not request every available health permission merely because an API exposes it.

## Provenance

Maintain source information so users/Practitioners can distinguish device, user-entered, laboratory and derived data.

## Logs / Analytics

Sensitive health payloads should not be copied indiscriminately into:

- application logs;
- analytics platforms;
- crash reports;
- marketing systems.

## Secondary Use

Using health data for unrelated analytics, advertising, model training or other secondary purposes requires explicit approved policy and must not be inferred from ordinary app use.
