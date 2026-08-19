# ADR: Zestiva to Fiteatsy Delegated Authority

## Status

Phase 1 implementation. Production activation requires coordinated key configuration and deployment in both services.

## Decision

Zestiva issues short-lived RS256 server-to-server tokens for Fiteatsy operations. The token is carried in `X-Zestiva-Delegation`, never in browser access-token responses. It includes issuer, subject, audience, timestamps, unique `jti`, product, permissions, purpose, and actor type. Fiteatsy verifies the signature and every binding before an operation-specific route may proceed.

Ordinary Owner Console bearer JWTs are not accepted by this middleware. Replay protection is represented by a TTL-aware store interface; production must provide a shared Redis-backed implementation before multi-instance privileged operations are enabled.

## Configuration

The gateway uses `FITEATSY_DELEGATION_PRIVATE_KEY`, `FITEATSY_DELEGATION_KEY_ID`, issuer, audience, and TTL. Fiteatsy uses `ZESTIVA_DELEGATION_PUBLIC_KEY`, key id, issuer, audience, and clock skew. Key material is supplied only through deployment secret management.

## Phase 2 operation bridge

The Owner Console browser calls only `/api/v1/platform/fiteatsy/*` with its existing Zestiva session. The gateway validates the `platform_owner` role, Fiteatsy entitlement, and the operation permission, then mints a purpose-bound delegation and calls `/v1/internal/delegated/*` on Fiteatsy. Delegated operations are mapped as follows:

| Operation | Permission | Purpose |
| --- | --- | --- |
| QA Client / Consultant provisioning | `fiteatsy.qa.identity.create` | `qa_provisioning` |
| Client assignment | `fiteatsy.client.assign` | `client_assignment` |
| Assignment revoke | `fiteatsy.client.assignment.revoke` | `client_assignment` |
| QA identity deactivation | `fiteatsy.qa.identity.deactivate` | `qa_provisioning` |
| QA session issuance | `fiteatsy.qa.session.issue` | `qa_session` |

The delegation token never reaches the browser. Correlation IDs and idempotency keys cross the gateway boundary; Fiteatsy stores completed operation responses in Redis and rejects an in-progress duplicate. Service failures are translated to stable owner-facing errors without returning token material or provider details. Fiteatsy audit events record the delegated actor and operation through the existing QA provisioning audit model.
