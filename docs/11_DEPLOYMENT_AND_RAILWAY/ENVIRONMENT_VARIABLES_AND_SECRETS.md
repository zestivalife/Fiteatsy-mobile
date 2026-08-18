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

### Subscription Payments

- `RAZORPAY_KEY_ID` may be returned to the authenticated mobile checkout because Razorpay requires the public key id client-side.
- `RAZORPAY_KEY_SECRET` is server-only and must never be placed in Expo public configuration.
- `RAZORPAY_WEBHOOK_SECRET` is server-only and is required for `/v1/webhooks/razorpay` raw-body signature verification.
- `SUBSCRIPTION_EXPIRY_WARNING_DAYS` is optional and controls when `/v1/subscriptions/current` marks an active subscription as expiring soon.
- Payment activation must remain backend-authoritative: entitlements are granted only after server-side payment signature verification or verified Razorpay webhook processing.

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

`RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` must not be exposed through Expo, logs, error payloads, or client-side configuration. Only `RAZORPAY_KEY_ID` can be sent to the app as part of a checkout response.
