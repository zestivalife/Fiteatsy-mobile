# Fiteatsy — Environment Variables & Secrets

## Categories

Potential deployment configuration includes:

### Runtime

- environment name;
- port;
- public API/base URL metadata;
- log level.

### Database

- `DATABASE_URL`;
- connection/pool configuration where needed.

### Authentication

- session/security secrets if required by implementation;
- OTP provider credentials when a real provider is introduced.

### Object Storage

- storage endpoint;
- bucket/container;
- access credentials;
- signing configuration.

### AI / Report Processing

Provider API credentials only when approved.

### Consultant Integration

Machine-to-machine service credentials only after the trusted integration contract is implemented.

## Rules

- never commit production secrets;
- never place backend secrets in Expo public configuration;
- use Railway/environment secret management;
- separate staging and production secrets;
- rotate credentials after confirmed exposure;
- do not print secrets in deployment reports.

## Mobile Configuration

Only values safe for distribution to every app user may be included in the mobile application bundle.
