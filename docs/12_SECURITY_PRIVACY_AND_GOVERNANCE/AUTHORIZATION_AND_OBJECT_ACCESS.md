# Fiteatsy — Authorization & Object-Level Access

## User Access

Authenticated Fiteatsy users may access only resources belonging to their authorised Fiteatsy Client/account context.

## Object Checks

Every sensitive endpoint should resolve:

```text
Authenticated Actor
      +
Requested Resource
      +
Ownership / Scope
      =
ALLOW or DENY
```

## Practitioner Access

Practitioner access is different:

```text
Practitioner
    |
Consultant
    |
CAP-003 Assignment
    |
Trusted Fiteatsy API
```

Fiteatsy Client existence does not grant Practitioner access.

## Service Accounts

Service authentication proves which backend is calling.

It does not automatically authorise every client object.

## Administration

Administrative access must be explicitly scoped and auditable.

Avoid universal admin bypasses unless operationally necessary and governed.

## Testing

Negative tests are mandatory:

- unauthenticated;
- wrong user;
- wrong client;
- stale/revoked session;
- unassigned Practitioner;
- cross-environment credential.
