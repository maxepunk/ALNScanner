/**
 * Test Hooks - Runs after Jest framework is initialized
 * This file can use Jest globals like beforeEach, afterEach, etc.
 */

// Reset mocks before each test
beforeEach(() => {
  global.localStorage.clear();
  global.fetch.mockClear();
  global.console.log.mockClear();
  global.console.debug.mockClear();
  global.console.info.mockClear();
});
