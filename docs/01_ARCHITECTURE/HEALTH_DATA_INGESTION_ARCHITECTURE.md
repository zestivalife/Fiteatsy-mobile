# Fiteatsy — Health Data Ingestion Architecture

**Status:** TARGET ARCHITECTURE

## 1. Two Integration Models

Fiteatsy must support two fundamentally different health-data acquisition patterns.

### A. Device-mediated health sources

Examples:

- Apple Health / HealthKit;
- Android Health Connect;
- health data exposed locally by supported apps/devices.

Pattern:

```text
Health Source
     |
     v
Operating-System Health Store
     |
     | user permission
     v
Fiteatsy Mobile
     |
     | authenticated sync
     v
Fiteatsy Health Ingestion API
     |
     v
Validation / Normalisation
     |
     v
Longitudinal Health Store
```

The Railway backend cannot assume it can directly poll data that is only available through the user's device/OS permissions.

### B. Cloud-provider integrations

Where a provider offers a suitable cloud API:

```text
Wearable / Health Provider Cloud
              |
       OAuth / Provider Auth
              |
              v
      Fiteatsy Integration Layer
              |
              v
      Validation / Normalisation
              |
              v
      Longitudinal Health Store
```

Webhook or polling strategies are provider-specific.

## 2. Canonical Health Observation

Provider-specific data should be normalised into a governed internal representation.

Conceptual fields may include:

- observation_id;
- fiteatsy client reference once approved;
- metric_type;
- value;
- unit;
- measured_at;
- received_at;
- source_provider;
- source_device/application;
- source_record_id where available;
- quality/confidence metadata where applicable;
- ingestion_version;
- provenance.

Exact schema is a later database/API contract.

## 3. Idempotency and Duplicates

Health platforms can resend overlapping historical windows.

Ingestion must therefore support:

- provider/source identifiers where available;
- deterministic deduplication strategy;
- idempotent writes;
- overlap-safe synchronization;
- source timestamps;
- update/correction handling.

Do not assume every received record is new.

## 4. Incremental Synchronization

Mobile synchronization should use bounded windows/checkpoints rather than repeatedly uploading the entire device history.

Conceptual flow:

```text
Last Successful Checkpoint
          |
          v
Read New/Changed Observations
          |
          v
Batch + Validate
          |
          v
Authenticated Upload
          |
          v
Server Acknowledgement
          |
          v
Advance Checkpoint
```

A failed upload must not advance the durable checkpoint.

## 5. Supported Metric Families

The architecture should allow governed support for metrics such as:

- steps/activity;
- sleep;
- heart rate;
- resting heart rate;
- HRV;
- SpO2;
- calories/energy;
- workout/activity duration;
- weight/body measurements;
- other approved device-derived metrics.

Support for a metric must be explicit. Availability varies by platform/device.

## 6. Data Freshness

Practitioner and user views must expose freshness.

A value should not be treated as "current" without its measurement and synchronization timestamps.

## 7. Consent and Revocation

Collection must be user-authorised.

The architecture must support:

- source permission awareness;
- disconnected/revoked source state;
- last successful synchronization;
- no silent assumption that missing data means a zero/healthy value.

## 8. Security

- device access uses platform permission mechanisms;
- mobile-to-backend sync requires authenticated Fiteatsy session;
- cloud provider credentials/tokens must be protected server-side where applicable;
- provider secrets must never be embedded in the mobile binary when they are intended to be confidential;
- ingestion endpoints require ownership and anti-replay/idempotency controls.

## 9. Consultant Consumption

The Consultant system should consume governed health context from Fiteatsy APIs/projections.

It should not ingest directly from Apple Health, Health Connect or wearable providers on behalf of Fiteatsy clients unless a separate architecture explicitly assigns that ownership.
