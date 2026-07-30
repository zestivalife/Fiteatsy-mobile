# Fiteatsy — Health Source Integration Model

## Device Flow

```text
Wearable
   |
   v
Apple Health / Health Connect
   |
   | OS permission
   v
Fiteatsy Mobile
   |
   | authenticated batch sync
   v
Fiteatsy Backend
```

The Railway backend cannot directly read a user's phone-only health store.

## Cloud Provider Flow

```text
Provider Cloud
     |
     | OAuth/API/Webhook
     v
Fiteatsy Integration Adapter
     |
     v
Health Ingestion
```

## Adapter Responsibility

Each adapter translates provider-specific concepts into Fiteatsy ingestion contracts.

It should handle:

- provider authentication;
- pagination/windowing;
- provider rate limits;
- source identifiers;
- provider units/types;
- provider errors;
- source metadata.

It must not define Fiteatsy's canonical clinical/product meaning by itself.

## Source Registry

Future implementation should maintain governed source identifiers rather than arbitrary UI strings.

Conceptual examples:

```text
APPLE_HEALTH
HEALTH_CONNECT
MANUAL
PROVIDER_<APPROVED_PROVIDER>
```

## Provider Addition Gate

Before adding a provider, document:

- required permissions/scopes;
- supported metrics;
- API availability;
- refresh/webhook model;
- rate limits;
- data ownership/terms;
- deletion/disconnect behaviour;
- secrets required;
- production approval.
