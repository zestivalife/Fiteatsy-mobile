# Fiteatsy — Intervention & Outcome Tracking

## Purpose

Allow longitudinal health changes to be viewed alongside approved interventions without confusing correlation with causation.

## Future Intervention Examples

- Practitioner diet-plan period;
- activity goal;
- nutrition programme;
- medication context;
- sleep/routine intervention;
- other approved programme actions.

## Timeline Model

```text
Baseline
   |
   v
Intervention Starts
   |
   +---- Wearable Trend
   +---- Biomarker Trend
   +---- User Check-ins
   |
   v
Review Point
```

## Outcome

Fiteatsy may show that health indicators changed during an intervention period.

It must not automatically claim the intervention caused the change.

## Practitioner Changes

Future Practitioner plan modifications should be versioned so progress can be reviewed against the correct intervention period.

## Integration Boundary

The authority for Practitioner-authored interventions may live in CAP-003/CAP-005 or another approved capability.

Fiteatsy should reference/synchronise governed intervention context rather than duplicate authority.
