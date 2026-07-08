# QA Sprint 1 Test Plan

## Purpose

Establish the foundational automated QA coverage for the Fiteatsy healthcare platform without changing product behavior.

## Scope

Included in QA Sprint 1:

- API contract validation for current backend endpoints
- Repository and service-layer unit tests
- Calculation and validation-engine tests
- Care-case state machine tests
- Database schema contract validation
- Reusable seed personas and documentation

Excluded from QA Sprint 1:

- workflow E2E testing
- performance testing
- load testing
- visual regression
- mobile UI automation

## Test Structure

```text
tests/
  api/
  backend/
  database/
  docs/
  fixtures/
  helpers/
```

## Quality Objectives

- Confirm implemented endpoints respond with expected success and error codes
- Detect regressions in care-case lifecycle and readiness scoring
- Create reusable healthcare persona data for future QA sprints
- Make missing authz and live database coverage explicit through skipped tests and documentation

## Execution Command

Run from [`backend/`](/Users/l.paunikar/Desktop/fiteatsy-mobile/backend):

```bash
npm run test:qa
```

## Risks

- Backend currently lacks central auth middleware, so 401 and 403 checks are tracked as intentional skipped coverage.
- Database runtime transaction testing requires a live PostgreSQL test database and is not executable in the current local foundation.

## Exit Criteria

- All automated QA Sprint 1 tests run successfully
- Skipped tests are documented and justified
- Catalog and seed documentation match implemented suites
