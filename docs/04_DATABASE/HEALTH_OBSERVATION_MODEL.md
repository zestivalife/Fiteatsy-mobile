# Fiteatsy — Health Observation Model

## Objective

Create a canonical representation that prevents Apple Health, Health Connect and provider-specific formats from leaking through the entire platform.

## Conceptual Fields

A health observation may require:

- observation_id;
- client_ref;
- metric_type;
- value;
- unit;
- measured_at;
- received_at;
- source_type;
- source_provider;
- source_record_id;
- device/application metadata where appropriate;
- provenance;
- quality/confidence metadata where applicable;
- ingestion_version;
- created_at;
- updated_at.

Exact field names remain implementation decisions until schema approval.

## Metric Registry

Metric types and canonical units should be governed rather than arbitrary strings.

Examples:

- steps;
- sleep duration;
- heart rate;
- resting heart rate;
- HRV;
- SpO2;
- weight;
- workout duration;
- energy expenditure.

## Deduplication

The system must expect overlapping sync windows.

Deduplication may use provider/source IDs and/or deterministic source keys.

Never deduplicate solely on value + timestamp without understanding source semantics.

## Time

Preserve the source measurement timestamp separately from server receipt time.

Timezone handling must be explicit.

## Corrections

Providers may revise historical records. The model must allow governed correction/upsert behaviour without creating uncontrolled duplicates.

## Missing Data

No observation is different from a zero observation.
