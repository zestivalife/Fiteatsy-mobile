# Fiteatsy — Railway Deployment Implementation Sequence

## D0 — Pre-Deployment Audit

Confirm:

- repository branch/remote;
- backend start command;
- Node/runtime requirements;
- migration behaviour;
- current environment-variable usage;
- health/version endpoints;
- no committed secrets.

This should be a narrow deployment audit, not another full architecture audit.

## D1 — Create Fiteatsy Railway Project

Create a separate Railway project for Fiteatsy.

Do not place Fiteatsy inside the Consultant database/runtime merely for convenience.

## D2 — Add PostgreSQL

Create dedicated Fiteatsy PostgreSQL and connect `DATABASE_URL`.

## D3 — Deploy Backend to Staging

Configure:

- repository;
- backend root/build/start commands;
- environment variables;
- staging domain.

## D4 — Close Phase 1B Runtime Verification

Run migrations and verify:

- auth;
- persisted account/session;
- profile/care persistence;
- restart persistence;
- ownership/security tests.

## D5 — Health / Version / Readiness

Add or harden endpoints if missing and verify expected Git SHA at runtime.

## D6 — Mobile Staging Configuration

Point a development/staging mobile build at the Railway staging API.

Verify real device/simulator flow.

## D7 — Production Environment

Create isolated production configuration/database after staging acceptance.

## D8 — Medical Report Storage

Add private durable object storage when report upload implementation begins.

## D9 — Workers

Deploy worker services only when asynchronous report/health/integration workloads are implemented.

## D10 — Consultant Connectivity

After the integration contract is ready, configure trusted backend-to-backend connectivity and service credentials.

## Credit Efficiency Rule

The next Codex task should cover D0 only: deployment-readiness audit of the current repository against these documents.

After D0, use small prompts for Railway-specific code/config changes. Do not ask Codex to redesign the architecture.
