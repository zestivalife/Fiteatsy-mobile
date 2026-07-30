# Fiteatsy — Consultant Integration Architecture

## Target Architecture

```text
                    ZESTIVA ECOSYSTEM

 Fiteatsy Mobile
       |
       v
 Fiteatsy Backend
       |
       +---- Fiteatsy PostgreSQL
       |
       +---- Client Projection / Events --------+
       |                                         |
       +<--- Trusted Health Context API ---------+---- Consultant Backend
                                                       |
                                                       +---- Consultant DB
                                                       |
                                                       +---- CAP-003
                                                               |
                                                               v
                                                          Practitioner
```

## Ownership

### Fiteatsy owns

- Fiteatsy Client lifecycle;
- health profile/detail owned by Fiteatsy;
- wearable/health-app observations;
- medical reports;
- biomarkers;
- medication/reminder state;
- Fiteatsy recovery/progress results;
- Fiteatsy source freshness.

### Consultant owns

- professional workspace projections;
- Practitioner workflows;
- Practitioner notes/interventions where CAP-003 owns them;
- Practitioner UI state;
- assignment-derived work queues.

### CAP-001 owns

Platform Person identity/correlation.

### CAP-003 owns

Practitioner-to-client assignment and authorization.

## Integration Pattern

Use three mechanisms together:

```text
1. Minimal Client Projection
2. Durable Change Events
3. Trusted Query APIs
```

Do not solve every use case by copying the entire Fiteatsy dataset into Consultant.
