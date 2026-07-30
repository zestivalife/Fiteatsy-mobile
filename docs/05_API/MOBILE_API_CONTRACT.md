# Fiteatsy — Mobile API Contract

## Trust Model

The mobile application is an untrusted client.

It authenticates as the Fiteatsy user/account and must never receive service-to-service credentials.

## Core Mobile API Responsibilities

### Authentication

Current family:

```text
/v1/auth/*
```

Supports account authentication/session lifecycle.

### Client / Profile

Target responsibilities:

- retrieve current Fiteatsy client context;
- update allowed health/profile fields;
- retrieve lifecycle/status required by the app.

Client identity depends on Phase 1C.

### Health

Target responsibilities:

- submit authorised health observations;
- retrieve longitudinal health history/trends;
- retrieve sync/freshness state.

### Reports

Responsibilities:

- create report/upload intent;
- upload or obtain controlled upload mechanism;
- list report history;
- retrieve report processing status;
- retrieve authorised report analysis/biomarker context.

### Medication

Responsibilities:

- maintain user medication records;
- manage reminder schedules;
- retrieve current/history state as approved.

### Progress

Responsibilities:

- retrieve daily/current progress indicators;
- retrieve historical progress;
- retrieve explanation/context.

## Offline Behaviour

The app may queue/retry suitable operations.

A local write is not considered server-authoritative until acknowledged by the backend.

## Ownership

The backend derives the current account/client from authenticated context.

The mobile app must not select arbitrary owner IDs to access another user's data.
