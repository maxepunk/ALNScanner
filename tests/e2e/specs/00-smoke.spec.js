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

  test('should initialize app and be ready for interaction', async ({ page }) => {
    // Clear localStorage to ensure clean state
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Wait for initialization to complete (loading screen disappears)
    await page.waitForSelector('#loadingScreen.active', { state: 'hidden', timeout: 10000 });

    // Verify app is functional by checking game mode screen is ready
    await waitForElement(page, '#gameModeScreen.active');

    // Verify mode buttons are clickable (proves event handlers are attached)
    const standaloneBtn = page.locator('button[data-action="app.selectGameMode"][data-arg="standalone"]');
    await expect(standaloneBtn).toBeVisible();
    await expect(standaloneBtn).toBeEnabled();

    const networkedBtn = page.locator('button[data-action="app.selectGameMode"][data-arg="networked"]');
    await expect(networkedBtn).toBeVisible();
    await expect(networkedBtn).toBeEnabled();
  });

  test('should load token database and enable scanning', async ({ page }) => {
    // Clear localStorage and start fresh
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Wait for app to fully initialize
    await page.waitForSelector('#loadingScreen.active', { state: 'hidden', timeout: 10000 });
    await waitForElement(page, '#gameModeScreen.active');

    // Select standalone mode
    await page.locator('button[data-action="app.selectGameMode"][data-arg="standalone"]').click();
    await waitForElement(page, '#teamEntryScreen.active');

    // Enter a team name using unified text input
    await page.locator('#teamNameInput').fill('001');
    await page.locator('button[data-action="app.confirmTeamId"]').click();

    // Should reach scan screen (proves app initialized with token data)
    await waitForElement(page, '#scanScreen.active');

    // Manual entry button should be available (proves app is ready to process tokens)
    const manualEntryBtn = page.locator('button[data-action="app.manualEntry"]');
    await expect(manualEntryBtn).toBeVisible();
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
