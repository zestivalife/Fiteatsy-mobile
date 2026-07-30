# Fiteatsy — Security Architecture

## Trust Boundaries

```text
User Device
    |
    | Internet / HTTPS
    v
Fiteatsy API
    |
    +--> PostgreSQL
    +--> Private Object Storage
    +--> Background Workers
    +--> Approved External Providers
    |
    +<--> Consultant Backend
           [trusted service identity + CAP-003]
```

Every boundary requires explicit authentication/authorization appropriate to the actor.

## Principles

- least privilege;
- deny by default;
- server-side authorization;
- data minimisation;
- encrypted transport;
- private storage;
- secret isolation;
- auditable privileged access;
- environment isolation;
- explicit source/provenance for health data.

## Sensitive Domains

Particular protection applies to:

- health observations;
- biomarkers;
- medical reports;
- medication information;
- recovery/progress results;
- identity/contact data;
- Practitioner access records.

## No Security by UI

A hidden button, route or screen is not an authorization control.
