# Fiteatsy — Railway Target Architecture

## Initial Runtime

```text
Expo / React Native App
          |
          | HTTPS
          v
+---------------------------+
| Railway — Fiteatsy        |
|                           |
|  Fiteatsy API             |
|       |                   |
|       +--> PostgreSQL     |
|       |                   |
|       +--> Object Storage |
|       |    [provider TBD] |
|       |                   |
|       +--> Worker(s)      |
|            [when needed]  |
+---------------------------+
```

## Initial Deployment Principle

Start with the smallest operationally sound deployment:

1. one Fiteatsy backend service;
2. one Fiteatsy PostgreSQL service/database;
3. external/private object storage when medical-report upload is implemented;
4. worker service only when asynchronous workloads require it.

Do not create a Railway service for every logical backend module.

## Consultant System

Consultant remains a separate deployment/system.

```text
Fiteatsy Railway Project
          |
          | authenticated service integration
          v
Consultant / Zestiva Runtime
```

The systems communicate through governed APIs/events, not shared databases.

## Public Exposure

Only endpoints that must be externally reachable should receive public ingress.

Database services must not be treated as public application APIs.
