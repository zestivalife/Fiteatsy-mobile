# Fiteatsy — Source of Truth Matrix

| Data / Decision | Authoritative Owner |
|---|---|
| Platform Person | CAP-001 |
| Fiteatsy Account | Fiteatsy auth/account domain |
| Fiteatsy Client | Fiteatsy/CAP-011 |
| Fiteatsy Client lifecycle | Fiteatsy/CAP-011 |
| Practitioner Assignment | CAP-003 |
| Wearable/health observations stored by Fiteatsy | Fiteatsy |
| Health source provenance | Fiteatsy |
| Medical report original | Fiteatsy private report storage |
| Report metadata | Fiteatsy |
| Extracted biomarkers | Fiteatsy, with source provenance |
| Medication records entered in Fiteatsy | Fiteatsy |
| Reminder schedule | Fiteatsy |
| Practitioner notes/interventions | Approved Consultant capability, typically CAP-003/CAP-005 depending on domain |
| Recovery methodology | Approved Fiteatsy methodology contract |
| Recovery result | Fiteatsy derived state |
| AI-generated explanation | Derived artifact, not source truth |
| Consultant Fiteatsy client copy | Projection only |
| Nuetra Client | CAP-002 |
| Nuetra Programme Participation | CAP-002 |

## Rule

A projection, cache or AI output must never silently become the authority for its source domain.
