# Fiteatsy — Mobile Security

## Local Storage

Do not treat ordinary AsyncStorage as an appropriate location for long-lived high-value secrets.

Authentication credentials should use an approved secure storage mechanism where supported.

## Cached Health Data

Minimise sensitive data cached locally and define cleanup/logout behaviour.

## Network

Production mobile traffic must use HTTPS.

Do not disable TLS verification.

## Debugging

Production builds must not expose:

- backend secrets;
- verbose sensitive logs;
- hidden demo authentication bypasses;
- developer-only endpoints.

## Deep Links / Notifications

Treat external links and notification payloads as untrusted input.

## Rooted/Jailbroken Devices

The product may add risk controls later, but device compromise cannot be fully prevented by application code.

## API Security

Never rely on mobile code secrecy. Backend authorization remains mandatory.
