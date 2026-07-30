# Fiteatsy — Test & Regression Governance

## Test Layers

### Static
- TypeScript;
- lint where configured;
- schema/config validation.

### Unit
Domain and deterministic logic.

### Repository / Database
Persistence, migrations, constraints, versioning.

### API
Authentication, authorization, validation, status contracts.

### Integration
Database, storage, workers, external adapters.

### Mobile
Service/state integration and critical user flows.

### End-to-End
Only for high-value cross-layer flows.

## Negative Tests

Health systems require explicit negative coverage.

Examples:
- wrong user;
- missing token;
- revoked token;
- unassigned Practitioner;
- duplicate sync;
- stale update;
- malformed report;
- missing health permission.

## Regression Protection

Protected capabilities include:

- authentication;
- session restoration;
- Fiteatsy Client identity;
- database migrations;
- health sync;
- report ownership;
- Consultant authorization.

## Failure

Do not delete or weaken tests simply to obtain a green build.
