# Fiteatsy — API Architecture

## API Consumers

```text
Fiteatsy Mobile
      |
      v
User API Boundary
      |
      v
Fiteatsy Backend
      |
      +---- PostgreSQL
      +---- Object Storage
      +---- Workers / Providers

Consultant / Zestiva Backend
      |
      v
Trusted Service API Boundary
      |
      v
Fiteatsy Backend
```

## API Families

Target logical families:

```text
/v1/auth/*
/v1/client/*
/v1/health/*
/v1/reports/*
/v1/biomarkers/*
/v1/medications/*
/v1/progress/*
/v1/integrations/*
```

Exact routes are not frozen merely by appearing in architecture documentation.

## Contract Rules

Every endpoint must define:

- caller;
- authentication type;
- authorization rule;
- request contract;
- response contract;
- source authority;
- idempotency behaviour where relevant;
- pagination/cursor behaviour where relevant;
- error behaviour;
- sensitive-data classification;
- audit requirement where relevant.

## API Gateway

A separate gateway is not required for the initial Fiteatsy deployment.

The Express application may remain the API boundary until multiple deployable services justify gateway extraction.

## Database Rule

No API consumer receives direct database access.
