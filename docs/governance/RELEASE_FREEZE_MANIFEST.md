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

### P0.1 Multi-Tenant Architecture

- Accepted application SHA: `2d879832bbaa426a88df8e1a058668a628a14a56`
- Production runtime SHA: `2d879832bbaa426a88df8e1a058668a628a14a56`
- Database migration version: `0084_multi_tenant_contract.sql`
- Production acceptance: `PASS`
- Data-loss evidence: `UNKNOWN`
- Engineering seal: `ACTIVE`
- Seal record: [P0.1 Multi-Tenant Engineering Seal](./P0_1_MULTI_TENANT_ENGINEERING_SEAL.md)

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
| `TENANT_MODEL` | `FROZEN_PROTECTED` | Multi-tenant contract and isolated PostgreSQL verification |
| `TENANT_MEMBERSHIP_AUTHORITY` | `FROZEN_PROTECTED` | Membership authority and QA provisioning regressions |
| `TENANT_RESOURCE_SCOPE` | `FROZEN_PROTECTED` | Tenant contract tests and production QA smoke |
| `TENANT_WRITE_AUTHORITY` | `FROZEN_PROTECTED` | Explicit tenant-write coverage and database verification |
| `TENANT_PARENT_CHILD_INTEGRITY` | `FROZEN_PROTECTED` | Relational tenant-integrity verification |
| `CROSS_TENANT_ISOLATION` | `FROZEN_PROTECTED` | Bidirectional Tenant A/B isolation matrix |
| `TENANT_REPORT_ISOLATION` | `FROZEN_PROTECTED` | Report authorization contracts; runtime read remains an evidence gate |
| `TENANT_FILE_ISOLATION` | `FROZEN_PROTECTED` | File/storage authorization contracts; runtime read remains an evidence gate |
| `TENANT_DIET_REVIEW_ISOLATION` | `FROZEN_PROTECTED` | Governed Common Food and review lifecycle smoke |
| `TENANT_SEARCH_ISOLATION` | `FROZEN_PROTECTED` | Tenant-scoped search verification |
| `TENANT_COUNT_ISOLATION` | `FROZEN_PROTECTED` | Tenant-scoped count verification |
| `TENANT_AUDIT_SCOPE` | `FROZEN_PROTECTED` | Tenant-aware operational diagnostics |
| `PLATFORM_GLOBAL_AUTHORITY` | `FROZEN_PROTECTED` | Explicit platform-authority contract |
| `ZESTIVA_MIGRATION_COMPATIBILITY` | `FROZEN_PROTECTED` | Legacy Zestiva fallback and upgrade verification |
| `QA_AUTH_ACCEPTANCE_PATH` | `FROZEN_PROTECTED` | QA provisioning and governed production smoke |
| `DATABASE_MIGRATION_GOVERNANCE` | `FROZEN_PROTECTED` | Explicit migration command plus read-only startup readiness |

## Change control

Any change to a frozen feature requires all twelve steps in the [engineering seal](./CONSULTANT_DIET_PLAN_ENGINEERING_SEAL.md#mandatory-future-change-policy). No test, fixture, migration, historical implementation, or deployment may silently redefine this flow.
