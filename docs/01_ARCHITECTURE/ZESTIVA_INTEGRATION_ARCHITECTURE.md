# Fiteatsy — Zestiva Integration Architecture

**Status:** TARGET; NOT YET IMPLEMENTED

## 1. Objective

Fiteatsy participates in the Zestiva ecosystem while retaining authority for Fiteatsy-owned health/product data.

The Consultant / Practitioner system provides professional monitoring and intervention workflows.

## 2. System Relationship

```text
                         CAP-001 PERSON
                              |
                  +-----------+-----------+
                  |                       |
                  v                       v
             Nuetra Client          Fiteatsy Client
                CAP-002                CAP-011
                  |                       |
                  +-----------+-----------+
                              |
                              v
                    Consultant Platform
                  Product Client Projection
                              |
                              v
                            CAP-003
                   Practitioner Assignment
                              |
                              v
                    Practitioner Workspace
```

## 3. Source Ownership

Fiteatsy remains authoritative for Fiteatsy-owned state.

Consultant stores governed projections and practitioner workflow state.

Direct database sharing is prohibited.

## 4. Consultant Data Needs

The Consultant platform may require two categories.

### A. Synchronised operational projection

Small, query-efficient fields such as:

- source product;
- external Fiteatsy client reference;
- CAP-001 Person reference once available;
- display context;
- product/client status;
- source version;
- source timestamps;
- last synchronization metadata.

### B. Authorised health context

Depending on approved use cases:

- latest health metrics;
- health trends;
- biomarker observations/trends;
- report analysis summaries;
- recovery/improvement indicators;
- relevant adherence/intervention context;
- medication context only if specifically approved.

Detailed/raw data should remain Fiteatsy-owned unless there is a justified replication requirement.

## 5. Practitioner Authorization

CAP-003 determines which practitioner may access which client.

Correct request path:

```text
Practitioner
     |
     v
Consultant Backend
     |
     v
CAP-003 Assignment Check
     |
     | authorised
     v
Fiteatsy Trusted API
     |
     v
Fiteatsy Health Context
```

Fiteatsy profile existence, subscription, care case or legacy consultant/mentor fields must not become platform Practitioner authorization.

## 6. Integration Modes

The architecture should support a combination of:

### Projection synchronization
Used for small operational client state required for Consultant lists/search/composition.

### Events
Used to propagate meaningful lifecycle/data changes after durable event/outbox architecture is approved.

### Trusted query APIs
Used for detailed or freshness-sensitive health context that should remain in Fiteatsy.

### Reconciliation
Used to detect and repair missed/out-of-order projection updates.

## 7. Near-Real-Time Monitoring

"Near-real-time" means the Consultant platform can access the latest successfully synchronized Fiteatsy data.

Every view should expose data freshness.

Do not promise continuous clinical telemetry.

## 8. Service-to-Service Security

Future Fiteatsy ↔ Consultant communication requires:

- trusted workload identity;
- authenticated service requests;
- authorization;
- scoped endpoints;
- auditability;
- rate controls;
- no mobile/user token masquerading as a backend service identity.

The exact mechanism is intentionally not frozen in this document.

## 9. Shared Capability Integration

Fiteatsy may consume shared platform capabilities through explicit contracts.

It must not assume all existing Nuetra microservices automatically apply to Fiteatsy.

Each integration requires ownership, API/event, security, failure and data-contract decisions.
