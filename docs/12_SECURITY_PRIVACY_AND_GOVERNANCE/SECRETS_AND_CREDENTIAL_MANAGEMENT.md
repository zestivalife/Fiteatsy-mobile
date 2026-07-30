# Fiteatsy — Secrets & Credential Management

## Secrets Include

- database credentials;
- OTP provider credentials;
- object-storage credentials;
- AI provider keys;
- service-to-service credentials;
- signing keys;
- webhook secrets.

## Rules

- no secrets committed to Git;
- no backend secrets in Expo public configuration;
- no secrets printed in Codex reports;
- environment-specific credentials;
- least-privilege credentials;
- rotation capability;
- revoke on confirmed exposure.

## Railway

Use Railway environment/secret configuration for backend runtime secrets.

## Mobile

Assume anything shipped in the mobile bundle can be extracted by a motivated user.

Therefore the app must not contain server secrets.

## Git History

Removing a secret from the latest file does not prove it never existed in Git history.

Confirmed historical exposure requires remediation/rotation, not only file deletion.
