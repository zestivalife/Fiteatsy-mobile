# Fiteatsy — Biomarker Registry & Units

**Status:** TARGET; REGISTRY CONTENT NOT YET FROZEN

## Registry Purpose

Provide governed identifiers and metadata for biomarkers supported by Fiteatsy.

## Conceptual Registry Entry

May include:

- canonical biomarker code;
- canonical display name;
- synonyms/source labels;
- data type;
- canonical unit;
- permitted source units;
- deterministic conversion rules;
- category/system;
- comparison eligibility;
- user-display eligibility;
- Practitioner-display eligibility;
- interpretation policy reference.

## Registry Governance

Adding a biomarker should be an explicit change, not an arbitrary database insert from an extraction model.

## Versioning

Registry and conversion rules should be versioned when changes could affect historical normalisation.

## Derived Parameters

A calculated/derived parameter must be identified as calculated.

It must not masquerade as a laboratory-measured biomarker.

## Guard

Do not ask Codex to invent a complete clinical biomarker catalogue from general knowledge.

Start with a governed launch set derived from approved product/report use cases.
