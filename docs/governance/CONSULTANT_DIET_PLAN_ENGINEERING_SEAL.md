# Consultant Diet Plan Engineering Seal

`ENGINEERING_SEAL: ACTIVE`

## Accepted production baseline

- `BACKEND_ACCEPTED_SHA: 0fc45e318216b19487f580c34d14092aef3b71b0`
- `FRONTEND_ACCEPTED_SHA: 587179495c63ed23504bcb637964350ef7327efa`
- `PRODUCTION_ACCEPTANCE: PASS`
- `CI: PASS`
- `RUNTIME_PARITY: PASS`

This is a governance seal. It does not change the accepted production implementation or authorize a deployment.

## Canonical sealed product flow

1. The Client completes onboarding/profile and becomes eligible for assignment.
2. An authorised Senior Consultant or Operations user assigns the Client to a Consultant.
3. The Consultant sees assigned clients only, opens Client 360, creates and saves a Diet Plan draft using the governed food catalogue, then submits it for review.
4. The Senior Consultant sees reviewable submitted plans without requiring a normal Consultant assignment, and reviews the immutable submitted version without Consultant authoring APIs.
5. The Senior Consultant either requests changes or approves the exact submitted version.
6. A change request returns feedback to the Consultant, who revises, saves, and resubmits.
7. Approval is version-specific and never publishes automatically.
8. The assigned Consultant explicitly publishes the approved version.
9. The Client receives only that exact published version. Draft, review, and unapproved versions never leak to the Client.

## Sealed access and authority boundaries

- Consultant authoring requires authentication, an allowed Consultant role, active client assignment, and applicable domain permissions.
- Senior review requires authentication, the Senior Consultant role, and a reviewable submitted version; normal Consultant client assignment is not required.
- Consultants may author only for assigned clients and may publish only the exact approved version.
- Senior Consultants may inspect immutable submissions, request changes, and approve exact versions; the review role does not implicitly grant authoring, generation, editing, or publishing authority.
- `CONSULTANT_ACCESS_V1` must not be reintroduced as a Consultant workspace business gate. Historical consent records may remain for audit or compatibility only and must not grant or deny workspace access.
- Cross-client and cross-consultant isolation remains fail-closed.

## Sealed Diet Plan and review UI contracts

- Preserve seven meal heads, five options per meal, and 35 total options wherever the governed 5×7 contract applies.
- Use only the governed approved food catalogue.
- Preserve draft, save/reload, submit, review, change request, revision, resubmission, exact-version approval, explicit Consultant publication, and exact client published-read semantics.
- Senior review shows the immutable submitted snapshot, all seven meal heads, submitted options, nutrition values, review metadata, Request Changes, and Approve.
- Senior review does not show Consultant Save, Edit, Publish, assignment-required authoring errors, Consultant authoring-access errors, or unrestricted Generate Alternatives.

## Prohibited regressions

1. Reintroducing `CONSULTANT_ACCESS_V1` as a Consultant workspace gate.
2. Hiding assigned clients because Consultant consent is absent.
3. Allowing unassigned Consultant access.
4. Requiring Senior Consultant client assignment for Diet Plan review.
5. Calling Consultant-authoring APIs from Senior review.
6. Implicitly granting Senior Consultants normal Consultant edit/generate authority.
7. Showing authoring-access errors in read-only Senior review.
8. Allowing drafts into the review queue.
9. Applying approval to another version.
10. Auto-publishing an approval.
11. Publishing unapproved content.
12. Leaking draft or review content to the Client.
13. Rendering API/network failures as a false zero-client state.
14. Accepting deployment with stale backend or frontend runtime identity.

## Permanent regression ownership

- Assignment, roster, Client 360, and isolation: [`tests/backend/consultant-access-lifecycle-contract.test.ts`](../../tests/backend/consultant-access-lifecycle-contract.test.ts), [`tests/backend/consultant-client360-contract.test.ts`](../../tests/backend/consultant-client360-contract.test.ts)
- Senior review authority, queue filtering, immutable version, and approval-not-publication: [`tests/backend/senior-consultant-diet-review-authority.test.ts`](../../tests/backend/senior-consultant-diet-review-authority.test.ts)
- Lifecycle transitions, exact-version publication, and client-visible version isolation: [`tests/backend/simple-consultant-approval-workflow.test.ts`](../../tests/backend/simple-consultant-approval-workflow.test.ts)
- Persistence, Request Changes, revision, resubmission, and snapshot integrity: [`tests/database/diet-lifecycle-quality.database.test.ts`](../../tests/database/diet-lifecycle-quality.database.test.ts), [`tests/backend/diet-plan-version-store-contract.test.ts`](../../tests/backend/diet-plan-version-store-contract.test.ts)
- Frontend false-zero, Client 360, immutable Senior review, review actions, and runtime identity: `nuetra-frontend/tests/client-roster-failure-contract.test.mjs`, `nuetra-frontend/tests/client360-contract.test.mjs`, `nuetra-frontend/tests/senior-diet-plan-review.test.mjs`, `nuetra-frontend/tests/runtime-build-identity.test.mjs`

## Mandatory future change policy

Any future change to this sealed flow requires:

1. Explicit Product Owner requirement.
2. Documented impact analysis.
3. Identification of affected sealed feature IDs.
4. Updated regression tests.
5. Focused test pass.
6. Full cross-feature regression pass.
7. Exact-SHA CI.
8. Exact-SHA deployment.
9. Runtime parity verification.
10. Production acceptance.
11. Freeze manifest update.
12. Engineering seal revision.

No engineer, test, fixture, migration, or historical implementation may silently redefine this flow.
