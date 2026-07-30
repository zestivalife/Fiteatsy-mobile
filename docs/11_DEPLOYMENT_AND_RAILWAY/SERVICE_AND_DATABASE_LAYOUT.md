# Fiteatsy — Railway Service & Database Layout

## Phase 1 Layout

### Fiteatsy API

Current technology:

- Node;
- Express;
- TypeScript.

Responsibilities include current API modules while the backend remains modular.

### PostgreSQL

Dedicated Fiteatsy authoritative relational database.

It stores Fiteatsy-owned structured state.

## Why Dedicated PostgreSQL

Fiteatsy and Consultant are separate bounded systems.

A shared PostgreSQL database would create:

- ownership ambiguity;
- direct table coupling;
- unsafe deployment dependencies;
- difficult authorization boundaries;
- difficult future service extraction.

Therefore Consultant should not share the Fiteatsy database.

## Future Worker

A worker may later be deployed from the same repository for:

- report processing;
- biomarker extraction;
- health ingestion processing;
- integration/event delivery;
- recovery recalculation.

## Future Service Extraction

Independent services are justified by operational requirements, not by the existence of logical modules.
