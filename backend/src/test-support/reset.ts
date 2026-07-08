import { resetOtpChallengesForTests } from '../modules/auth/auth.service.js';
import { resetPlatformStoreForTests } from '../modules/platform/platform.store.js';
import { resetReportsStoreForTests } from '../modules/reports/reports.store.js';
import { resetWearablesStateForTests } from '../modules/wearables/wearables.service.js';

export const resetBackendStateForTests = () => {
  resetOtpChallengesForTests();
  resetPlatformStoreForTests();
  resetReportsStoreForTests();
  resetWearablesStateForTests();
};
