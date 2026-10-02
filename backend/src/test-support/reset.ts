import { migrateDatabase, resetMigrationStateForTests } from '../db/migrator.js';
import { resetOtpChallengesForTests } from '../modules/auth/auth.service.js';
import { resetPlatformStoreForTests } from '../modules/platform/platform.store.js';
import { resetReportsStoreForTests } from '../modules/reports/reports.store.js';
import { resetWearablesStateForTests } from '../modules/wearables/wearables.service.js';
import { resetWhatsappProviderForTests } from '../modules/notifications/notification.service.js';
import { pool } from '../db/pool.js';
import { resetQaHandoffRateLimitForTests } from '../modules/auth/qa-session-handoff.js';
import { assertDestructiveTestResetAllowed } from './destructive-reset-guard.js';
import { assertCanonicalTestTenantInvariant, ensureCanonicalTestTenants } from './test-tenants.js';

export const resetBackendStateForTests = async () => {
  assertDestructiveTestResetAllowed();
  resetMigrationStateForTests();
  await migrateDatabase();
  resetOtpChallengesForTests();
  resetWhatsappProviderForTests();
  resetQaHandoffRateLimitForTests();
  await pool.query('truncate table auth_sessions, fiteatsy_clients, users restart identity cascade');
  await resetPlatformStoreForTests();
  await resetReportsStoreForTests();
  resetWearablesStateForTests();
  // `tenants.billing_owner_user_id` references users, so PostgreSQL includes
  // the canonical tenant tables in the CASCADE even when the owner is null.
  // Seed after every destructive reset has completed, then fail at this
  // boundary if the platform authority is not usable. Memberships remain
  // intentionally empty so expand-phase legacy fallback is exercised.
  await ensureCanonicalTestTenants();
  await assertCanonicalTestTenantInvariant();
};
