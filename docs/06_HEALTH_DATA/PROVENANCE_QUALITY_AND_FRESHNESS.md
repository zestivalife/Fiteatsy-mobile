# Fiteatsy — Provenance, Quality & Freshness

## Provenance

Every observation should preserve enough context to answer:

- What metric is this?
- What source produced it?
- What device/application supplied it?
- When was it measured?
- When did Fiteatsy receive it?
- Was it measured, manually entered or calculated?

## Freshness

Conceptual timestamps:

```text
measured_at
received_at
last_synced_at
```

These represent different facts and must not be collapsed.

## Practitioner UI

Practitioner views should eventually show source freshness where relevant.

Examples:

- updated 10 minutes ago;
- last synced yesterday;
- no data since permission revoked.

## Quality

Some sources may expose quality/confidence metadata.

Fiteatsy should preserve meaningful provider quality metadata where available, but must not invent precision.

## Missing Data

Missing data means unknown/unavailable, not zero.

## Calculated Data

Derived metrics should record:

- calculation/methodology version;
- calculation timestamp;
- source/input coverage.

Calculated observations must remain distinguishable from directly measured observations.
