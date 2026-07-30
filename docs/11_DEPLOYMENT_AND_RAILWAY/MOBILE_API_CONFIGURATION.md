# Fiteatsy — Mobile API Configuration

## Current Problem to Remove

The existing app historically derived a port-4001 backend from Expo host/localhost.

That is suitable for local development, not production.

## Target

The mobile application must resolve API base URL by environment/build configuration.

Conceptually:

```text
Development -> local backend
Staging     -> Railway staging API
Production  -> Railway production API
```

## Requirements

- no hardcoded production URL scattered across service files;
- one governed API configuration source;
- no production localhost fallback;
- HTTPS for deployed API;
- environment visible in diagnostic/dev tooling where appropriate.

## Expo

Only non-secret API endpoint configuration may be exposed to the app.

Backend secrets must never be placed in Expo public environment variables.

## Failure

If production API configuration is missing, fail clearly rather than silently switching to demo/local data.
