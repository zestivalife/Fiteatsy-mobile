# P0.1 Multi-Tenant Implementation Evidence

## Implemented pre-production stages

- **Expand:** canonical `tenants`, `tenant_memberships`, `tenant_settings`, and tenant-resolution telemetry.
- **Zestiva seed:** deterministic tenant ID `00000000-0000-4000-8000-000000000001`, type `ZESTIVA_INTERNAL`; insert/upsert is idempotent.
- **Nullable ownership:** additive `tenant_id` references on the audited client, assignment, care, report, health, Diet Plan, notification, file, operation, and consent tables when present.
- **Backfill:** existing rows receive the deterministic Zestiva tenant without deleting or rewriting legacy ownership.
- **Membership backfill:** existing active roles map to tenant roles while platform roles remain unchanged.
- **Dual write:** transition triggers populate the deterministic tenant on new core rows while legacy relationships remain intact.
- **Dual read:** a migrated assignment requires matching client ownership and active Consultant/client memberships. A null tenant follows the existing sealed assignment path only.
- **Tenant projection:** `/v1/auth/me` exposes the server-resolved active membership; no request-provided tenant ID is trusted.
- **Frontend:** a passive tenant context consumes the server-issued projection. No switcher or page redesign is included.

## Intentionally not performed

- No production or staging migration was executed.
- No `tenant_id` field was made `NOT NULL`.
- No legacy authorization relationship was removed.
- No production deployment or data mutation occurred.
- Contract phase is blocked until production-equivalent verification proves zero unresolved rows, zero mismatches, 100% new-write coverage, and zero legacy fallback hits.

## Read-only verification

After applying the expand migration to a production-schema clone, query:

```sql
select * from tenant_backfill_verification order by table_name;

select count(*) as membership_conflicts
from tenant_memberships
group by tenant_id,user_id
having count(*) > 1;

select count(*) as assignment_client_tenant_mismatches
from consultant_client_assignments assignment
join fiteatsy_clients client on client.account_user_id=assignment.client_user_id
where assignment.tenant_id is distinct from client.tenant_id;

select path,count(*) from tenant_resolution_events group by path order by path;
```

## Rollback plan

1. Disable tenant-aware reads first; retain sealed assignment/role/consent behavior.
2. Drop transition triggers named `tenant_dual_write` from affected tables.
3. Drop `tenant_backfill_verification`, then tenant indexes and nullable `tenant_id` columns.
4. Drop `tenant_resolution_events`, `tenant_settings`, `tenant_memberships`, then `tenants` only after proving no remaining references.
5. Do not reverse or delete legacy relationships; the migration does not modify their meaning.

The rollback is schema-only because this phase introduces no destructive transformation. Contract-phase rollback will require a separate reviewed migration after pre-production verification.
