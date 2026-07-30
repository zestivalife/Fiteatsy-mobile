# Fiteatsy — Environment Strategy

## Required Separation

At minimum distinguish:

- local development;
- staging/test runtime;
- production.

## Recommended Railway Direction

```text
Fiteatsy Railway
├── Staging Environment
│   ├── API
│   └── PostgreSQL
│
└── Production Environment
    ├── API
    └── PostgreSQL
```

Exact Railway project/environment organisation may be adjusted to platform capabilities, but production data and credentials must remain isolated from development/staging.

## Deployment Flow

Preferred:

```text
Local / Feature Work
        |
        v
Git Commit
        |
        v
Staging Deployment
        |
        v
Runtime Verification
        |
        v
Production Deployment
        |
        v
Production Acceptance
```

## Mobile Environments

Mobile builds must be able to target the intended API environment without source-code edits.

Production builds must never silently fall back to localhost/demo backends.
