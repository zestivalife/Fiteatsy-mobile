# Fiteatsy — Data Retention & Deletion Architecture

**Status:** POLICY FRAMEWORK; EXACT RETENTION PERIODS NOT YET APPROVED

## Distinguish These Operations

- inactive;
- archived;
- soft-deleted;
- user-requested deletion;
- anonymised/de-identified;
- legally retained;
- physically deleted.

They are not interchangeable.

## Health Data

Health observations, reports and biomarkers may have different retention requirements from account/session data.

Exact periods must be approved before production policy freeze.

## Account Deletion

Deleting authentication credentials must not automatically trigger uncontrolled deletion of health records without an approved lifecycle.

## Medical Reports

Deletion must account for:

- database metadata;
- private object storage;
- derived biomarker records;
- cached/processed artifacts;
- integration projections.

## Consultant Projection

When Fiteatsy client state changes or is deleted, Consultant projection handling must follow the approved cross-system lifecycle rather than retaining unexplained stale records.

## Backups

Deletion policy must account for backup retention and restoration behaviour.

## Guard

Codex/engineering must not invent legal/clinical retention periods.
