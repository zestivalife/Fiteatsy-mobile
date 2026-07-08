# 14 Testing Guidelines

## Purpose

Define how Fiteatsy validates correctness, safety, performance, and accessibility across the platform.

## Scope

Covers mobile, backend, contracts, platform rules, dashboards, and AI-adjacent evaluation.

Related documents:

- [05 API Contract](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/05_API_CONTRACT.md)
- [08 Clinical Validation Engine](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/08_CLINICAL_VALIDATION_ENGINE.md)
- [15 Deployment Guide](/Users/l.paunikar/Desktop/fiteatsy-mobile/docs/15_DEPLOYMENT_GUIDE.md)

## Unit Testing

Must cover:

- age calculation from DOB
- BMI and waist-to-height calculations
- nutrition profile completion scoring
- readiness threshold behavior
- lifecycle transition validation

## Integration Testing

Must cover:

- health profile patch -> recalculation -> care-case response
- report milestone sync -> timeline/event/ticket updates
- consultant assignment -> notification and case visibility updates

## End-To-End Testing

Priority journeys:

1. Quick setup to health profile completion
2. Blood report upload to consultant-ready case
3. Consultant assignment to mobile visibility
4. Draft review to published plan

## API Testing

- route validation and error envelopes
- auth and role behavior
- backward-compatibility checks for transition fields

## Performance Testing

- report upload and processing throughput
- dashboard intelligence range filter responsiveness
- timeline and ticket retrieval under growing event volume

## Accessibility Testing

- dark mode contrast on cards and grey surfaces
- form labels and screen-reader semantics
- keyboard and focus behavior in web dashboard
- motion sensitivity and reduced-motion support

## Security Testing

- auth bypass attempts
- role-scoped access leaks
- signed attachment access
- rate-limit behavior

## AI Testing

- prompt regression tests
- hallucination checks against structured biomarker inputs
- confidence threshold behavior
- approval gating for publish flows

## Test Data Strategy

- use realistic but synthetic health profiles and biomarkers
- include incomplete, contradictory, and high-risk scenarios
- maintain regression fixtures for lifecycle and event flows

## Responsibilities

- Engineering owns automated tests
- QA owns journey validation and regression coverage
- Clinical stakeholders should review high-risk scenario expectations

## Future Expansion Notes

- add contract tests for dashboard intelligence APIs
- add event replay tests for analytics and AI context pipelines

## Implementation Considerations

- Local smoke tests are useful but not sufficient; platform logic should accumulate formal automated coverage as persistence is introduced
