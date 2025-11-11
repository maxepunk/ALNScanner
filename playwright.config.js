/**
 * Playwright Configuration for ALNScanner E2E Tests
 *
 * Tests the refactored networked mode components in a real browser environment.
 */

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e/specs',

  // Test timeout (individual test)
  timeout: 30000,

  // Global setup/teardown timeout
  expect: {
    timeout: 5000
  },

  // Test execution
  fullyParallel: false, // Run tests sequentially for now (shared state concerns)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for sequential execution

  // Reporter configuration
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e/reports', open: 'never' }]
  ],

  // Shared test configuration
  use: {
    // Base URL for ALNScanner (Vite dev server)
    baseURL: 'https://localhost:8443',

    // Browser context options
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Viewport
    viewport: { width: 1280, height: 720 },

    // Ignore HTTPS errors (self-signed cert)
    ignoreHTTPSErrors: true,

    // Permissions (for NFC API testing - though NFC requires real hardware)
    permissions: ['clipboard-read', 'clipboard-write']
  },

  // Test projects (browsers)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],

  // Vite dev server for E2E tests
  webServer: {
    command: 'npm run dev',
    port: 8443,
    reuseExistingServer: !process.env.CI,
    ignoreHTTPSErrors: true,
    timeout: 120000
  }
});
