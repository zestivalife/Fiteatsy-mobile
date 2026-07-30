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

**D0 — Railway Deployment Readiness Audit**

### Read

- `14_MASTER_INDEX_AND_PRODUCT_BIBLE/FITEATSY_PRODUCT_BIBLE.md`
- `14_MASTER_INDEX_AND_PRODUCT_BIBLE/CURRENT_PROGRAMME_STATE.md`
- `11_DEPLOYMENT_AND_RAILWAY/`
- relevant deployment/security portions of `12_SECURITY_PRIVACY_AND_GOVERNANCE/`
- `13_IMPLEMENTATION_ROADMAP_AND_GOVERNANCE/NEXT_EXECUTION_PLAN.md`
- `13_IMPLEMENTATION_ROADMAP_AND_GOVERNANCE/CODEX_EXECUTION_PROTOCOL.md`

### Inspect

Only deployment-relevant repository files, including as applicable:

- root/backend `package.json`;
- backend entrypoint;
- database pool/migrator;
- environment configuration;
- Docker/Railway config if present;
- health/readiness/version routes;
- CORS;
- `.gitignore`;
- deployment docs/config.

### Do Not

- implement features;
- change schema;
- create Railway resources;
- change Git state;
- refactor unrelated code;
- re-audit all product domains.

### Output

Report:

- exact backend root;
- build command;
- start command;
- runtime/Node requirements;
- required environment variables;
- database assumptions;
- migration behaviour;
- health/readiness/version status;
- CORS status;
- production blockers;
- minimal required preparation changes;
- Git state.

Then stop for Product Owner approval.
