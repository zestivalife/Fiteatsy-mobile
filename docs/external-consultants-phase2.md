# External Consultant Phase 2

## Architecture

The Expo application calls only the authenticated Fiteatsy backend under `/v1/external-consultants`. The backend verifies the normal Fiteatsy session and creates a short-lived RS256 assertion for the Zestiva practice-operations service. No signing key, Zestiva credential, or caller-supplied user identity is accepted from mobile.

For consultant health reads, practice-operations verifies the authenticated tenant, consultant, active relationship, and consent scopes. It then creates a one-time 60-second RS256 delegated assertion and reads canonical Fiteatsy profile, report, biomarker, and wearable repositories. Original report bytes are proxied through authenticated endpoints with `Cache-Control: no-store`; no permanent document URL is issued.

## Fiteatsy configuration

- `EXTERNAL_FITEATSY_CONNECTION_ENABLED=false` until coordinated activation.
- `EXTERNAL_FITEATSY_BASE_URL`: internal/gateway URL for practice-operations.
- `EXTERNAL_FITEATSY_ASSERTION_PRIVATE_KEY`: RS256 private key, stored only in the backend secret manager.
- `EXTERNAL_FITEATSY_ASSERTION_KEY_ID`: active inbound-verification key identifier.
- `EXTERNAL_FITEATSY_ASSERTION_ISSUER=fiteatsy-auth-service`.
- `EXTERNAL_FITEATSY_ASSERTION_AUDIENCE=practice-operations-service`.
- `ZESTIVA_DELEGATION_PUBLIC_KEY`: public half of the practice-operations outbound key.
- `ZESTIVA_DELEGATION_KEY_ID`: must match practice-operations.
- `ZESTIVA_DELEGATION_ISSUER=zestiva-platform`.
- `ZESTIVA_DELEGATION_AUDIENCE=fiteatsy-backend`.
- Production delegated replay protection requires Redis.

## Activation and rollback

1. Apply the practice-operations migrations through `0058_fit_active_plan` in staging. This includes replay-safe redemption and one authoritative active external plan selection per Fiteatsy user.
2. Configure both public/private key pairs and verify issuer, audience, and key IDs.
3. Keep all external flags false while running forged, expired, wrong-audience, replay, cross-tenant, revoked-relationship, and missing-scope tests.
4. Enable connection, health, diet publication, and scheduling flags individually in staging.
5. Validate two simultaneous consultants and confirm disconnecting one does not affect the other.
6. Roll back by disabling flags. Do not drop additive tables; retain consent and audit history.

Rotate keys by publishing the new public key/key ID first, switching the signer second, and retiring the previous verification key only after the maximum assertion lifetime and in-flight request window have elapsed.

## Known release gates

Production activation requires real staging service URLs, managed signing keys, migrated PostgreSQL, Redis-backed replay protection, and a complete cross-application E2E run. Mobile UI/build success alone is not production acceptance.

## Canonical nutrition completion

Approved external plans are ingested through `POST /v1/internal/external-consultant-access/:userId/diet-plans` using a 60-second, connection-bound delegated assertion. The endpoint requires `DIET_PLANS` consent, validates the complete Fiteatsy nutrition contract, and rejects meal components that do not reference active verified catalogue foods.

Source system, connection, plan, and source-version identities are retained on canonical plan records, making retries idempotent. Plans from different consultants remain independent. An explicit client selection made through `PUT /v1/internal/external-consultant-access/:userId/diet-plans/active` drives the existing daily schedule, diary, and adherence engine.
