# API Tests

## Purpose

Summarize backend API coverage added in QA Sprint 1.

## Covered Route Families

- `/health`
- `/v1/auth/*`
- `/v1/checkins`
- `/v1/employer/*`
- `/v1/intelligence/*`
- `/v1/nudges/*`
- `/v1/platform/*`
- `/v1/reports/*`
- `/v1/wearables/*`

## Status Coverage

Implemented and automated:

- 200
- 201
- 204
- 400
- 401
- 404
- 413
- 415
- 429
- 501

Tracked but intentionally skipped pending platform changes:

- 401 coverage for routes without auth middleware
- 403 coverage for routes without role-based authorization middleware

## Notes

- API tests use the real Express app with ephemeral local ports.
- Report analysis success is validated using a generated minimal PDF fixture.
- Auth and ownership gaps are exposed as skipped tests rather than hidden assumptions.
