# Fiteatsy — Observability & Logging

## Minimum Runtime Observability

Production/staging should support:

- structured application logs;
- request/correlation IDs;
- deployment/commit identity;
- error visibility;
- database connectivity failures;
- job failures when workers exist.

## Health Data Logging

Do not log full sensitive health payloads by default.

## Report Logging

Do not log:

- report contents;
- signed URLs;
- extracted full report text;
- provider secrets.

## Metrics

Useful future metrics may include:

- request rate/error rate/latency;
- DB connection saturation;
- health sync failures;
- report-processing queue depth;
- event-delivery failures;
- authentication failures.

## Alerting

Alerting should focus on actionable runtime failure.

Do not create noisy alerts for every expected client/network error.

## Audit vs Logs

Security/health-data audit records and operational logs are different systems/concepts.
