# Fiteatsy — Biomarker Normalisation

## Purpose

Laboratories can use different labels, units and reference ranges for the same underlying biomarker.

Fiteatsy needs a canonical layer without destroying source information.

## Example Concept

```text
Source Report
"Vitamin B12" | 180 | pg/mL
       |
       v
Canonical Mapping
BIOMARKER_B12
       |
       v
Normalised Observation
source_value = 180
source_unit  = pg/mL
canonical_value = ...
canonical_unit  = approved canonical unit
```

The example illustrates structure only and is not clinical interpretation.

## Normalisation Requirements

For each observation preserve:

- raw test label;
- canonical biomarker identifier if resolved;
- source value;
- source unit;
- canonical value/unit if conversion is valid;
- source reference range;
- specimen/report date;
- source report;
- extraction provenance;
- validation state.

## Ambiguity

If a test cannot be safely mapped, store it as unresolved rather than forcing it into the wrong canonical biomarker.

## Unit Conversion

Conversions must use deterministic, tested conversion rules.

An LLM must not be the authority for numeric unit conversion.

## Reference Ranges

Reference ranges can differ by laboratory, methodology and patient context.

Preserve the source report's range rather than replacing it with one universal Fiteatsy range.
