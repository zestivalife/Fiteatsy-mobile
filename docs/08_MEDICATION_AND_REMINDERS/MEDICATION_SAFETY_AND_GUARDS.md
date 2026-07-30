# Fiteatsy — Medication Safety & Guards

## Product Boundary

Fiteatsy medication functionality is organisational/reminder functionality unless a future separately governed clinical capability is approved.

## Do Not

- recommend starting a prescription medication autonomously;
- recommend stopping medication autonomously;
- modify dose based solely on wearable/report data;
- claim a reminder action proves ingestion;
- infer non-adherence solely from missing app interaction;
- expose medication data to Consultant without authorization;
- generate medication changes from an LLM and present them as professional instructions.

## Missed Reminder

A missed app reminder is not automatically a missed dose.

The user may have taken medication without interacting with Fiteatsy.

## Health Intelligence

Medication/adherence context may eventually be one input to longitudinal review, but causal claims require appropriate methodology.

## Emergency Behaviour

Medication reminders are not an emergency medication-delivery or safety system.

## Privacy

Medication names and schedules can be sensitive.

Use data minimisation in notifications, logs and cross-system APIs.
