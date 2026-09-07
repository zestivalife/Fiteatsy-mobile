# Fiteatsy v17.38 Mobile Production-Readiness Matrix

Baseline: `822aeba473fea475e212626e81ffd626e7a014b3`

This matrix records the UI → state → service → API → persistence/reload audit. `PRODUCTION_READY` means the implemented scope has truthful loading, success, empty, error and retry behavior where network-backed. A capability that has no approved server contract is not represented with fabricated data.

| Module | Final classification | Integration and reload evidence | v17.38 disposition |
| --- | --- | --- | --- |
| Authentication | PRODUCTION_READY | `SignInScreen`/`SignUpScreen` → `authService` → `/v1/auth/*` → session-scoped storage and `/auth/me` restore | Removed fabricated demographic/clinical answers; authenticated 401 now clears expired sessions; production auth response logging disabled |
| Onboarding | PRODUCTION_READY | Basics → anthropometrics → assessment/preferences → sync/permissions → canonical profile sync and resume gate | Verified canonical profile hydration and incomplete-profile resume; no v17.37 behavior reopened |
| Home / dashboard | PRODUCTION_READY | Health summary, nutrition experience, PSS-10 and medication timeline load from governed services/context | Verified stale-data retention and truthful no-data/error handling |
| Health profile | PRODUCTION_READY | Profile sheet/context → queued platform sync → `/v1/platform/health-profile` → DB/cache hydration | Verified retry queue, canonical ownership, completion and anthropometrics |
| Recovery / PSS-10 | PRODUCTION_READY | Assessment sessions/results → intelligence summary/history → dashboard/trend | Verified PSS-10 canonical scoring/version and partial/empty history behavior |
| Cycle | PRODUCTION_READY | Cycle logs/settings → identity-scoped persistence → prediction service/notifications | Verified create/edit/reload, history, phases and scheduled reminder handling |
| Nutrition / food diary | PRODUCTION_READY | Published-plan and experience services → `/v1/platform/nutrition-*` → immutable published version/events | Verified client only receives published/eligible foods; food governance unchanged |
| Medication | PRODUCTION_READY | Form/calendar → identity-scoped store + notification scheduler → medication snapshot API/DB | Verified arbitrary strength, twice-daily schedules, edit/hydration and adherence history |
| Health reports / documents | PRODUCTION_READY | Picker/camera/PDF → report upload/status/analysis APIs → report history/biomarkers | Verified retry/reanalysis, ownership isolation, summary hydration and deletion governance |
| Trackers / wearables | PRODUCTION_READY | Platform health adapters → ingestion/status APIs → cached last-valid metrics | Verified permission denial, offline/error boundaries and server-first score hydration |
| Goals / progress | PRODUCTION_READY | Canonical wellness goal IDs/profile plus score history/trends | Verified stable-ID hydration and no duplicate goals |
| Consultation / care | PRODUCTION_READY_WITH_EXTERNAL_CHANNEL | Assigned consultant/care case + entitlement gate; booking handoff uses configured WhatsApp/email | No booking-slot API exists; UI truthfully requests a preferred window through the assigned external channel |
| Family care | PRODUCTION_READY | Identity-scoped invite/connection/emergency state and permission model | Verified ownership-scoped reload and permission boundaries |
| Notifications | PRODUCTION_READY | Inbox service → authenticated `/v1/platform/notifications` → notification DB | Removed demo cards; added loading/empty/error/retry and persisted read/unread/dismiss state |
| Search / navigation | PRODUCTION_READY | Typed route catalogue → registered stack routes | Fixed previously inert result rows; verified debug-only route cannot be opened in production |
| Subscriptions / payments | PRODUCTION_READY | Plans/details/checkout → server order → native Razorpay → server signature verification → entitlement refresh | Removed reachable Phase-2 placeholder checkout; shared one verified checkout implementation; added error/retry states |
| Settings / privacy | PRODUCTION_READY | Profile permissions/theme/security/logout → scoped storage and auth revocation | Verified logout cleanup, consent controls and development-only diagnostics |
| Community leaderboard | EXTERNAL_DEPENDENCY | No leaderboard, consent or ranking API exists | Removed fabricated names/scores; truthful unavailable state remains until an approved service exists |

## API contract audit

All mobile `/v1` service paths were reconciled with registered backend routers. The v17.38 notification mutation is additive (`PATCH /v1/platform/notifications/:notificationId`) and enforces authenticated client ownership. Migration `0066_mobile_notification_state_v17_38.sql` adds nullable state fields and a partial inbox index without rewriting historical rows.

## Production placeholder review

The source scan covered `mock`, `dummy`, `sample`, `placeholder`, `fake`, `hardcoded`, `TODO`, `FIXME`, `TEMP`, `demo`, `stub`, `not implemented`, and `coming soon`. Input placeholders, clinical empty-state copy, deterministic visual particles, questionnaire options and test fixtures were retained where they are not production data. The unused `src/data/mock.ts` device/wellness fixture, notification demo cards, fabricated leaderboard, fabricated signup answers, and Phase-2 checkout path were removed or replaced.

## External release dependencies

- Google Play/App Store publication requires the configured EAS/store account and human release authority.
- A real community leaderboard requires an approved scoring, consent and privacy contract plus backend service.
- Native appointment inventory requires an approved scheduling provider/API; current booking is an explicit external-channel request, not a confirmed appointment.
