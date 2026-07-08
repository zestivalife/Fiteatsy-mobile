# 05 API Contract

## Purpose

Document the platform-facing HTTP contract used by mobile, dashboard, and future integrations.

## Scope

Includes existing module families and the new `/v1/platform` contract.

Related documents:

- [02 Platform Architecture](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/02_PLATFORM_ARCHITECTURE.md)
- [06 Event Catalog](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/06_EVENT_CATALOG.md)
- [11 Security](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/11_SECURITY.md)

## API Conventions

- Base path: `/v1`
- JSON request and response bodies
- Local development user resolution currently supports `x-user-id`, body `userId`, or query `userId`
- Production target should use authenticated identity claims

## Authentication Endpoints

Current family:

- `/v1/auth/*`

Purpose:

- session creation and identity bootstrap for app and staff surfaces

Implementation note:

- exact route inventory should be expanded into OpenAPI during the next contract pass

## Health Profile

### GET `/v1/platform/health-profile`

Purpose:

- fetch canonical health profile, derived nutrition profile, and current care-case bundle

Authentication:

- client or authorized staff for the same user

Response:

```json
{
  "profile": {},
  "nutrition": {},
  "careCase": {}
}
```

Errors:

- `404 HEALTH_PROFILE_NOT_FOUND`

### PATCH `/v1/platform/health-profile`

Purpose:

- upsert health profile fields and trigger derived recalculation

Validation:

- positive numeric checks for body measurements
- arrays for food and medical lists
- ISO datetime for `dateOfBirthISO`

Request example:

```json
{
  "dateOfBirthISO": "1983-05-14T00:00:00.000Z",
  "gender": "Male",
  "heightCm": 170,
  "currentWeightKg": 78,
  "wellnessGoals": ["Better Energy", "Sugar Control"]
}
```

Response:

- updated profile bundle including recalculated completion/readiness

Errors:

- `400 INVALID_INPUT`

### GET `/v1/platform/health-profile/completion`

Purpose:

- return derived completion/readiness metrics without full profile payload

Response:

```json
{
  "completionPercent": 68,
  "readinessScore": 74,
  "aiReady": false,
  "missingFields": ["blood_reports"],
  "sectionScores": []
}
```

### POST `/v1/platform/health-profile/request-missing-information`

Purpose:

- create an explicit missing-information follow-up request

Request:

```json
{
  "requestedBy": "consultant-123",
  "fields": ["waistCm", "blood_reports"]
}
```

Response:

- created ticket and timeline side effects

Errors:

- `400 INVALID_INPUT`
- `404 HEALTH_PROFILE_NOT_FOUND`

## Care Cases

### GET `/v1/platform/care-cases/current`

Purpose:

- fetch the active care case for a user

Errors:

- `404 CARE_CASE_NOT_FOUND`

### POST `/v1/platform/care-cases/:careCaseId/assign-consultant`

Purpose:

- assign or reassign a consultant and optional mentor

Request:

```json
{
  "consultantId": "consultant-42",
  "mentorId": "mentor-9"
}
```

Response:

- updated care case

Errors:

- `400 INVALID_INPUT`
- `404 CARE_CASE_NOT_FOUND`

### GET `/v1/platform/care-cases/:careCaseId/timeline`

Purpose:

- list human-readable timeline items

Response:

```json
{
  "items": []
}
```

### GET `/v1/platform/care-cases/:careCaseId/events`

Purpose:

- list replayable health events

### GET `/v1/platform/care-cases/:careCaseId/tickets`

Purpose:

- list open and historical tickets for the case

## Notifications

### GET `/v1/platform/notifications`

Purpose:

- retrieve notifications for a user across channels and case contexts

## Reports

Current family:

- `/v1/reports/*`
- known implemented analyze endpoint: `POST /v1/reports/analyze`

Expected responsibilities:

- upload initialization
- OCR processing
- biomarker extraction
- AI validation
- platform synchronization

Implementation note:

- report routes must emit milestone events consumed by the platform core

## Intelligence

Current families:

- `/v1/intelligence/*`
- `/v1/checkins`
- `/v1/nudges/*`
- `/v1/wearables/*`
- `/v1/employer/*`

These remain part of the broader product API surface and should progressively converge on care-case-aware contexts where appropriate.

## Future Endpoints Required

- nutrition profile detail endpoint
- diet plan versions and publish actions
- communications / chat / note endpoints
- biomarker trend and comparison endpoints
- admin intelligence endpoints with range filters and client-plan summaries

## Error Contract

Recommended envelope:

```json
{
  "error": "INVALID_INPUT",
  "message": "Optional human-readable detail",
  "details": {}
}
```

## Responsibilities

- Routes validate shape and auth context
- Services own business rules and side effects
- Repositories own persistence

## Future Expansion Notes

- Publish OpenAPI and JSON schema versions once route inventory stabilizes
- Add idempotency keys for uploads, assignment, and publish actions

## Implementation Considerations

- Do not push client-side calculated age or readiness as authoritative values
- Preserve backward compatibility for transition fields until all clients are migrated
