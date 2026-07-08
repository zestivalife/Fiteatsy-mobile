# Phase 1 Platform Foundation

This sprint establishes the shared backend core for Fiteatsy Mobile and the Consultant Dashboard around one cohesive care-case architecture.

## Implemented Core

- Shared `Health Profile -> Nutrition Profile -> Recovery Program -> Care Case` backbone
- Centralized backend calculation engine for:
  - Calculated age
  - BMI
  - Waist-to-height ratio
  - Nutrition profile completion
  - AI readiness score
- Care case lifecycle/state transition engine
- Timeline engine
- Health event engine
- Health ticket engine
- Notification engine
- Report pipeline integration into the care-case core

## New API Surface

Mounted at `/v1/platform`

- `GET /health-profile`
- `PATCH /health-profile`
- `GET /health-profile/completion`
- `POST /health-profile/request-missing-information`
- `GET /care-cases/current`
- `POST /care-cases/:careCaseId/assign-consultant`
- `GET /care-cases/:careCaseId/timeline`
- `GET /care-cases/:careCaseId/events`
- `GET /care-cases/:careCaseId/tickets`
- `GET /notifications`

## Care Case Lifecycle

Implemented stages:

1. `new_client`
2. `health_profile_pending`
3. `blood_report_pending`
4. `ready_for_consultant`
5. `consultant_review`
6. `ai_draft_generated`
7. `diet_published`
8. `active_monitoring`
9. `followup_due`
10. `program_completed`

Every valid transition:

- updates the care case
- writes a timeline event
- writes a replayable health event
- creates notifications

## Report Pipeline Integration

The report module now emits platform events at these milestones:

- upload initialized
- report uploaded
- OCR completed
- biomarkers updated
- AI validation completed

These feed:

- timeline
- health events
- care-case stage recalculation
- in-app notifications

## Database Foundation

`src/db/schema.sql` now includes Phase 1 shared platform tables for:

- health profiles
- recovery programs
- care cases
- nutrition profiles
- timeline events
- health events
- health tickets
- lab reports
- biomarkers
- diet plans
- diet plan versions
- clinical memory
- communications
- notifications
- attachments

Every new table includes status/version/audit/soft-delete fields.

## Current Scope Notes

- This sprint adds the platform boundaries and integration flow in code.
- Persistence for the new platform services currently uses in-memory stores in the backend module layer for fast incremental rollout.
- Existing functionality remains intact.
- Next sprint should replace the in-memory platform stores with PostgreSQL repositories and add automated tests plus OpenAPI documentation.
