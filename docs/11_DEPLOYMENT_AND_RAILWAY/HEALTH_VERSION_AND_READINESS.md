# Fiteatsy — Health, Version & Readiness Endpoints

## Requirement

The deployed backend should expose machine-verifiable runtime identity.

## Health

Conceptual:

```text
GET /health
or
GET /v1/health
```

Should indicate whether the application process is alive.

## Readiness

Conceptual:

```text
GET /ready
```

Should indicate whether the service is ready to serve required traffic.

Readiness may depend on critical dependencies such as PostgreSQL.

## Version

Conceptual:

```text
GET /v1/version
```

Recommended response context:

- service name;
- application version;
- Git commit SHA;
- environment;
- build/deployment metadata where available.

## Why Version Matters

Without runtime commit evidence, a green Railway deployment can still be running unexpected source.

## Guard

Do not expose secrets or sensitive infrastructure values through diagnostic endpoints.
