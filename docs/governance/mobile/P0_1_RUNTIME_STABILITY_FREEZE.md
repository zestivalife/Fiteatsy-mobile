# P0-1 Runtime Stability + Launch/Session Freeze

## Module status

- **Accepted engineering SHA:** `3364db31302c87eb1f24b48d71edbc1f906aecd0`
- **Protected contracts:** 20
- **Module engineering seal:** `PARTIAL_ACTIVE`
- **Module acceptance:** `PHYSICAL_ACCEPTANCE_BLOCKED_BY_TOOLING`
- **Application defect open:** No

The contracts below are `FROZEN_PROTECTED`. This document does not declare the
entire module production accepted: physical CPU-idle and resident-memory
measurements remain external evidence gates.

## Accepted evidence

- CI and simulator: PASS
- Physical cold launch: 5/5 PASS
- Physical hard-close/session restore: 5/5 PASS
- Authenticated offline launch: PASS
- Blank screen, false logout, crash, sync storm: none observed
- Process survival: PASS
- Background/foreground lifecycle: 20 cycles PASS
- Online → offline → online recovery: PASS
- Jetsam and watchdog events: none observed
- Accepted worktree: clean, with local/origin parity

## Frozen contracts

| # | Feature ID | Status | Protected contract |
|---:|---|---|---|
| 1 | `STARTUP_STATE_MACHINE` | `FROZEN_PROTECTED` | Startup transitions remain governed and terminate in visible UI or a visible configuration failure. |
| 2 | `SINGLE_FLIGHT_BOOTSTRAP` | `FROZEN_PROTECTED` | Root bootstrap starts at most once per provider lifecycle. |
| 3 | `LOCAL_FIRST_SESSION_RESTORE` | `FROZEN_PROTECTED` | Persisted authenticated state determines the initial route without waiting for remote feature hydration. |
| 4 | `SPLASH_TO_VISIBLE_UI` | `FROZEN_PROTECTED` | Splash exits to Home, authentication, onboarding, or visible configuration failure; never an unbounded blank state. |
| 5 | `NO_BLANK_SCREEN` | `FROZEN_PROTECTED` | Startup and session restoration never produce an unhandled blank surface. |
| 6 | `ROOT_ERROR_BOUNDARY` | `FROZEN_PROTECTED` | Root render failures are caught by `ProductionErrorBoundary`. |
| 7 | `API_CONFIGURATION_FAIL_VISIBLE` | `FROZEN_PROTECTED` | Invalid production API configuration fails visibly rather than hanging or silently degrading. |
| 8 | `OFFLINE_SESSION_PRESERVATION` | `FROZEN_PROTECTED` | Offline startup does not clear a valid persisted session. |
| 9 | `DNS_FAILURE_NO_FALSE_LOGOUT` | `FROZEN_PROTECTED` | DNS failures do not revoke or clear authentication. |
| 10 | `TIMEOUT_NO_FALSE_LOGOUT` | `FROZEN_PROTECTED` | Request timeouts do not revoke or clear authentication. |
| 11 | `BACKEND_5XX_NO_FALSE_LOGOUT` | `FROZEN_PROTECTED` | Backend 5xx responses do not revoke or clear authentication. |
| 12 | `USER_SWITCH_ISOLATION` | `FROZEN_PROTECTED` | Locally persisted account data remains scoped to the authenticated identity. |
| 13 | `AUTHENTICATED_HARD_CLOSE_RESTORE` | `FROZEN_PROTECTED` | Hard-close/reopen restores an existing authenticated user to Home. |
| 14 | `BACKGROUND_FOREGROUND_LIFECYCLE` | `FROZEN_PROTECTED` | Background/foreground transitions preserve session and do not multiply work. |
| 15 | `NO_DUPLICATE_BOOTSTRAP` | `FROZEN_PROTECTED` | Re-renders and lifecycle transitions do not create parallel bootstrap runs. |
| 16 | `NO_DUPLICATE_OBSERVERS` | `FROZEN_PROTECTED` | Lifecycle and health observers remain single-authority and cleanly registered. |
| 17 | `PROCESS_SURVIVAL` | `FROZEN_PROTECTED` | The physical Release process survives accepted launch, idle, and lifecycle scenarios. |
| 18 | `ONLINE_OFFLINE_ONLINE_RECOVERY` | `FROZEN_PROTECTED` | Network recovery restores API operation without logout or force-close. |
| 19 | `EXACT_SHA_CI_PARITY` | `FROZEN_PROTECTED` | Acceptance evidence must identify and match the exact source SHA. |
| 20 | `CLEAN_RELEASE_WORKTREE_DISCIPLINE` | `FROZEN_PROTECTED` | Release evidence is produced from a clean worktree with local/origin parity. |

## Protected implementation boundaries

Future edits are not globally prohibited. Any edit to the following files or
equivalent symbols is a `FREEZE_IMPACT` and must preserve every frozen contract:

- `App.tsx`: root provider ordering and `ProductionErrorBoundary` composition
- `src/components/ProductionErrorBoundary.tsx`: root render failure containment
- `src/screens/auth/SplashScreen.tsx`: bounded splash exit and route resolution
- `src/services/apiClient.ts`: timeout, connectivity classification, and no-false-logout semantics
- `src/state/AppContext.tsx`: bootstrap single-flight, local session restore, lifecycle/network recovery, identity isolation
- `src/state/startupStateMachine.ts`: governed states, transitions, and visible-route invariant
- `test/runtimeStartupStateMachine.test.ts`: P0-1 contract regression coverage

## Dependencies

- React Native root/provider and navigation lifecycle
- Secure persisted session storage and account-scoped local state
- Network reachability and the canonical API client
- AppState/lifecycle listeners
- Startup configuration validation
- Native Release bundle provenance

## Regression requirements

Any future Health Sync, Reports, Nutrition, Notifications, Network, or lifecycle
change that touches startup, session, AppState, the API client, root providers,
bootstrap, navigation initialization, network recovery, or session persistence
must run:

1. P0-1 focused regression, including `test/runtimeStartupStateMachine.test.ts`
2. Full mobile regression
3. TypeScript
4. Expo configuration validation
5. iOS and Android exports
6. `git diff --check`

An introduced blank screen, startup import crash, duplicate bootstrap/listener,
false logout, lost offline session, hard-close restoration failure, unhandled root
render failure, or network-recovery regression is a `FREEZE_REGRESSION`.

## Open external evidence gates

| Gate | Status | Reason | Required evidence |
|---|---|---|---|
| `CPU_IDLE_PHYSICAL` | `OPEN_EXTERNAL_EVIDENCE_GATE` | Xcode 26.4 / iPhoneOS SDK 26.4 lists the iOS 27.0 beta device offline to xctrace while CoreDevice remains available. | Compatible Xcode/Instruments iOS 27 support, or a physical device running an Xcode 26.4-supported iOS version. |
| `MEMORY_STABILITY_PHYSICAL` | `OPEN_EXTERNAL_EVIDENCE_GATE` | `devicectl` exposes PID/executable but not trustworthy CPU or resident-memory samples; Instruments cannot attach. | Five physical resident-memory samples at 0/30/60/90/120 seconds through compatible Apple tooling. |

Neither open gate is an application defect. They must not be represented as
`PASS` or `FROZEN_PROTECTED` until trustworthy physical measurements exist.

## Change policy

An intentional change to a frozen contract requires Product Owner approval,
impact analysis, updated contract tests, regression and exact-SHA CI, applicable
simulator/physical evidence, and a revision to this manifest and the engineering
seal.
