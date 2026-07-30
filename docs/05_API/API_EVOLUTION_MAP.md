# Fiteatsy — API Evolution Map

## Current → Target

### Phase 1B

Existing:

- `/v1/auth/*`
- `/v1/platform/*`
- `/v1/reports/*`
- `/v1/wearables/*`
- other existing intelligence/check-in routes.

Focus: persistence/auth/ownership hardening.

### Phase 1C

Introduce explicit Fiteatsy Client contract after product decisions.

Do not invent final client routes before the Client aggregate is approved.

### Health Data Phase

Introduce canonical health ingestion/history contracts.

Legacy wearable endpoints may be adapted or deprecated after compatibility analysis.

### Medical Records Phase

Harden report upload/storage/processing and biomarker contracts.

### Progress Phase

Introduce recovery/progress APIs only after methodology approval.

### Consultant Integration Phase

Introduce trusted service APIs, projection/event contracts and reconciliation.

## Compatibility Rule

Do not rename or remove working APIs solely to make route names look cleaner.

For each replacement:

1. identify current consumers;
2. introduce target contract;
3. migrate consumers;
4. verify;
5. deprecate old contract;
6. remove only after evidence confirms no active dependency.

## Documentation Rule

API documentation must distinguish:

- CURRENT endpoint;
- TARGET endpoint;
- DEPRECATED endpoint;
- PROPOSED endpoint.
