# 17 Decision Log

## Purpose

Record major architecture and product decisions that define how Fiteatsy is built and why.

## Scope

This is the Architecture Decision Record log for the platform constitution.

Related documents:

- [00 Product Constitution](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/00_PRODUCT_CONSTITUTION.md)
- [02 Platform Architecture](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/02_PLATFORM_ARCHITECTURE.md)
- [03 Domain Model](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/03_DOMAIN_MODEL.md)

## ADR-001: Care Cases Are The Primary Entity

Decision:

- The platform orients operational care around `CareCase`, not around loose reports, chats, or tasks.

Why:

- It creates one anchor for stage, assignment, tickets, timeline, plans, and follow-up.

Consequence:

- New operational workflows should attach to a care case unless there is a strong reason not to.

## ADR-002: Timeline Is Event-Driven

Decision:

- Timeline entries are generated from domain events and lifecycle changes.

Why:

- Operational history must be reconstructable and explainable.

Consequence:

- Major actions should emit structured history rather than mutate invisible state only.

## ADR-003: Health Events Exist Separately From Timeline Events

Decision:

- Human-readable timeline items and replayable health events are distinct constructs.

Why:

- Staff need concise chronology, while automation and analytics need normalized machine events.

Consequence:

- Event publishers may create both forms from one action when necessary.

## ADR-004: Health Tickets Exist As First-Class Operational Objects

Decision:

- Risk, missing information, and follow-up obligations become trackable tickets.

Why:

- Important care work should not depend on memory or passive dashboard scanning.

Consequence:

- Validation and lifecycle engines must map certain conditions into tickets.

## ADR-005: AI Never Publishes Diets Directly

Decision:

- AI may create drafts, but only human-approved plans may be published.

Why:

- Clinical accountability and safety must remain human-led.

Consequence:

- All publish workflows require consultant review or an explicitly documented approval chain.

## ADR-006: Backend Owns Calculations

Decision:

- Age, BMI, readiness, stage logic, and related calculations are backend-owned.

Why:

- Canonical values must remain consistent across mobile, dashboard, and integrations.

Consequence:

- UI-side calculations are advisory only and must not become source of truth.

## ADR-007: Clinical Knowledge Base Is Separate From AI

Decision:

- Clinical knowledge is stored and governed independently from prompt content or model behavior.

Why:

- Medical logic requires review, versioning, and provenance.

Consequence:

- AI consumes knowledge snapshots and rule outputs rather than inventing its own policy layer.

## ADR-008: Consultants Approve AI Outputs

Decision:

- Consultants review, edit, accept, or reject AI-generated clinical artifacts.

Why:

- AI support must increase speed without removing human judgment.

Consequence:

- Dashboard UX must privilege reviewability and explainability over automation theatrics.

## ADR-009: DOB Replaces Manual Age Collection

Decision:

- Date of birth is the single source of truth; age is derived automatically.

Why:

- Manual age entry becomes stale and duplicates identity data.

Consequence:

- Compatibility bridges may temporarily infer DOB from historical age, but forward state should be DOB-first.

## ADR-010: Consultant Assignment Is Platform-Driven

Decision:

- Clients do not choose consultants during onboarding; the platform assigns them after program activation and care-case creation.

Why:

- Assignment quality depends on capacity, specialization, and operations, not client guesswork.

Consequence:

- Mobile surfaces assignment as synced state and must react automatically to reassignments.

## Responsibilities

- Architecture owners update this log for major changes
- Reviewers verify that implementation and docs stay aligned

## Future Expansion Notes

- Add ADRs for queue adoption, knowledge-base governance, and cross-brand architecture once those become material decisions

## Implementation Considerations

- This log should be updated whenever a change alters source-of-truth ownership, workflow control, or clinical safety boundaries
