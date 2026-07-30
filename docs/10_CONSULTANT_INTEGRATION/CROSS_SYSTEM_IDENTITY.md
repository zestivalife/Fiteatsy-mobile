# Fiteatsy — Cross-System Identity

## Identity Chain

Target conceptual relationship:

```text
CAP-001 Person
      |
      +--------------------+
      |                    |
      v                    v
Nuetra Client        Fiteatsy Client
CAP-002              Fiteatsy / CAP-011
```

A person may participate in one or both products.

## Required References

Fiteatsy should eventually maintain:

- internal Fiteatsy Client identity;
- stable external `fiteatsy_client_id`;
- governed CAP-001 Person reference when correlation exists.

Consultant should use governed external references rather than Fiteatsy's internal database primary keys.

## Never Use as Permanent Cross-System Identity

- email;
- mobile number;
- name;
- device ID;
- report ID;
- subscription ID.

These may assist verified account workflows but are not durable global identity keys.

## Correlation

Account creation does not automatically prove that a CAP-001 Person correlation already exists.

The correlation lifecycle must define:

- creation;
- verification/linking;
- conflict handling;
- merge/reconciliation;
- unlink/deactivation where required.

## Product Independence

A Fiteatsy Client can exist before Practitioner assignment.

A Practitioner assignment can never be inferred merely from identity correlation.
