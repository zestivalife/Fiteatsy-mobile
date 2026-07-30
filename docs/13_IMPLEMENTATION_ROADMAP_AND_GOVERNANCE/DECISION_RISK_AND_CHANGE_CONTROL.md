# Fiteatsy — Decision, Risk & Change Control

## Decision Categories

### Architecture Decision
Changes ownership, boundaries, data authority or integration.

### Product Decision
Changes user behaviour, scoring meaning, consent, lifecycle or professional workflow.

### Engineering Decision
Implementation technique within approved boundaries.

## Open Decisions

Examples currently requiring explicit approval include:

- Account → Fiteatsy Client cardinality;
- active Fiteatsy Client definition;
- deactivation/deletion semantics;
- CAP-001 external reference naming;
- recovery methodology;
- Practitioner medication visibility;
- exact report retention;
- production AI provider/use.

## Risk Register

Material risks should identify:

- description;
- affected capability;
- probability/impact where used;
- mitigation;
- owner;
- status.

## Contract Change

If implementation requires changing an approved contract:

1. stop at boundary;
2. document conflict;
3. propose change;
4. obtain approval;
5. update affected docs;
6. implement.

Do not silently make code the new architecture.
