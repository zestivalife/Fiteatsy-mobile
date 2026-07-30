# Fiteatsy — Medical Report Security

## Storage

Original report binaries belong in approved private durable object storage.

Do not use:

- permanent public URLs;
- Git;
- mobile source bundle;
- Railway ephemeral filesystem as authoritative storage.

## Access

Report retrieval requires object-level authorization.

Short-lived signed access may be used after backend authorization if approved.

## Processing

Processing workers should receive only the access required for the current job.

## Temporary Files

If processing creates temporary files:

- minimise lifetime;
- restrict permissions;
- remove after processing;
- avoid accidental logs/backups.

## Extracted Data

Extracted text and biomarkers are sensitive even when separated from the original PDF.

## Practitioner

Raw report access requires CAP-003/professional access policy and audit where approved.
