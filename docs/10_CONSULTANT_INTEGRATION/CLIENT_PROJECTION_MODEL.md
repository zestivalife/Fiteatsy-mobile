# Fiteatsy — Client Projection Model

## Purpose

Give Consultant enough local information to identify and organise Fiteatsy clients without replicating their full health record.

## Candidate Projection

A minimal projection may contain:

- `fiteatsy_client_id`;
- CAP-001 person reference where available;
- product = FITEATSY;
- lifecycle/status;
- approved display context;
- latest Fiteatsy update/version;
- health-data freshness summary;
- projection timestamp.

Exact fields require contract approval.

## Excluded by Default

Do not automatically replicate:

- raw wearable observations;
- complete medical reports;
- all biomarker history;
- medication detail;
- AI narratives;
- private app settings.

## Projection Ownership

The Consultant copy is a projection.

Fiteatsy remains authoritative.

## Version

Projection updates should include a source version or monotonic update contract so stale events cannot overwrite newer state.

## Deactivation

If a Fiteatsy Client becomes inactive/deleted according to approved lifecycle rules, Consultant must receive the appropriate lifecycle update rather than retaining an unexplained active projection.
