/**
 * Build-artifact test config.
 *
 * Build-artifact tests (tests/build-artifacts/*.test.js) run a real `vite build`
 * and assert on the emitted dist/ output. They are SLOW (a full production build
 * per suite) and are therefore gated OUT of the default `npm test` (see the
 * testPathIgnorePatterns in jest.config.js). Run them explicitly with:
 *
 *   npm run test:build
 *
 * Mirrors the backend's separate jest.integration.config.js pattern.
 */
const base = require('./jest.config.js');

module.exports = {
  ...base,
  // Run ONLY the build-artifact tests.
  testMatch: ['**/tests/build-artifacts/**/*.test.js'],
  // Re-include the build-artifacts dir the base config ignores so it runs here.
  testPathIgnorePatterns: ['/node_modules/'],
};
