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
    // Base URL for ALNScanner
    baseURL: 'http://localhost:8000',

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

  // Local dev server (optional - comment out if running server manually)
  // webServer: {
  //   command: 'python3 -m http.server 8000',
  //   url: 'http://localhost:8000',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120000
  // }
});
