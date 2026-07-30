# Fiteatsy — 07 Medical Records & Biomarkers

**Document Group:** Medical Records, Report Intelligence & Biomarker Platform
**Status:** Target Contract + Safety Guardrails

## Purpose

Defines the Fiteatsy medical-report lifecycle from upload through secure storage, processing, structured extraction, biomarker normalisation, longitudinal comparison, user presentation and authorised Practitioner consumption.

This package does not approve a specific OCR, document-AI, LLM, object-storage or clinical-interpretation vendor.

## Documents

- `MEDICAL_RECORDS_PLATFORM.md`
- `REPORT_UPLOAD_AND_STORAGE.md`
- `REPORT_PROCESSING_PIPELINE.md`
- `BIOMARKER_NORMALISATION.md`
- `BIOMARKER_REGISTRY_AND_UNITS.md`
- `LONGITUDINAL_REPORT_COMPARISON.md`
- `REPORT_INSIGHTS_AND_AI_BOUNDARY.md`
- `PRACTITIONER_REPORT_CONTEXT.md`
- `REPORT_SECURITY_PRIVACY_AND_AUDIT.md`
- `REPORT_FAILURE_AND_REPROCESSING.md`
- `IMPLEMENTATION_SEQUENCE.md`

## Core Rule

The source report, extracted data, normalised biomarker, deterministic interpretation and AI-generated explanation are different artifacts and must remain distinguishable.
