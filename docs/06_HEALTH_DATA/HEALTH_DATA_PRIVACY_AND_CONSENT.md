# Fiteatsy — Health Data Privacy & Consent

**Status:** ARCHITECTURE REQUIREMENTS; LEGAL POLICY REQUIRES SEPARATE APPROVAL

## Permission

Device health access is user-authorised through operating-system/provider permission mechanisms.

Fiteatsy must respect revoked permissions.

## Purpose Limitation

Do not request every available health permission by default.

Request data categories that support approved product capabilities.

## Transparency

Users should be able to understand:

- which source is connected;
- what categories are being accessed;
- last sync state;
- how to disconnect/revoke where applicable.

## Minimisation

Do not transmit data to Consultant merely because Fiteatsy possesses it.

Professional access must have an approved purpose and authorization.

## Sensitive Logging

Health payloads should not be dumped into production logs by default.

## Deletion

Disconnecting a source and deleting historical Fiteatsy data are separate operations.

Exact deletion/retention policy must be approved.

## Guard

Engineering/Codex must not invent consent wording, statutory retention periods or regulatory compliance claims.
