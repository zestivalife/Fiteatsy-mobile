# Fiteatsy — Capability Dependency Map

## Foundation Dependencies

```text
Railway/PostgreSQL
       |
       v
Account/Auth
       |
       v
Fiteatsy Client
       |
       +--------------------+
       |                    |
       v                    v
Health Data           Medical Reports
       |                    |
       |              Biomarkers
       |                    |
       +---------+----------+
                 |
                 v
        Recovery Intelligence
                 |
                 v
       Consultant Integration
```

## Medication

Medication requires:

- Fiteatsy Client;
- backend persistence;
- API/auth;
- mobile notification integration.

It does not need recovery intelligence to launch.

## Consultant Integration

Requires:

- stable Fiteatsy Client ID;
- CAP-001 correlation contract;
- CAP-003 assignment authority;
- trusted service authentication;
- relevant health/report APIs;
- projection/event contract.

## Reports

Report upload requires durable object storage before production.

Biomarker extraction depends on report lifecycle.

AI explanation depends on validated structured data.

## Rule

A downstream milestone may be designed before its dependencies are implemented, but production implementation must not bypass unresolved authoritative dependencies.
