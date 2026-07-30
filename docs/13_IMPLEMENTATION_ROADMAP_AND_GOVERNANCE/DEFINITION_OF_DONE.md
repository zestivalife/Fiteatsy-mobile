# Fiteatsy — Definition of Done

A task is complete only when all applicable items are satisfied.

## Engineering

- scope implemented;
- no unrelated architecture expansion;
- migrations included where required;
- backward compatibility considered;
- errors handled;
- no demo fallback introduced.

## Security

- authentication enforced where required;
- object-level authorization enforced;
- sensitive data minimised;
- secrets not committed/logged.

## Tests

- positive path;
- negative path;
- ownership/authorization;
- regression coverage;
- idempotency where applicable;
- migration test where applicable.

## Documentation

Update only affected authoritative documents.

Do not rewrite the entire docs tree for every code task.

## Git

- intended files only;
- untracked unrelated files preserved;
- commit created when requested by execution policy;
- push verified;
- branch reported;
- commit SHA reported;
- working tree state reported.

## Runtime

For deployed work:
- health;
- readiness;
- version;
- expected commit;
- dependency connectivity;
- representative API;
- relevant browser/device flow.

## Status

If runtime verification is blocked, status is not DONE/PRODUCTION VERIFIED. Report the blocker explicitly.
