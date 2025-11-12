/**
 * Smoke Test: No Window Globals (Phase 7 Validation)
 *
 * Validates that all window global assignments have been removed:
 * - window.App
 * - window.DataManager
 * - window.Settings
 * - window.Debug
 * - window.UIManager
 * - window.TokenManager
 * - window.sessionModeManager (created by App, should also not be exposed)
 *
 * Also validates that inline script functions have been removed:
 * - scanForServers
 * - handleConnectionSubmit
 * - cancelNetworkedMode
 * - showConnectionWizard
 * - showAuthModal
 * - updateQueueIndicator
 *
 * This ensures the ES6 module architecture is complete and no temporary
 * backward compatibility code remains.
 */

const { test, expect } = require('@playwright/test');

test.describe('Smoke Test: No Window Globals', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to be initialized (check for game mode screen)
    await page.waitForSelector('#gameModeScreen', { timeout: 10000 });
  });

  test('should NOT expose window.App global', async ({ page }) => {
    const hasWindowApp = await page.evaluate(() => typeof window.App !== 'undefined');
    expect(hasWindowApp).toBe(false);
  });

  test('should NOT expose window.DataManager global', async ({ page }) => {
    const hasWindowDataManager = await page.evaluate(() => typeof window.DataManager !== 'undefined');
    expect(hasWindowDataManager).toBe(false);
  });

  test('should NOT expose window.Settings global', async ({ page }) => {
    const hasWindowSettings = await page.evaluate(() => typeof window.Settings !== 'undefined');
    expect(hasWindowSettings).toBe(false);
  });

  test('should NOT expose window.Debug global', async ({ page }) => {
    const hasWindowDebug = await page.evaluate(() => typeof window.Debug !== 'undefined');
    expect(hasWindowDebug).toBe(false);
  });

  test('should NOT expose window.UIManager global', async ({ page }) => {
    const hasWindowUIManager = await page.evaluate(() => typeof window.UIManager !== 'undefined');
    expect(hasWindowUIManager).toBe(false);
  });

  test('should NOT expose window.TokenManager global', async ({ page }) => {
    const hasWindowTokenManager = await page.evaluate(() => typeof window.TokenManager !== 'undefined');
    expect(hasWindowTokenManager).toBe(false);
  });

  test('should NOT expose window.sessionModeManager global', async ({ page }) => {
    const hasWindowSessionModeManager = await page.evaluate(() => typeof window.sessionModeManager !== 'undefined');
    expect(hasWindowSessionModeManager).toBe(false);
  });

  test('should NOT expose inline function: scanForServers', async ({ page }) => {
    const hasScanForServers = await page.evaluate(() => typeof scanForServers !== 'undefined');
    expect(hasScanForServers).toBe(false);
  });

  test('should NOT expose inline function: handleConnectionSubmit', async ({ page }) => {
    const hasHandleConnectionSubmit = await page.evaluate(() => typeof handleConnectionSubmit !== 'undefined');
    expect(hasHandleConnectionSubmit).toBe(false);
  });

  test('should NOT expose inline function: cancelNetworkedMode', async ({ page }) => {
    const hasCancelNetworkedMode = await page.evaluate(() => typeof cancelNetworkedMode !== 'undefined');
    expect(hasCancelNetworkedMode).toBe(false);
  });

  test('should NOT expose inline function: showConnectionWizard', async ({ page }) => {
    const hasShowConnectionWizard = await page.evaluate(() => typeof showConnectionWizard !== 'undefined');
    expect(hasShowConnectionWizard).toBe(false);
  });

  test('should NOT expose inline function: showAuthModal', async ({ page }) => {
    const hasShowAuthModal = await page.evaluate(() => typeof showAuthModal !== 'undefined');
    expect(hasShowAuthModal).toBe(false);
  });

  test('should NOT expose inline function: updateQueueIndicator', async ({ page }) => {
    const hasUpdateQueueIndicator = await page.evaluate(() => typeof updateQueueIndicator !== 'undefined');
    expect(hasUpdateQueueIndicator).toBe(false);
  });

  test('should still load and display game mode selection screen', async ({ page }) => {
    // Verify app loaded successfully
    const gameModeScreen = await page.locator('#gameModeScreen');
    await expect(gameModeScreen).toBeVisible();

    // Verify buttons are present
    const standaloneBtn = await page.locator('button[data-action="app.selectGameMode"][data-arg="standalone"]');
    const networkedBtn = await page.locator('button[data-action="app.selectGameMode"][data-arg="networked"]');

    await expect(standaloneBtn).toBeVisible();
    await expect(networkedBtn).toBeVisible();
  });

  test('should use data-action attributes instead of onclick handlers', async ({ page }) => {
    // Check connection wizard button uses data-action
    const scanBtn = await page.locator('#scanServersBtn');
    const hasDataAction = await scanBtn.evaluate(el => el.hasAttribute('data-action'));
    const hasOnclick = await scanBtn.evaluate(el => el.hasAttribute('onclick'));

    expect(hasDataAction).toBe(true);
    expect(hasOnclick).toBe(false);
  });

  test('should have connection wizard form without onsubmit handler', async ({ page }) => {
    const connectionForm = await page.locator('#connectionForm');
    const hasOnsubmit = await connectionForm.evaluate(el => el.hasAttribute('onsubmit'));

    expect(hasOnsubmit).toBe(false);
  });

  test('should be able to click buttons with data-action attributes', async ({ page }) => {
    // Click settings button to verify data-action event delegation works
    const settingsBtn = await page.locator('button[data-action="app.showSettings"]');
    await settingsBtn.click();

    // Verify settings screen appears
    const settingsScreen = await page.locator('#settingsScreen');
    await expect(settingsScreen).toBeVisible();
  });

  test('should be able to open connection wizard via data-action', async ({ page }) => {
    // Click connection status link with data-action
    const connectionStatus = await page.locator('#connectionStatus[data-action="connectionWizard.showConnectionWizard"]');
    await connectionStatus.click();

    // Verify connection modal appears
    const connectionModal = await page.locator('#connectionModal');
    await expect(connectionModal).toBeVisible();
  });
});
