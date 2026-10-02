import { migrateDatabase, resetMigrationStateForTests } from '../db/migrator.js';
import { resetOtpChallengesForTests } from '../modules/auth/auth.service.js';
import { resetPlatformStoreForTests } from '../modules/platform/platform.store.js';
import { resetReportsStoreForTests } from '../modules/reports/reports.store.js';
import { resetWearablesStateForTests } from '../modules/wearables/wearables.service.js';
import { resetWhatsappProviderForTests } from '../modules/notifications/notification.service.js';
import { pool } from '../db/pool.js';
import { resetQaHandoffRateLimitForTests } from '../modules/auth/qa-session-handoff.js';
import { assertDestructiveTestResetAllowed } from './destructive-reset-guard.js';

const ZESTIVA_TENANT_ID = '00000000-0000-4000-8000-000000000001';

const restoreCanonicalTenantSeedAfterCascade = async () => {
  await pool.query(
    `insert into tenants(id,name,slug,tenant_type,status,default_timezone,country,currency)
     values ($1,'Zestiva','zestiva','ZESTIVA_INTERNAL','active','Asia/Kolkata','IN','INR')
     on conflict (id) do update set
       name=excluded.name,
       slug=excluded.slug,
       tenant_type=excluded.tenant_type,
       status=excluded.status,
       default_timezone=excluded.default_timezone,
       country=excluded.country,
       currency=excluded.currency,
       updated_at=now()`,
    [ZESTIVA_TENANT_ID],
  );
  await pool.query(
    `insert into tenant_settings(tenant_id)
     values ($1)
     on conflict (tenant_id) do nothing`,
    [ZESTIVA_TENANT_ID],
  );
};

export const resetBackendStateForTests = async () => {
  assertDestructiveTestResetAllowed();
  resetMigrationStateForTests();
  await migrateDatabase();
  resetOtpChallengesForTests();
  resetWhatsappProviderForTests();
  resetQaHandoffRateLimitForTests();
  await pool.query('truncate table auth_sessions, fiteatsy_clients, users restart identity cascade');
  // `tenants.billing_owner_user_id` references users, so PostgreSQL includes
  // the canonical tenant tables in the CASCADE even when the owner is null.
  // Re-establish only the migration-owned system seed; user memberships remain
  // intentionally empty so expand-phase legacy fallback is exercised for new
  // QA and production-compatible identities.
  await restoreCanonicalTenantSeedAfterCascade();
  await resetPlatformStoreForTests();
  await resetReportsStoreForTests();
  resetWearablesStateForTests();
};
