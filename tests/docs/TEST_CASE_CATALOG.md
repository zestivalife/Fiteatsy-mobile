# Master Test Case Catalog

## Purpose

This is the QA Sprint 1 master catalog for automated and planned backend foundation testing.

## Catalog

| Test ID | Module | Description | Preconditions | Steps | Expected Result | Priority | Automation Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QA-API-001 | System | Verify backend health endpoint | Server running | GET `/health` | `200` and service payload returned | P0 | Automated |
| QA-API-002 | Auth | Request OTP with valid payload | Clean auth store | POST valid signup payload | `201` with challenge and debug OTP | P0 | Automated |
| QA-API-003 | Auth | Reject invalid signup payload | None | POST malformed signup payload | `400 INVALID_INPUT` | P0 | Automated |
| QA-API-004 | Auth | Resend OTP for known challenge | Valid challenge exists | POST resend payload | `200` or cooldown `429` | P1 | Automated |
| QA-API-005 | Auth | Verify OTP happy path | Valid challenge exists | POST correct challenge ID and OTP | `200` with session token | P0 | Automated |
| QA-API-006 | Auth | Verify OTP invalid path | Valid challenge exists | POST wrong OTP | `401 OTP_INVALID` or limit handling | P1 | Automated |
| QA-API-007 | Checkins | Accept client check-in | None | POST to `/v1/checkins` | `201` accepted response | P1 | Automated |
| QA-API-008 | Employer | Return aggregated dashboard | None | GET `/v1/employer/dashboard` | `200` aggregated metrics only | P2 | Automated |
| QA-API-009 | Intelligence | Generate single priority | Valid payload | POST `/v1/intelligence/priority` | `200` with priority and risk | P0 | Automated |
| QA-API-010 | Intelligence | Reject invalid priority payload | None | POST invalid body | `400` | P0 | Automated |
| QA-API-011 | Intelligence | Generate tracker analysis | Valid metric array | POST `/tracker-analysis` | `200` with trend payload | P1 | Automated |
| QA-API-012 | Intelligence | Generate tracker improvement suggestions | Valid improvement payload | POST `/tracker-improvement` | `200` with suggestions | P1 | Automated |
| QA-API-013 | Intelligence | Generate report summary fallback | Valid report parameters | POST `/reports/summary` | `200` with summary text | P1 | Automated |
| QA-API-014 | Intelligence | Generate parameter insight | Valid parameter payload | POST `/reports/parameter-insight` | `200` | P1 | Automated |
| QA-API-015 | Intelligence | Generate report action plan | Valid abnormal parameter payload | POST `/reports/action-plan` | `200` with action array | P1 | Automated |
| QA-API-016 | Intelligence | Generate cross insights | Valid report and check-in payload | POST `/reports/cross-insights` | `200` with insight array | P1 | Automated |
| QA-API-017 | Intelligence | Generate report chat response | Valid chat payload | POST `/reports/chat` | `200` response text | P1 | Automated |
| QA-API-018 | Nudges | Allow nudge in valid window | Valid time | POST `/dispatch-check` | `200` with boolean | P2 | Automated |
| QA-API-019 | Nudges | Block nudge in meeting or over limit | Meeting or 3 nudges sent | POST `/dispatch-check` | `200` with `allowed=false` | P2 | Automated |
| QA-API-020 | Platform | Reject missing health profile fetch | No profile for user | GET `/health-profile` | `404 HEALTH_PROFILE_NOT_FOUND` | P0 | Automated |
| QA-API-021 | Platform | Upsert health profile and fetch bundle | Valid profile payload | PATCH then GET profile bundle | `200` with profile, nutrition, care case | P0 | Automated |
| QA-API-022 | Platform | Reject invalid health profile patch | None | PATCH invalid numeric values | `400 INVALID_INPUT` | P0 | Automated |
| QA-API-023 | Platform | Return completion metrics | Existing profile | GET `/health-profile/completion` | `200` derived completion metrics | P1 | Automated |
| QA-API-024 | Platform | Request missing information | Existing profile | POST `/request-missing-information` | `201` ticket and notification flow | P1 | Automated |
| QA-API-025 | Platform | Fetch active care case | Existing profile | GET `/care-cases/current` | `200` care case payload | P0 | Automated |
| QA-API-026 | Platform | Assign consultant | Existing care case | POST assign payload | `200` updated assignment | P0 | Automated |
| QA-API-027 | Platform | Reject assignment for unknown care case | Unknown care case | POST assign payload | `404 CARE_CASE_NOT_FOUND` | P1 | Automated |
| QA-API-028 | Platform | Fetch timeline, events, tickets, notifications | Existing care case activity | GET collection endpoints | `200` with arrays | P1 | Automated |
| QA-API-029 | Reports | Return supported upload formats | None | GET `/supported-formats` | `200` formats payload | P1 | Automated |
| QA-API-030 | Reports | Initialize upload session | Valid metadata | POST `/upload/init` | `201` upload session | P0 | Automated |
| QA-API-031 | Reports | Reject bad upload metadata | None | POST invalid metadata | `400` | P0 | Automated |
| QA-API-032 | Reports | Reject unsupported report type | None | POST txt metadata | `415` | P1 | Automated |
| QA-API-033 | Reports | Reject oversized upload | None | POST >12MB file size metadata | `413` | P1 | Automated |
| QA-API-034 | Reports | Complete valid upload session | Known upload ID | POST `/upload/complete` | `200` completed session | P1 | Automated |
| QA-API-035 | Reports | Reject unknown upload session | None | POST bad upload ID | `404` | P1 | Automated |
| QA-API-036 | Reports | Analyze report with generated PDF | Valid multipart PDF | POST `/analyze` | `200` analyzed report payload | P0 | Automated |
| QA-API-037 | Reports | Reject analyze without file | None | POST empty multipart form | `400 MISSING_FILE` | P0 | Automated |
| QA-API-038 | Reports | List reports | Report exists for user | GET `/v1/reports` | `200` paginated list | P1 | Automated |
| QA-API-039 | Reports | Fetch report detail/status | Report exists | GET detail and status routes | `200` | P1 | Automated |
| QA-API-040 | Reports | Update report metadata | Report exists | PATCH metadata | `200` updated report | P1 | Automated |
| QA-API-041 | Reports | Create feedback note | Report exists | POST feedback | `201` | P1 | Automated |
| QA-API-042 | Reports | Delete report | Report exists | DELETE report | `204` | P1 | Automated |
| QA-API-043 | Reports | Reject missing report lookup | No such report | GET unknown ID | `404` | P1 | Automated |
| QA-API-044 | Reports | Compare two analyzed reports | Two reports analyzed | GET comparison with previous ID | `200` comparison payload | P1 | Automated |
| QA-API-045 | Reports | Reject comparison without previous report ID | Current report exists | GET comparison without query | `400` | P1 | Automated |
| QA-API-046 | Reports | Reject comparison with unknown previous report | Current report exists | GET bad previousReportId | `404` | P1 | Automated |
| QA-API-047 | Reports | Reanalyze not available yet | Report exists | POST `/reanalyze` | `501` | P2 | Automated |
| QA-API-048 | Wearables | Return supported health apps | None | GET `/health-apps` | `200` apps array | P1 | Automated |
| QA-API-049 | Wearables | Connect health app | Valid app and user | POST `/connect-app` | `200` connection payload | P1 | Automated |
| QA-API-050 | Wearables | Reject invalid connect payload | None | POST bad connect payload | `400` | P1 | Automated |
| QA-API-051 | Wearables | Return user connections | Connected app exists | GET `/connections/:userId` | `200` with connection list | P2 | Automated |
| QA-API-052 | Wearables | Ingest records | Connected or auto-connected app | POST `/records/ingest` | `200` ingest counts | P1 | Automated |
| QA-API-053 | Wearables | Reject invalid ingest payload | None | POST empty records | `400` | P1 | Automated |
| QA-API-054 | Wearables | Build live sync payload | Connected app exists | POST `/sync/live` | `200` sync payload | P1 | Automated |
| QA-API-055 | Wearables | Reject live sync without connection | No connection | POST `/sync/live` | `404` | P1 | Automated |
| QA-API-056 | Wearables | Legacy sync endpoint | Valid device payload | POST `/sync` | `200` mock sync payload | P2 | Automated |
| QA-BE-001 | Calculations | Compute age from DOB | Fixed DOB | Call age calculator | Age or `null` returned correctly | P0 | Automated |
| QA-BE-002 | Calculations | Compute BMI and waist-height ratio | Valid numeric inputs | Call calculator functions | Rounded metrics returned | P0 | Automated |
| QA-BE-003 | Validation Engine | Compute completion and readiness | Full profile and reports | Call completion calculator | AI readiness gate derived correctly | P0 | Automated |
| QA-BE-004 | Validation Engine | Surface missing profile fields | Incomplete profile | Call completion calculator | Missing field list populated | P0 | Automated |
| QA-BE-005 | Repository Layer | Upsert health profile versioning | Empty store | Create and update profile | Same ID, version increments | P0 | Automated |
| QA-BE-006 | Repository Layer | Create/update care case | Existing profile | Create case then patch stage | Version increments, values persist | P0 | Automated |
| QA-BE-007 | Repository Layer | Persist timeline and notifications | Existing care case | Add records to store | Lists return expected items | P1 | Automated |
| QA-BE-008 | Service Layer | Upsert health profile bundle | None | Call `upsertHealthProfile` | Bundle returned with derived state | P0 | Automated |
| QA-BE-009 | Service Layer | Request missing information | Existing bundle | Call service method | Ticket and notification side effects created | P1 | Automated |
| QA-BE-010 | Service Layer | Sync report pipeline | Existing user and report | Emit analysis-completed stage | Timeline and stage recalculation occur | P1 | Automated |
| QA-BE-011 | Service Layer | Assign consultant | Existing care case | Call assign service | Consultant and mentor stored | P0 | Automated |
| QA-BE-012 | Care Case State Machine | Validate stage transitions | Known stages | Call transition validator | Valid short hops pass, regressions fail | P0 | Automated |
| QA-BE-013 | Care Case State Machine | Transition side effects | Existing care case | Execute stage transition | Timeline, event, notification created | P0 | Automated |
| QA-BE-014 | Care Case State Machine | Create operational ticket | Existing care case | Create ticket | Open ticket and timeline persisted | P1 | Automated |
| QA-DB-001 | Database | Assert platform tables exist | Schema file present | Inspect schema SQL | Required tables defined | P0 | Automated |
| QA-DB-002 | Database | Assert foreign key relationships exist | Schema file present | Inspect schema SQL | References present | P0 | Automated |
| QA-DB-003 | Database | Assert soft delete and versioning fields | Schema file present | Inspect schema SQL | `status`, `version`, `deleted_at` present | P0 | Automated |
| QA-DB-004 | Database | Execute runtime CRUD against PostgreSQL | Live test DB required | Insert/update/delete records | CRUD succeeds | P0 | Planned |
| QA-DB-005 | Database | Execute rollback validation | Live test DB required | Start transaction and rollback | No residual writes | P0 | Planned |
| QA-SEC-001 | Authorization | Require auth on protected endpoints | Auth middleware available | Call protected route without auth | `401` | P0 | Skipped |
| QA-SEC-002 | Authorization | Enforce role-based access | RBAC middleware available | Call route with wrong role | `403` | P0 | Skipped |
