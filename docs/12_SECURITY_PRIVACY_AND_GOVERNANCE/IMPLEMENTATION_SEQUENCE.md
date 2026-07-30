# Fiteatsy — Security Implementation Sequence

## S0 — Security Baseline Audit

Perform a narrow repository audit against this package.

Identify only concrete gaps in:

- auth/session;
- object authorization;
- secrets;
- mobile token storage;
- sensitive logs;
- CORS/network configuration;
- report storage;
- production bypasses.

## S1 — Close Authentication Risks

Verify/harden the Phase 1B session implementation in Railway staging.

## S2 — Object Authorization Tests

Add negative tests for all sensitive client-owned resources.

## S3 — Mobile Credential Storage

Move production session credentials to an approved secure mobile storage mechanism if not already done.

## S4 — Secrets & Environment Isolation

Verify Railway staging/production separation and Git secret hygiene.

## S5 — Health Data Controls

Review permissions, local caching, logs and API payload minimisation.

## S6 — Report Security

Implement before medical-report production launch.

## S7 — Consultant Security

Implement service identity + CAP-003 enforcement + audit before cross-system health access.

## S8 — AI Security

Implement alongside each approved AI capability, not as an afterthought.

## S9 — Production Security Acceptance

Run the production security gate and preserve evidence.

## Credit Efficiency Rule

Do not ask Codex for a broad 'make the app secure' task.

Audit one security layer, implement the verified gaps, test it, then proceed to the next layer.
