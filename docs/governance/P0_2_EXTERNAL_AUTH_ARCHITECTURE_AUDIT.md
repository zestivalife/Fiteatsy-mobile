# P0.2 External Consultant Authentication Architecture Audit

Base application SHA: `2d879832bbaa426a88df8e1a058668a628a14a56`  
Governance base SHA: `1cb9cee1eb6a56ddbb09f6db62ca8a61102f8840`

## Authority decision

P0.2 must not introduce a third identity or tenancy authority.

- The Consultant authentication service remains the credential, password, refresh-token, login-session, account-status, and dashboard-JWT authority.
- The Fiteatsy backend remains the canonical tenant, tenant-membership, tenant-context, and tenant-write authority sealed by P0.1.
- The Consultant frontend is only a client of those authorities and must not persist authoritative signup or tenant state in the browser.
- External signup is a resumable orchestration. Verification and credential creation occur in the Consultant authentication service. Canonical tenant provisioning occurs through a purpose-bound, replay-protected delegated Fiteatsy endpoint.
- Workspace access remains denied until the canonical tenant and active OWNER membership are confirmed.

This design does not change P0.1 table meaning, tenant resolution, membership authority, write authority, or isolation.

## Current architecture audit

| Component | Current behaviour | Reusable | Required change | Freeze impact |
|---|---|---|---|---|
| Consultant login/session (`services/auth-service/app/api/v1/routes/auth.py`, `auth_service.py`) | Password login, access JWT, refresh rotation, logout, status/lock checks | Yes | Add public signup, recovery, and onboarding claims | No |
| Consultant user model (`services/auth-service/app/db/models/user.py`) | Unique email/mobile, password, verification/status/session state | Yes | Add explicit external signup/onboarding relation | No |
| Consultant frontend auth (`nuetra-frontend/context/AuthContext.js`, `pages/login.js`) | Token restore, `/auth/login`, role routing | Yes | Add public flow and onboarding guard | No |
| Fiteatsy OTP (`backend/src/modules/auth/auth.service.ts`, `otp-store.ts`) | Five-minute OTP, attempts, resend cooldown, quota, Redis | Partly | Reuse policy/delivery pattern, not client completion | No |
| Fiteatsy mobile signup | Creates Zestiva CLIENT membership, client, health profile | No | Never use for external Consultant signup | No |
| Consultant JWT bridge (`auth.repository.ts`) | Materialises local user and Zestiva Consultant membership | Partly | External subjects must require confirmed external membership, never implicit Zestiva attachment | Potential; additive implementation and frozen regression required |
| Delegated authority (`delegated-authority.ts`) | RS256, issuer/audience/product/purpose/permission, expiry, replay protection | Yes | Add narrow external provisioning permission/purpose | No |
| P0.1 tenant authority (`0082_multi_tenant_expand_backfill.sql`, `tenancy/*`) | Canonical tenants, memberships, context, ownership | Yes | Use existing tenant types and OWNER role unchanged | No |
| QA/admin provisioning | Purpose-bound internal provisioning | Pattern only | External signup gets distinct permission, route, audit vocabulary | No |
| Audit | Login/admin events exist | Yes | Add safe external lifecycle events; never log OTP/password/token | No |

## Non-reuse rules

1. `/v1/auth/signup/*` is a mobile client flow; its completion path would incorrectly create a Zestiva client.
2. The browser never writes tenant records directly.
3. Role claims never infer external tenant ownership.
4. Consultant-service organization membership is not a substitute for P0.1 `tenant_memberships`.

## Canonical records

Every ready external account has:

1. Consultant-auth `User` with verified canonical identity.
2. Explicit external signup/onboarding record and immutable account type.
3. Fiteatsy `tenants` row of type `INDEPENDENT_CONSULTANT` or `PRACTICE`.
4. Active Fiteatsy `tenant_memberships` row with `tenant_role = OWNER` for the canonical auth subject.
5. Minimal Consultant practitioner profile linked to the canonical Fiteatsy tenant id.

## Signup transition matrix

| State | Event | Next state | Invariant |
|---|---|---|---|
| `STARTED` | verification issued | `VERIFICATION_PENDING` | normalized identity only; no user/tenant |
| `VERIFICATION_PENDING` | valid proof | `VERIFIED` | proof consumed once |
| `VERIFICATION_PENDING` | expiry | `VERIFICATION_EXPIRED` | no user/tenant |
| `VERIFIED` | credential transaction | `ACCOUNT_CREATED` | one auth user |
| `ACCOUNT_CREATED` | delegated provision | `TENANT_CREATED` | tenant and OWNER membership committed together |
| `TENANT_CREATED` | profile created | `PROFILE_PENDING` | profile linked to tenant |
| `PROFILE_PENDING` | onboarding starts | `ONBOARDING_IN_PROGRESS` | resumable server state |
| `ONBOARDING_IN_PROGRESS` | required steps complete | `READY` | active user, tenant, OWNER membership, profile |
| non-terminal | suspension | `SUSPENDED` | login/workspace denied; data retained |
| non-terminal | security block | `BLOCKED` | verification/login/workspace denied |
| non-terminal | cancellation | `CANCELLED` | no workspace; cleanup policy recorded |

Unlisted transitions fail with `INVALID_SIGNUP_TRANSITION`. Completed provisioning steps are idempotent and return existing canonical identifiers.

## Cross-service atomicity

P0.2 uses a recoverable saga; it does not claim a distributed transaction:

1. Auth service commits the verified user and signup state.
2. It sends a short-lived, single-use delegated request containing canonical user id, account type, country, timezone, and display/practice name.
3. Fiteatsy creates tenant, tenant settings, and active OWNER membership in one PostgreSQL transaction.
4. Auth service persists the returned tenant id and advances state.
5. A stable signup idempotency key makes retries return the same tenant/membership.
6. Only `READY` accounts receive workspace eligibility; partial accounts can only resume onboarding/provisioning.

No orphan tenant can be created in Fiteatsy. A verified user whose remote provisioning failed remains recoverable and cannot enter a workspace.

## Multi-membership behaviour

- Initial signup creates exactly one tenant and OWNER membership.
- An existing identity is never silently attached to a new tenant.
- Existing identities receive a non-enumerating continuation response and require an authenticated future add-tenant flow outside P0.2.
- Active tenant context is derived server-side from canonical memberships; client-supplied tenant ids are never authoritative.

## Implementation gate

Implementation must remain additive, purpose-bound, idempotent, replay-protected, and covered by existing Zestiva and P0.1 isolation regressions. The Consultant frontend must be developed from its protected P0.1 branch in a clean worktree, not the dirty local checkout.

