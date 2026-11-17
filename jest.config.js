module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/test/**/*.test.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  // This contract intentionally uses Node's built-in test runner because it
  // imports backend-facing types directly.
  testPathIgnorePatterns: ['/test/onboardingGate\\.test\\.ts$']
};
