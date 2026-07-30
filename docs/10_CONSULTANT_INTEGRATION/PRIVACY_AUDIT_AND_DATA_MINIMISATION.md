# Fiteatsy — Consultant Integration Privacy, Audit & Minimisation

## Principle

Cross-system availability does not imply unrestricted professional access.

## Minimum Necessary Data

The Consultant projection should contain only data needed for:

- client discovery/work queue;
- product/lifecycle context;
- assignment workflows;
- freshness indicators.

Sensitive health details can be queried after authorization.

## Audit Candidates

Potentially auditable actions include:

- Practitioner opens Fiteatsy health context;
- Practitioner views report;
- controlled report download;
- administrative client correlation;
- assignment lifecycle;
- integration repair/reconciliation.

## Logs

Do not indiscriminately log full health payloads or report contents during integration debugging.

## Environment Separation

Development/staging integrations must not accidentally target production health data.

## Consent / Policy

Exact consent and professional-data-sharing policy requires product/legal approval.

Engineering must not invent consent claims.
