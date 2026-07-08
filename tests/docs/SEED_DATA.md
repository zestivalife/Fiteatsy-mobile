# Seed Data

## Purpose

Provide reusable synthetic healthcare personas for API, service, validation, and future workflow testing.

## Source

Canonical persona definitions live in [personas.ts](/Users/l.paunikar/Desktop/fiteatsy-mobile/tests/fixtures/personas.ts).

## Personas

| Persona | Focus | Notes |
| --- | --- | --- |
| Healthy Female | baseline wellness | complete profile with minimal risks |
| PCOS | hormone balance | female profile with PCOS and weight goals |
| Prediabetes | sugar control | elevated metabolic risk journey |
| Hypothyroidism | thyroid support | medicine and endocrine care context |
| Vitamin D Deficiency | deficiency recovery | supplement-oriented use case |
| Anemia | blood health | micronutrient and fatigue recovery context |
| Pregnancy | maternal care | sensitive care scenario for future rule expansion |
| Postpartum | recovery | sleep and energy-focused support scenario |
| Obesity | weight and metabolic | high waist and weight-loss context |
| Incomplete Profile | missing data | validation and readiness negative case |

## Usage Rules

- Use only synthetic data
- Never mix real user data into automated tests
- Add condition-specific lab and report fixtures in future QA sprints
