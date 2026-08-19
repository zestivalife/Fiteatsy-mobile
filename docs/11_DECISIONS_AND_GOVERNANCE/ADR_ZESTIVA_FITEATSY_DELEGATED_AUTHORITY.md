# ADR: Zestiva to Fiteatsy Delegated Authority

## Status

Phase 1 implementation. Production activation requires coordinated key configuration and deployment in both services.

## Decision

Zestiva issues short-lived RS256 server-to-server tokens for Fiteatsy operations. The token is carried in `X-Zestiva-Delegation`, never in browser access-token responses. It includes issuer, subject, audience, timestamps, unique `jti`, product, permissions, purpose, and actor type. Fiteatsy verifies the signature and every binding before an operation-specific route may proceed.

Ordinary Owner Console bearer JWTs are not accepted by this middleware. Replay protection is represented by a TTL-aware store interface; production must provide a shared Redis-backed implementation before multi-instance privileged operations are enabled.

## Configuration

The gateway uses `FITEATSY_DELEGATION_PRIVATE_KEY`, `FITEATSY_DELEGATION_KEY_ID`, issuer, audience, and TTL. Fiteatsy uses `ZESTIVA_DELEGATION_PUBLIC_KEY`, key id, issuer, audience, and clock skew. Key material is supplied only through deployment secret management.
