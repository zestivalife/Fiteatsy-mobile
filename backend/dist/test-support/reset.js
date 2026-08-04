import { migrateDatabase, resetMigrationStateForTests } from '../db/migrator.js';
import { resetOtpChallengesForTests } from '../modules/auth/auth.service.js';
import { resetPlatformStoreForTests } from '../modules/platform/platform.store.js';
import { resetReportsStoreForTests } from '../modules/reports/reports.store.js';
import { resetWearablesStateForTests } from '../modules/wearables/wearables.service.js';
import { resetWhatsappProviderForTests } from '../modules/notifications/notification.service.js';
import { pool } from '../db/pool.js';
export const resetBackendStateForTests = async () => {
    resetMigrationStateForTests();
    await migrateDatabase();
    resetOtpChallengesForTests();
    resetWhatsappProviderForTests();
    await pool.query('truncate table auth_sessions, fiteatsy_clients, users restart identity cascade');
    await resetPlatformStoreForTests();
    await resetReportsStoreForTests();
    resetWearablesStateForTests();
};
