# 13 Development Guidelines

## Purpose

Define how engineers and coding agents should structure, name, review, and evolve the Fiteatsy codebase.

## Scope

Applies to mobile, backend, shared domain code, and related practitioner integrations.

Related documents:

- [02 Platform Architecture](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/02_PLATFORM_ARCHITECTURE.md)
- [03 Domain Model](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/03_DOMAIN_MODEL.md)
- [14 Testing Guidelines](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/14_TESTING_GUIDELINES.md)

## Coding Standards

- Prefer explicit TypeScript contracts
- Keep business rules out of presentation components
- Keep calculations deterministic and centrally owned
- Use descriptive domain naming over vague utility naming

## Folder Structure

- `src/` for mobile UI, local utilities, and client data models
- `backend/src/` for API, services, domain logic, and persistence layers
- `docs/` for official platform documentation

## Repository Pattern

- Services should call repository interfaces, not storage details directly
- In-memory stores may exist temporarily but should honor the same repository contract intended for PostgreSQL

## Service Pattern

- validate input in routes
- execute domain logic in services
- centralize lifecycle, readiness, and assignment logic
- emit timeline and health events from service or lifecycle boundaries

## Naming Conventions

- Use domain names from the docs: `healthProfile`, `nutritionProfile`, `careCase`, `healthTicket`
- Use `dateOfBirthISO`, not ambiguous date labels
- Use `calculatedAge` only for derived values

## Git Workflow

- Small, coherent changes
- Separate docs, UX, and domain logic concerns when possible
- Never silently change canonical terminology without updating docs

## Commit Conventions

Suggested format:

- `feat(platform): add care case assignment endpoint`
- `docs(platform): define event catalog`
- `fix(mobile): align health profile completion contrast`

## Pull Request Guidelines

PRs should include:

- business intent
- affected domains
- API or schema impact
- migration risk
- testing evidence
- documentation impact

## Testing Expectations

- unit coverage for calculations and lifecycle logic
- integration coverage for route/service interactions
- smoke validation for critical user journeys

## Responsibilities

- Engineers preserve domain boundaries
- Reviewers reject duplicated business logic or conflicting vocabulary
- AI coding agents must update docs when architecture meaning changes

## Future Expansion Notes

- Introduce shared schema packages only when repo boundaries require it
- Add contract generation and linting for API schemas

## Implementation Considerations

- Front-end compatibility fields may persist during migration, but the canonical model must still be documented and enforced in backend services
