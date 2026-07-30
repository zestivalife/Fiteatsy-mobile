# Fiteatsy — Medical Report & Biomarker Data Model

## Medical Report

Conceptual lifecycle:

```text
UPLOADED
   |
   v
STORED
   |
   v
PROCESSING
   |
   +--> COMPLETED
   |
   +--> FAILED
```

The original report should remain available even if processing fails.

## Report Metadata

May include:

- report_id;
- client_ref;
- storage_object_ref;
- original filename;
- MIME/content type;
- file integrity/hash metadata;
- report/lab date;
- uploaded_at;
- processing_status;
- processing_version;
- source/provenance;
- created_at / updated_at.

## Biomarker Observation

Conceptual fields:

- biomarker_observation_id;
- client_ref;
- report_ref;
- biomarker_code/name;
- raw label;
- value;
- canonical unit;
- source unit;
- reference range where available;
- abnormality flag where source/validated logic supports it;
- specimen/report date;
- extraction provenance;
- extraction confidence where applicable;
- validation state;
- created_at.

## Longitudinal Comparison

Comparison must use compatible biomarker identity and units.

A numeric increase is not automatically improvement.

## Extraction Safety

Extracted values must remain traceable to the source report.

AI-generated prose must never overwrite the extracted/validated biomarker record.

## File Storage

Report binaries should not be publicly accessible.

Database records reference private object storage.
