# Fiteatsy — End-to-End Consultant Integration Sequence

## A. Fiteatsy Client Creation

```text
User
 |
 v
Fiteatsy Mobile
 |
 v
Fiteatsy Backend
 |
 +--> Account
 |
 +--> Fiteatsy Client
 |
 +--> CAP-001 Person correlation [when applicable]
 |
 +--> Outbox / Projection Change
          |
          v
     Consultant Backend
          |
          v
     Client Projection
```

## B. Practitioner Assignment

```text
Consultant Admin / Workflow
          |
          v
        CAP-003
          |
          v
Practitioner <-> Fiteatsy Client Assignment
```

Fiteatsy does not create this authorization merely because the client synced.

## C. Practitioner Opens Client

```text
Practitioner
    |
    v
Consultant
    |
    v
CAP-003 verifies assignment
    |
    v
Fiteatsy Trusted API
    |
    +--> Health Trends
    +--> Reports / Biomarkers
    +--> Progress
    +--> Approved Context
```

## D. New Health Data

```text
Wearable
   |
   v
Fiteatsy Mobile
   |
   v
Fiteatsy Backend
   |
   +--> Persist Health Data
   +--> Recalculate Approved Derived Context
   +--> Emit Minimal Change/Freshness Event
             |
             v
        Consultant Projection
```

## E. Practitioner Intervention

A Practitioner-authored plan/intervention should remain owned by its approved capability (for example CAP-003/CAP-005).

Fiteatsy consumes the approved context needed to present/track the programme; it does not silently become the authority for professional decisions.
