# Fiteatsy — Health Data Platform

## Objective

Build a longitudinal health-data layer that can accept heterogeneous health signals without making the rest of the product dependent on Apple, Google or any individual wearable provider's schema.

## Pipeline

```text
Health Source
   |
   v
Source Adapter
   |
   v
Validation
   |
   v
Canonical Normalisation
   |
   v
Deduplication / Correction
   |
   v
Authoritative Observation Store
   |
   +------------+-------------+
   |            |             |
   v            v             v
User Trends  Recovery      Practitioner
             Engine         Context
```

## Source Categories

### Device-mediated

Examples:

- Apple Health / HealthKit;
- Android Health Connect;
- data made available locally by connected health applications.

These generally require Fiteatsy Mobile to read authorised data and synchronise it to the backend.

### Cloud-mediated

Some wearable/platform providers expose cloud APIs.

These may support server-side OAuth, polling or webhooks.

Cloud integration is provider-specific and must not be assumed to exist for every device.

### User-entered

Manual measurements may be supported where explicitly approved.

They must remain distinguishable from device-measured or laboratory-derived data.

## Backend Authority

Once successfully synchronised, Fiteatsy's backend is authoritative for the Fiteatsy longitudinal copy of the observation and its ingestion metadata.

The external source remains the provenance/source of measurement.

## No Universal Availability

A metric appearing in the Fiteatsy capability map does not mean every user/device can provide it.
