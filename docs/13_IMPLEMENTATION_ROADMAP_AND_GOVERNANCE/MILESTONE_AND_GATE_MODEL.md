# Fiteatsy — Milestone & Gate Model

## Gate Types

### G0 — Architecture Gate
Scope, ownership and dependencies approved.

### G1 — Implementation Gate
Code/migrations/tests written.

### G2 — Local Verification Gate
Static checks and feasible local tests pass.

### G3 — Staging Runtime Gate
Deployed against real dependencies and verified.

### G4 — Security / Regression Gate
Relevant negative/security/regression tests pass.

### G5 — Production Deployment Gate
Expected build/commit deployed.

### G6 — Production Acceptance Gate
Runtime evidence approved.

## Example

```text
IMPLEMENTED
    !=
STAGING VERIFIED
    !=
PRODUCTION ACCEPTED
```

## Blocking

Do not continue into a dependent production milestone when a required gate is BLOCKED.

Design/document work may continue if it does not create false implementation assumptions.
