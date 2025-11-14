/**
 * Smoke Tests - Basic App Loading
 *
 * Verifies that the ALNScanner app loads correctly and initializes.
 */

const { test, expect } = require('@playwright/test');
const { waitForElement } = require('../fixtures/testTokens');

test.describe('ALNScanner Smoke Tests', () => {
  test('should load index.html and display loading screen', async ({ page }) => {
    // Navigate to app
    await page.goto('/');

    // Verify page loaded
    await expect(page).toHaveTitle(/Memory Transaction Station/i);

    // Verify loading screen appears initially
    const loadingScreen = page.locator('#loadingScreen');
    await expect(loadingScreen).toBeVisible({ timeout: 2000 });
  });

  test('should initialize app and show game mode selection', async ({ page }) => {
    await page.goto('/');

    // Clear localStorage to ensure clean state
    await page.evaluate(() => {
      localStorage.clear();
    });

    // Reload after clearing localStorage
    await page.reload();

    // Wait for initialization to complete (loading screen disappears)
    await page.waitForSelector('#loadingScreen.active', { state: 'hidden', timeout: 10000 });

    // Should show game mode selection screen
    await waitForElement(page, '#gameModeScreen.active');

    // Verify both mode buttons exist
    await expect(page.locator('button:has-text("Networked Game")')).toBeVisible();
    await expect(page.locator('button:has-text("Standalone Game")')).toBeVisible();
  });

  test('should load all JavaScript modules', async ({ page }) => {
    await page.goto('/');

    // Wait for app initialization
    await page.waitForFunction(() => typeof window.App !== 'undefined', { timeout: 10000 });

    // Verify core modules loaded
    const modulesLoaded = await page.evaluate(() => {
      return {
        App: typeof window.App !== 'undefined',
        DataManager: typeof window.DataManager !== 'undefined',
        TokenManager: typeof window.TokenManager !== 'undefined',
        UIManager: typeof window.UIManager !== 'undefined',
        Settings: typeof window.Settings !== 'undefined',
        SessionModeManager: typeof window.SessionModeManager !== 'undefined',
        // Network layer (only loaded, not initialized yet)
        NetworkedSession: typeof window.NetworkedSession !== 'undefined',
        OrchestratorClient: typeof window.OrchestratorClient !== 'undefined',
        ConnectionManager: typeof window.ConnectionManager !== 'undefined',
        AdminController: typeof window.AdminController !== 'undefined'
      };
    });

    // All modules should be loaded
    expect(modulesLoaded.App).toBe(true);
    expect(modulesLoaded.DataManager).toBe(true);
    expect(modulesLoaded.TokenManager).toBe(true);
    expect(modulesLoaded.UIManager).toBe(true);
    expect(modulesLoaded.Settings).toBe(true);
    expect(modulesLoaded.SessionModeManager).toBe(true);
    expect(modulesLoaded.NetworkedSession).toBe(true);
    expect(modulesLoaded.OrchestratorClient).toBe(true);
    expect(modulesLoaded.ConnectionManager).toBe(true);
    expect(modulesLoaded.AdminController).toBe(true);
  });

  test('should load token database', async ({ page }) => {
    await page.goto('/');

    // Wait for token database to load
    await page.waitForFunction(() => {
      return window.TokenManager &&
        window.TokenManager.database &&
        Object.keys(window.TokenManager.database).length > 0;
    }, { timeout: 10000 });

    // Verify token database has tokens
    const tokenCount = await page.evaluate(() => Object.keys(window.TokenManager.database).length);
    expect(tokenCount).toBeGreaterThan(0);
  });

  test('should not have JavaScript errors on load', async ({ page }) => {
    const errors = [];

    // Capture console errors
    page.on('pageerror', error => {
      errors.push(error.message);
    });

    await page.goto('/');

    // Wait for initialization
    await page.waitForSelector('#loadingScreen.active', { state: 'hidden', timeout: 10000 });

    // No errors should have occurred
    expect(errors).toHaveLength(0);
  });
});
