# Fiteatsy — AI Security & Governance

## AI Use Cases

Potential uses include:

- report extraction assistance;
- report summaries;
- longitudinal explanation;
- Practitioner summaries;
- recovery/progress explanation.

## Boundaries

AI must not become the hidden authority for:

- identity;
- authorization;
- numeric source values;
- unit conversion;
- medication prescribing;
- recovery score methodology.

## Data Sent to Providers

Before sending health data to an AI provider, define:

- approved provider;
- minimum required payload;
- retention/training settings;
- region/processing considerations;
- credentials;
- logging policy;
- model/version.

## Prompt Injection

Uploaded reports and user-entered text are untrusted input.

Document text must not be allowed to override system/developer instructions or invoke privileged actions.

## Output Validation

Structured AI output should be schema-validated before persistence/use.

## CAP-010

AI production capabilities should align with the approved CAP-010 platform governance contract when available.
