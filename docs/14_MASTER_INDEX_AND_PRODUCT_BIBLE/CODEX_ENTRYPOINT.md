# Fiteatsy — Codex Entrypoint

## Mandatory Starting Instruction

For every Fiteatsy engineering task:

1. identify the requested milestone/task;
2. read this file;
3. read `13_IMPLEMENTATION_ROADMAP_AND_GOVERNANCE/DOCUMENT_READING_MATRIX.md`;
4. read only the authoritative documents listed for that task;
5. inspect only the code required for the task;
6. report contradictions before crossing an approved boundary.

## Current Next Task

**M3B.1 — Ownership Schema Foundation (Production Verification / Acceptance)**

### Read

- `14_MASTER_INDEX_AND_PRODUCT_BIBLE/FITEATSY_PRODUCT_BIBLE.md`
- `14_MASTER_INDEX_AND_PRODUCT_BIBLE/CURRENT_PROGRAMME_STATE.md`
- `14_MASTER_INDEX_AND_PRODUCT_BIBLE/OPEN_DECISIONS_REGISTER.md`
- `02_IDENTITY_AND_CLIENT/`
- `04_DATABASE/`
- `05_API/`
- `10_CONSULTANT_INTEGRATION/` only for external-reference constraints
- `12_SECURITY_PRIVACY_AND_GOVERNANCE/`
- `13_IMPLEMENTATION_ROADMAP_AND_GOVERNANCE/`
- `PROJECT_STATE.md`

### Inspect

Only M3B.1-relevant repository files and evidence surfaces, including as applicable:

- backend schema and migrations;
- `fiteatsy_clients` and current account-to-client correlation;
- approved direct-root tables with new `client_id` compatibility columns;
- tests proving schema contract, migration packaging, and protected auth/runtime behavior;
- `docs/02_IDENTITY_AND_CLIENT/M3B_EXISTING_DOMAIN_OWNERSHIP_TRANSITION_REVIEW.md`;
- status/governance docs that must stay aligned to the M3B.1 verification gate.

### Do Not

- implement application code;
- create migrations;
- change production configuration;
- change Railway resources;
- begin `M3B.2`, `M3B.3`, `M3B.4`, or `M3C` without explicit Product Owner approval;
- refactor unrelated code.

### Output

Report:

- M3B.1 deployment identity and running commit;
- migration packaging/runtime evidence;
- public health/readiness/version evidence;
- what was and was not directly verified about the new ownership schema;
- protected-baseline regression status;
- Git state.

Then stop for production acceptance evidence or the next explicit implementation authorization.

## Historical / Superseded Instruction

The following instruction is historical and no longer the active next task after production acceptance:

**D0 — Railway Deployment Readiness Audit**

### Historical Read

- `14_MASTER_INDEX_AND_PRODUCT_BIBLE/FITEATSY_PRODUCT_BIBLE.md`
- `14_MASTER_INDEX_AND_PRODUCT_BIBLE/CURRENT_PROGRAMME_STATE.md`
- `11_DEPLOYMENT_AND_RAILWAY/`
- relevant deployment/security portions of `12_SECURITY_PRIVACY_AND_GOVERNANCE/`
- `13_IMPLEMENTATION_ROADMAP_AND_GOVERNANCE/NEXT_EXECUTION_PLAN.md`
- `13_IMPLEMENTATION_ROADMAP_AND_GOVERNANCE/CODEX_EXECUTION_PROTOCOL.md`
