# Fiteatsy — Trusted Service Authentication

**Status:** Mechanism not yet frozen

## Problem

Consultant is a backend workload, not a Fiteatsy mobile user.

Therefore:

```text
Mobile User Bearer Token
        !=
Consultant Service Credential
```

## Requirements

Service-to-service authentication must provide:

- workload identity;
- credential rotation;
- expiry;
- audience/service restriction;
- environment separation;
- revocation;
- secure secret storage;
- audit/correlation.

## Potential Approaches

Depending on deployed infrastructure:

- short-lived signed service JWTs;
- managed workload identity;
- gateway-issued service identity;
- another approved machine-to-machine mechanism.

The final mechanism should be selected during deployment/integration design.

## Railway

If both systems run on Railway, private networking can reduce public exposure but does not replace application authentication/authorization.

## Secrets

Service credentials belong in deployment secret management, never mobile bundles or Git.

## Authorization

Successful service authentication does not automatically authorise access to every Fiteatsy Client.

Client/Practitioner scope must still be validated.
