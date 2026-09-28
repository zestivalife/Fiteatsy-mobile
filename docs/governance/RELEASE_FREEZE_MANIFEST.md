# Release freeze manifest

Status: `PENDING_FINAL_ACCEPTANCE`

This candidate is not sealed merely because the manifest exists. Activation requires local validation, two relevant regression passes, exact-SHA governed CI, deployment, runtime-SHA parity, and authenticated production acceptance.

## Protected contracts

1. `CONSULTANT_ASSIGNMENT_ACCESS` — authenticated allowed role + active assignment + domain permission is the workspace authority.
2. `CONSULTANT_ROSTER` — a visible client satisfies the same assignment model required by Client 360.
3. `CLIENT360_FULL_ASSIGNED_ACCESS` — all assigned-client domains are accessible without `CONSULTANT_ACCESS_V1`.
4. `CROSS_CLIENT_ISOLATION` — unassigned, inactive, ended, revoked, and cross-consultant access stays denied.
5. `FALSE_ZERO_HANDLING` — request failures render errors and never fabricate a zero-client success state.
6. `DIET_DRAFT_LIFECYCLE` — drafts and revisions do not alter the client-visible published version.
7. `SENIOR_REVIEW` — Senior Consultant review requests changes or approves the exact reviewed version.
8. `EXACT_VERSION_APPROVAL` — approval is version-specific and does not publish.
9. `CONSULTANT_EXPLICIT_PUBLISH` — publication is a separate explicit action.
10. `CLIENT_PUBLISHED_VERSION` — the client receives only the exact explicitly published version.
11. `RUNTIME_PARITY` — production acceptance requires exact frontend/backend runtime identities.

Engineering seal: `NOT_ACTIVE`
