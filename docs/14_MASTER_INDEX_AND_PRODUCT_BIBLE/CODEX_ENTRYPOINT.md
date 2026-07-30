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

**M3B — Existing Domain Ownership Transition (Definition / Governance Only)**

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

Only M3B-governance-relevant repository files, including as applicable:

- backend auth/account persistence;
- platform ownership persistence still using `user_id`;
- current schema/migrations and M3A client correlation;
- current API ownership and authorization patterns;
- tests that prove or assume account-owned domain access;
- status/governance docs that still treat M3B as implementation-ready.

### Do Not

- implement application code;
- create migrations;
- change production configuration;
- change Railway resources;
- begin M3B implementation;
- refactor unrelated code.

### Output

Report:

- authoritative accepted production baseline;
- last completed gate;
- M3 definition/governance status;
- M3 decisions resolved vs escalated;
- recommended M3 implementation decomposition;
- migration strategy;
- API ownership strategy;
- security/regression requirements;
- protected-baseline risks;
- Git state.

Then stop for Product Owner / architecture approval before implementation.

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
