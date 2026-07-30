# Fiteatsy — System Boundary Map

## Fiteatsy

Owns consumer/mobile health experience and Fiteatsy product data.

## Consultant

Owns professional workflow/composition.

## CAP-001

Owns ecosystem Person identity and IAM contracts.

## CAP-003

Owns Practitioner-client assignment and professional authorization.

## Nuetra / CAP-002

Owns Nuetra/Corporate Health client participation.

## Cross-System Pattern

```text
CAP-001 Person
    |
    +--> Nuetra Client (CAP-002)
    |
    +--> Fiteatsy Client (CAP-011)

Practitioner
    |
    v
CAP-003 Assignment
    |
    +--> authorised Nuetra context
    |
    +--> authorised Fiteatsy context
```

## Database Boundary

No direct cross-product table access is an approved integration mechanism.

Use APIs, projections, events and reconciliation.
