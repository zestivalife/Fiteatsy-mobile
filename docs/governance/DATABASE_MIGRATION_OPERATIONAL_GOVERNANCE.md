# Database Migration Operational Governance

Application startup and database migration are separate authorities.

## Runtime contract

- API startup performs a read-only comparison of `schema_migrations` with the packaged migration set.
- A current schema logs `DATABASE_SCHEMA_STATUS` with status `CURRENT`.
- A missing migration logs status `MIGRATION_REQUIRED` and startup exits with `DATABASE_MIGRATION_REQUIRED`.
- API replicas never create the migration ledger or execute migration SQL.
- The existing PostgreSQL advisory lock remains the concurrency authority for an explicit migration job.

## Explicit migration command

```sh
npm --prefix backend run db:migrate
```

The command does not start the API. It reports the starting version, migrations applied, ending version, and result, closes the pool, and exits non-zero on failure.

## Deployment order

When a release contains migrations:

1. Verify the accepted application SHA.
2. Create the governed database backup or snapshot.
3. Run the explicit migration command as a one-off job.
4. Verify the migration ledger and database integrity.
5. Deploy the accepted application SHA.
6. Verify `/v1/version` matches the accepted SHA.
7. Run governed production smoke tests.

For a code-only release:

1. Deploy the accepted application SHA.
2. Verify `/v1/version`.
3. Run governed production smoke tests.

Implicit migration during application startup is prohibited in every environment. Local development and isolated test databases must run the explicit migration command or call the migration helper during their setup phase.

## Protected boundary

`DATABASE_MIGRATION_GOVERNANCE` is a P0.1 protected contract. Changes require freeze-impact review and the complete P0.1 regression suite. External Tenant A/B production smoke and QA-owned report/file reads remain non-blocking evidence gates; production data must not be manufactured to close them.
