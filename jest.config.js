module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/test/**/*.test.ts'],
  // This contract intentionally uses Node's built-in test runner because it
  // imports backend-facing types directly.
  testPathIgnorePatterns: ['onboardingGate\\.test\\.ts$']
};
