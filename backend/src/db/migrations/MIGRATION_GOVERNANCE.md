# Database migration governance

Migrations are ordered lexicographically and identified in `schema_migrations.version` by their full filename. The numeric prefix is a human sequencing convention, not the ledger key.

Rules for all future migrations:

- Use the next unused four-digit prefix. Prefixes must be unique.
- Never rename, delete, or edit a production-applied migration.
- Reconcile defects with a new, forward-only migration that is transactional, production-safe, and idempotency-aware.
- Run the database governance contracts and a full fresh-database replay before release.
- After a migration is applied in production, add its SHA-256 to `applied-migrations.sha256.json` in the next accepted governance update.

Accepted immutable history:

- `0035_professional_names.sql` and `0035_subscription_plan_catalog_correction.sql` share prefix `0035`. Both are distinct full-filename ledger entries and were applied in production. They remain immutable and are the only allowed duplicate prefix.
- Production also records `0018_health_calculations.sql`. It was historically renamed to byte-identical `0019_health_calculations.sql` before this governance contract existed, and both ledger entries were applied. The ledger-only filename must not be recreated or replayed merely to normalize numbering.
- `0036_professional_identity_snapshot_backfill.sql` validates a fixed production identity snapshot and therefore cannot execute against a blank database. The migrator preserves the immutable SQL and records it without executing only when the run began with an empty ledger and none of its target identities exist. Existing or partially migrated databases continue to execute the original fail-closed migration.

The allow-list is intentionally exact. Adding another file under `0035`, or creating any other duplicate prefix, fails the governance contract.
