# Fiteatsy — Medical Records Platform

## Objective

Give each Fiteatsy Client a durable longitudinal medical-report history that can be converted into structured, traceable health information.

## High-Level Flow

```text
User
 |
 v
Report Upload
 |
 +------------------+
 |                  |
 v                  v
Private File     PostgreSQL
Storage          Metadata
 |                  |
 +--------+---------+
          |
          v
   Processing Pipeline
          |
          v
   Structured Extraction
          |
          v
   Biomarker Normalisation
          |
          v
   Validation / Quality State
          |
     +----+----------------+
     |                     |
     v                     v
User Report History   Practitioner Context
     |
     v
Longitudinal Comparison
```

## Product Responsibilities

The medical-records capability should support:

- secure report upload;
- report history;
- processing status;
- structured extraction;
- biomarker normalisation;
- provenance;
- historical comparison;
- user-friendly summaries;
- authorised Practitioner access;
- reprocessing when processing logic changes or fails.

## Not the Same as an EHR

Fiteatsy medical records are product health-management records.

This documentation does not claim that Fiteatsy is a hospital EHR/EMR or a statutory medical-record system.
