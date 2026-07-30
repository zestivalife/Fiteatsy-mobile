# Fiteatsy — CAP-003 Practitioner Assignment Boundary

## Critical Invariant

```text
Fiteatsy Client existence
        !=
Practitioner authorization
```

## Correct Flow

```text
Practitioner requests Client
          |
          v
Consultant Backend
          |
          v
CAP-003 checks assignment
          |
     +----+----+
     |         |
   DENY      ALLOW
               |
               v
      Fiteatsy Trusted API
```

## CAP-003 Should Own

Conceptually:

- practitioner_ref;
- client_ref;
- product/capability origin;
- tenant/workspace;
- assignment status;
- assignment type/scope;
- effective dates;
- provenance.

## Legacy Fiteatsy Fields

Existing Fiteatsy `assigned_consultant_id` / `assigned_mentor_id` fields must not become the future cross-system authorization authority.

They may remain temporarily for compatibility until migrated under an approved CAP-003 plan.

## Programme / Subscription

A Fiteatsy subscription or programme participation must not itself grant a Practitioner access.

## Server Enforcement

Hiding a client in the UI is not authorization.

Professional access must be enforced by backend contracts.
