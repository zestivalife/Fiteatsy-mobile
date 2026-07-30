# Fiteatsy — Practitioner Medication Context

**Status:** PRODUCT DECISION REQUIRED

## Default Position

Medication data should not automatically be exposed to every Practitioner simply because Fiteatsy stores it.

## If Approved

Authorised Practitioner context may eventually include:

- active medication list;
- user-entered dosage/schedule context;
- adherence summary;
- last user-reported action;
- data freshness;
- source label indicating user-entered information.

## Access Flow

```text
Practitioner
    |
    v
Consultant Backend
    |
    v
CAP-003 Authorization
    |
    v
Fiteatsy Trusted API
    |
    v
Approved Medication Context
```

## Important Labelling

Practitioner UI must distinguish:

- user-entered medication;
- professionally authored/prescribed data, if such a capability is ever introduced.

## No Prescribing

Consultant medication visibility does not give the Fiteatsy medication module authority to prescribe or modify treatment.
