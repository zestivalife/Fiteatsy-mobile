# Fiteatsy — Open Decisions Register

## M3 Decision Register Status

### OD-001 Account → Fiteatsy Client Cardinality
Question:
Can one Fiteatsy account own exactly one client profile at launch, or can it manage multiple client/dependant profiles?

Resolution:
`APPROVED` — `1 Account : 1 Client` for M3.

### OD-002 Active Fiteatsy Client Definition
Question:
At what event does a durable account become an active Fiteatsy Client?

Resolution:
`APPROVED` — create the Fiteatsy Client deterministically after successful account verification.

Clarification:
Client existence is separate from product activation and onboarding completion.

### OD-003 Deactivation
Question:
What does deactivation mean for app access, data retention and Consultant projection?

### OD-004 CAP-001 Reference Naming
Question:
What stable platform Person reference field is used across products?

## Governance Status

Resolved decisions are now part of the approved:

`M3 — Fiteatsy Client & Identity`

definition/architecture baseline.

Current implementation authorization applies only to:

`M3A — Client Identity Foundation`

Still-open decisions that may affect later slices:

- `OD-003 Deactivation`
- `OD-004 CAP-001 Reference Naming`

## Post-M3A Status

`M3A — Client Identity Foundation` is now `PRODUCTION_ACCEPTED`.

The next candidate milestone is:

`M3B — Existing Domain Ownership Transition`

`M3B` definition is now `READY FOR PRODUCT OWNER REVIEW`.

`M3B` is not implementation-authorized.

## Product Owner Decisions Required Before M3B

### OD-010 Ownership Cutover Scope
Which `user_id`-owned domain surfaces move to client ownership in the first M3B slice, and which remain compatibility-bound temporarily?

Recommended review outcome:
Move persisted client-domain roots in the first M3B implementation slice, while keeping family/social account-sharing tables and non-persisted runtime stores out of scope.

### OD-011 Compatibility Window
How long must mixed account/client ownership remain supported for reads, writes, migrations, and rollback?

Recommended review outcome:
Do not adopt a long-lived compatibility window. Use a brief implementation-scoped transition only, then remove redundant account ownership after verification.

### OD-012 Transitional Authorization Boundary
What is the approved server-side access contract while both legacy `user_id` ownership and client-owned resources coexist, and what anti-IDOR controls are mandatory at each boundary?

Recommended review outcome:
Canonical access should be `Bearer Session -> Account -> Current Client -> Owned Resource`, with server-derived current-client resolution and no trust in caller-supplied client IDs for ordinary user APIs.

### OD-013 Rollback / Repair Expectation
What rollback or repair guarantees are required if M3B ownership migration partially succeeds across health profiles, care cases, nutrition profiles, reports, or notifications?

Recommended review outcome:
Require additive-first rollout, explicit integrity queries, fail-closed authorization on mismatches, and a repair path before destructive compatibility removal.

### OD-014 Client Data Deletion Semantics
What deletion/anonymisation behavior is approved for client-owned health-domain records once ownership moves off account-oriented `user_id` fields?

Recommended review outcome:
Approve a non-destructive first-step model unless Product Owner/privacy policy explicitly authorizes stronger delete semantics.

### OD-015 Deactivated Client Access Semantics
What reads, writes, and recovery behaviors remain allowed when a Client is deactivated or soft-deleted?

Recommended review outcome:
Fail closed on protected writes by default and require explicit Product Owner approval for any retained read access.

## Later Decisions

### OD-005 Recovery Methodology v1
Signals, baselines, weights/logic and output meaning.

### OD-006 Practitioner Medication Visibility
What medication context, if any, is visible in Consultant?

### OD-007 Medical Report Retention
Requires product/privacy/legal approval.

### OD-008 AI Provider / Processing Policy
Provider, data handling and production use.

### OD-009 Raw Report Practitioner Access
Whether/when Practitioner may view original reports.

## Rule

Codex may identify decision requirements. It must not silently resolve Product Owner decisions.
