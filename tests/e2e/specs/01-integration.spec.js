/**
 * Browser Integration Tests - ES6 Module Architecture
 *
 * Validates that the ES6 module system loads correctly and the app
 * initializes properly WITHOUT window global dependencies.
 *
 * NOTE: Component instantiation tests removed - those belong in unit tests.
 * User journey tests are in separate spec files (L1 smoke, L2 standalone flow).
 */

const { test, expect } = require('@playwright/test');

test.describe('Browser Integration - ES6 Module Loading', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to initialize (game mode screen appears)
    await page.waitForSelector('#gameModeScreen', { timeout: 10000 });
  });

  test('should load ES6 modules and initialize app', async ({ page }) => {
    // Verify game mode selection screen is visible
    const gameModeScreen = await page.locator('#gameModeScreen');
    await expect(gameModeScreen).toBeVisible();

    // Verify both mode options are present
    const standaloneBtn = await page.locator('button[data-action="app.selectGameMode"][data-arg="standalone"]');
    const networkedBtn = await page.locator('button[data-action="app.selectGameMode"][data-arg="networked"]');

    await expect(standaloneBtn).toBeVisible();
    await expect(networkedBtn).toBeVisible();
  });

  test('should initialize without console errors', async ({ page }) => {
    const errors = [];

    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Reload page to capture initialization
    await page.reload();
    await page.waitForSelector('#gameModeScreen', { timeout: 10000 });

    // Filter out expected errors (e.g., socket.io connection attempts, SSL cert warnings, debug warnings)
    const criticalErrors = errors.filter(err =>
      !err.includes('socket.io') &&
      !err.includes('Failed to load resource') &&
      !err.includes('WebSocket') &&
      !err.includes('SSL certificate error') &&
      !err.includes('multiplier') && // Debug warnings about game logic
      !err.includes('⚠️') // Warning symbols
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('should have connection wizard available', async ({ page }) => {
    // Click connection status to open wizard
    const connectionStatus = await page.locator('#connectionStatus[data-action="connectionWizard.showConnectionWizard"]');
    await connectionStatus.click();

    // Verify connection modal appears
    const connectionModal = await page.locator('#connectionModal');
    await expect(connectionModal).toBeVisible();

    // Verify scan button is present
    const scanBtn = await page.locator('#scanServersBtn[data-action="connectionWizard.scanForServers"]');
    await expect(scanBtn).toBeVisible();
  });

  test('should have functional standalone mode selection', async ({ page }) => {
    // Select standalone mode
    const standaloneBtn = await page.locator('button[data-action="app.selectGameMode"][data-arg="standalone"]');
    await standaloneBtn.click();

    // Wait for team entry screen
    await page.waitForSelector('#teamEntryScreen.active', { timeout: 5000 });

    // Verify team entry screen is visible
    const teamEntryScreen = await page.locator('#teamEntryScreen.active');
    await expect(teamEntryScreen).toBeVisible();

    // Verify unified text input is visible
    const teamNameInput = await page.locator('#teamNameInput');
    await expect(teamNameInput).toBeVisible();
  });
});
