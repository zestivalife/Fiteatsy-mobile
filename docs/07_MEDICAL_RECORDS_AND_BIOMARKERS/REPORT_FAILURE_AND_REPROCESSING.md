# Fiteatsy — Report Failure & Reprocessing

## Principle

Processing failure must not destroy the original medical record.

## Failure Types

Examples:

- unsupported format;
- corrupt file;
- extraction failure;
- OCR failure;
- ambiguous table;
- unresolved biomarker;
- provider/model timeout;
- processing worker failure.

## Failure State

Store:

- processing status;
- safe failure code;
- attempt count;
- processor version;
- timestamps;
- correlation identifier.

Avoid storing unnecessary sensitive raw exception payloads.

## Retry

Retry only when appropriate.

Permanent input errors should not loop indefinitely.

## Reprocessing

Reprocessing may be required when:

- extraction technology improves;
- biomarker mappings change;
- a bug is fixed;
- user/Practitioner requests an approved retry.

## Version Integrity

New processing results should not silently erase the provenance of historical processing.

## Partial Success

A report may yield some valid biomarkers and some unresolved items.

The data model should support partial processing rather than treating the entire report as either perfect or useless.
