# Release freeze manifest

Status: `ACTIVE`

Engineering seal: `ACTIVE`

Seal document: [Consultant Diet Plan Engineering Seal](./CONSULTANT_DIET_PLAN_ENGINEERING_SEAL.md)

## Accepted production implementation

- Backend SHA: `0fc45e318216b19487f580c34d14092aef3b71b0`
- Frontend SHA: `587179495c63ed23504bcb637964350ef7327efa`
- Production acceptance: `PASS`
- Exact-SHA CI: `PASS`
- Backend runtime parity: `PASS`
- Frontend runtime parity: `PASS`

Governance commits created after acceptance document the freeze only. They do not replace or change the accepted production implementation SHAs above.

## Frozen protected features

| Feature ID | Status | Permanent regression ownership |
| --- | --- | --- |
| `CONSULTANT_ASSIGNMENT_ACCESS` | `FROZEN_PROTECTED` | [`tests/backend/senior-consultant-diet-review-authority.test.ts`](../../tests/backend/senior-consultant-diet-review-authority.test.ts), [`tests/backend/consultant-access-lifecycle-contract.test.ts`](../../tests/backend/consultant-access-lifecycle-contract.test.ts) |
| `CONSULTANT_ROSTER` | `FROZEN_PROTECTED` | [`tests/backend/consultant-access-lifecycle-contract.test.ts`](../../tests/backend/consultant-access-lifecycle-contract.test.ts) |
| `CLIENT360_ASSIGNED_ACCESS` | `FROZEN_PROTECTED` | [`tests/backend/consultant-client360-contract.test.ts`](../../tests/backend/consultant-client360-contract.test.ts), [`tests/backend/consultant-access-lifecycle-contract.test.ts`](../../tests/backend/consultant-access-lifecycle-contract.test.ts) |
| `CROSS_CLIENT_ISOLATION` | `FROZEN_PROTECTED` | [`tests/backend/simple-consultant-approval-workflow.test.ts`](../../tests/backend/simple-consultant-approval-workflow.test.ts), [`tests/backend/consultant-access-lifecycle-contract.test.ts`](../../tests/backend/consultant-access-lifecycle-contract.test.ts) |
| `FALSE_ZERO_HANDLING` | `FROZEN_PROTECTED` | Frontend: `nuetra-frontend/tests/client-roster-failure-contract.test.mjs` |
| `DIET_PLAN_DRAFT` | `FROZEN_PROTECTED` | [`tests/database/diet-lifecycle-quality.database.test.ts`](../../tests/database/diet-lifecycle-quality.database.test.ts) |
| `DIET_PLAN_SAVE_RELOAD` | `FROZEN_PROTECTED` | [`tests/database/diet-lifecycle-quality.database.test.ts`](../../tests/database/diet-lifecycle-quality.database.test.ts), [`tests/backend/diet-plan-version-store-contract.test.ts`](../../tests/backend/diet-plan-version-store-contract.test.ts) |
| `DIET_PLAN_SUBMIT` | `FROZEN_PROTECTED` | [`tests/database/diet-lifecycle-quality.database.test.ts`](../../tests/database/diet-lifecycle-quality.database.test.ts), [`tests/backend/simple-consultant-approval-workflow.test.ts`](../../tests/backend/simple-consultant-approval-workflow.test.ts) |
| `SENIOR_REVIEW_QUEUE` | `FROZEN_PROTECTED` | [`tests/backend/senior-consultant-diet-review-authority.test.ts`](../../tests/backend/senior-consultant-diet-review-authority.test.ts) |
| `SENIOR_REVIEW_AUTHORITY` | `FROZEN_PROTECTED` | [`tests/backend/senior-consultant-diet-review-authority.test.ts`](../../tests/backend/senior-consultant-diet-review-authority.test.ts) |
| `CHANGE_REQUEST_LIFECYCLE` | `FROZEN_PROTECTED` | [`tests/database/diet-lifecycle-quality.database.test.ts`](../../tests/database/diet-lifecycle-quality.database.test.ts), [`tests/backend/simple-consultant-approval-workflow.test.ts`](../../tests/backend/simple-consultant-approval-workflow.test.ts) |
| `DIET_PLAN_REVISION` | `FROZEN_PROTECTED` | [`tests/database/diet-lifecycle-quality.database.test.ts`](../../tests/database/diet-lifecycle-quality.database.test.ts) |
| `DIET_PLAN_RESUBMISSION` | `FROZEN_PROTECTED` | [`tests/database/diet-lifecycle-quality.database.test.ts`](../../tests/database/diet-lifecycle-quality.database.test.ts), [`tests/backend/simple-consultant-approval-workflow.test.ts`](../../tests/backend/simple-consultant-approval-workflow.test.ts) |
| `EXACT_VERSION_APPROVAL` | `FROZEN_PROTECTED` | [`tests/backend/senior-consultant-diet-review-authority.test.ts`](../../tests/backend/senior-consultant-diet-review-authority.test.ts), [`tests/backend/simple-consultant-approval-workflow.test.ts`](../../tests/backend/simple-consultant-approval-workflow.test.ts) |
| `APPROVAL_NOT_PUBLICATION` | `FROZEN_PROTECTED` | [`tests/backend/senior-consultant-diet-review-authority.test.ts`](../../tests/backend/senior-consultant-diet-review-authority.test.ts), [`tests/backend/simple-consultant-approval-workflow.test.ts`](../../tests/backend/simple-consultant-approval-workflow.test.ts) |
| `CONSULTANT_EXPLICIT_PUBLISH` | `FROZEN_PROTECTED` | [`tests/backend/simple-consultant-approval-workflow.test.ts`](../../tests/backend/simple-consultant-approval-workflow.test.ts) |
| `CLIENT_PUBLISHED_VERSION` | `FROZEN_PROTECTED` | [`tests/backend/simple-consultant-approval-workflow.test.ts`](../../tests/backend/simple-consultant-approval-workflow.test.ts), [`tests/database/diet-lifecycle-quality.database.test.ts`](../../tests/database/diet-lifecycle-quality.database.test.ts) |
| `BACKEND_RUNTIME_SHA_PARITY` | `FROZEN_PROTECTED` | Exact-SHA CI and production `/v1/version` acceptance evidence |
| `FRONTEND_RUNTIME_SHA_PARITY` | `FROZEN_PROTECTED` | Frontend: `nuetra-frontend/tests/runtime-build-identity.test.mjs` |

## Change control

Any change to a frozen feature requires all twelve steps in the [engineering seal](./CONSULTANT_DIET_PLAN_ENGINEERING_SEAL.md#mandatory-future-change-policy). No test, fixture, migration, historical implementation, or deployment may silently redefine this flow.
