# Fiteatsy — Authentication & Session Security

## Current Direction

Phase 1B introduced backend-issued opaque sessions stored durably and Bearer authentication.

That is the baseline to verify and harden before production.

## Requirements

- server-generated account identity;
- securely generated session token;
- only a hash of opaque token stored where applicable;
- expiry;
- logout/revocation;
- authenticated `/me`;
- no client-provided user identity authority;
- no demo-user fallback in production;
- secure token transport/storage on mobile.

## OTP

OTP verification must include:

- expiry;
- attempt controls;
- replay protection;
- provider abuse/rate limiting;
- safe error responses.

## Session Restoration

Mobile may cache session credentials securely, but backend remains authoritative.

## Future

Refresh/session rotation can be added if required by the approved session model.

## Guard

Do not accept `userId`, `x-user-id`, email or mobile number as authorization merely because the client sends it.
