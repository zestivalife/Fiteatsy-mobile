# P0.1 Multi-Tenant Architecture engineering seal

Status: `ACTIVE`

## Accepted identities

- Accepted application SHA: `2d879832bbaa426a88df8e1a058668a628a14a56`
- Production runtime SHA: `2d879832bbaa426a88df8e1a058668a628a14a56`
- Production deployment: `eb258781-bbb1-49bc-9fb4-152b0bd66a56`
- Database migration version: `0084_multi_tenant_contract.sql`
- Production acceptance: `PASS`
- Data-loss evidence: `UNKNOWN`

The database migration ledger remained at 86 entries with
`0084_multi_tenant_contract.sql` as the latest migration before and after
application deployment. Application startup performed a read-only schema
readiness check and did not execute migrations.

## Protected authority

The P0.1 tenant model, membership authority, resource and write scope,
parent/child integrity, tenant isolation, platform-global authority, legacy
Zestiva compatibility, QA acceptance path, and database migration governance
are frozen and protected by the release freeze manifest.

## Operational migration contract

- Application startup must never apply database migrations.
- `npm --prefix backend run db:migrate` is the explicit migration command.
- Startup readiness must report `CURRENT`, `PENDING`, or `INCOMPATIBLE` without
  mutating the migration ledger.
- A pending or incompatible schema must fail closed with a clear operational
  error.

## Acceptance evidence

- Consultant Database L3 run `37144085192`: `SUCCESS` at the accepted SHA.
- Nutrition Catalogue ENV-C run `37144087163`: `SUCCESS` at the accepted SHA.
- Production runtime identity: exact SHA match.
- Governed QA Common Food lifecycle: generation, edit, save, reload, submit,
  change request, resubmit, approve, explicit publish, DOCX, client read, and
  consumption all passed.
- Cross-client authorization remained fail-closed.
- QA fixture was deactivated and cleaned after the smoke test.

## Open non-blocking evidence gates

These are evidence limitations, not accepted product defects:

1. External Tenant A/B production smoke.
2. QA-owned report/file runtime reads.

## Future-change rule

Any change to this sealed area requires root-cause evidence, focused regression
coverage, full governed regression, exact-SHA CI, clean local/origin parity,
explicit migration verification where relevant, production runtime parity, and
post-deployment acceptance. A migration, fixture, test, or deployment may not
silently weaken tenant isolation or reintroduce startup-time migration.
