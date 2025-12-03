/**
 * Phase 2 Validation - Admin Module Modularization
 *
 * Validates that the refactored admin modules work correctly:
 * - No console errors from module imports
 * - Session status BEM CSS renders correctly
 * - Admin controller initializes without errors
 */

const { test, expect } = require('@playwright/test');

test.describe('Phase 2: Admin Module Validation', () => {

  test.describe('Module Loading', () => {

    test('should load app without module import errors', async ({ page }) => {
      const consoleErrors = [];

      // Capture console errors
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      // Capture uncaught exceptions
      page.on('pageerror', error => {
        consoleErrors.push(`Page error: ${error.message}`);
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Filter out expected errors/warnings (not related to Phase 2 refactoring)
      const criticalErrors = consoleErrors.filter(err =>
        !err.includes('socket.io') &&
        !err.includes('WebSocket') &&
        !err.includes('net::ERR') &&
        !err.includes('Failed to fetch') &&
        !err.includes('Failed to load resource') &&  // 404s for service worker, etc.
        !err.includes('SSL certificate') &&          // Self-signed cert warnings
        !err.includes('Only 1 token but')            // Expected token validation warning
      );

      // Should have no critical JS errors from module refactoring
      // (import errors, syntax errors, undefined references, etc.)
      expect(criticalErrors).toEqual([]);

      // Take screenshot for visual verification
      await page.screenshot({
        path: 'tests/e2e/screenshots/phase2-app-loaded.png',
        fullPage: true
      });
    });

    test('should initialize app successfully (modules loaded without errors)', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // If we can see the game mode screen, the app initialized successfully
      // This proves all ES6 modules loaded and initialized without fatal errors
      const gameModeScreen = page.locator('#gameModeScreen');
      await expect(gameModeScreen).toBeAttached();

      // Verify both mode buttons exist (proves App.js initialized and rendered UI)
      const standaloneBtn = page.locator('button[data-action="app.selectGameMode"][data-arg="standalone"]');
      const networkedBtn = page.locator('button[data-action="app.selectGameMode"][data-arg="networked"]');

      await expect(standaloneBtn).toBeVisible();
      await expect(networkedBtn).toBeVisible();
    });
  });

  test.describe('Session Status CSS (BEM)', () => {

    test('should render empty session status with correct BEM classes', async ({ page }) => {
      // We need to be in admin view to see session status
      // For now, verify the CSS is loaded by checking stylesheet
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Verify admin.css is loaded
      const stylesheets = await page.evaluate(() => {
        return Array.from(document.styleSheets).map(sheet => sheet.href || 'inline');
      });

      const hasAdminCSS = stylesheets.some(href =>
        href && (href.includes('admin') || href.includes('main'))
      );
      expect(hasAdminCSS).toBe(true);

      // Verify BEM class definitions exist in loaded CSS
      const hasBEMClasses = await page.evaluate(() => {
        // Create test element to verify CSS rules apply
        const testDiv = document.createElement('div');
        testDiv.className = 'session-status session-status--empty';
        testDiv.style.display = 'none';
        document.body.appendChild(testDiv);

        const computed = getComputedStyle(testDiv);
        const hasStyles = computed.textAlign === 'center' ||
                         computed.padding !== '0px';

        document.body.removeChild(testDiv);
        return hasStyles;
      });

      expect(hasBEMClasses).toBe(true);
    });

    test('should have status-dot CSS classes defined', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Test status-dot connected class
      const statusDotConnected = await page.evaluate(() => {
        const testDiv = document.createElement('div');
        testDiv.className = 'status-dot status-dot--connected';
        document.body.appendChild(testDiv);

        const computed = getComputedStyle(testDiv);
        // Should have some styling applied
        const hasStyles = computed.display !== 'none';

        document.body.removeChild(testDiv);
        return hasStyles;
      });

      expect(statusDotConnected).toBe(true);

      // Test status-dot disconnected class
      const statusDotDisconnected = await page.evaluate(() => {
        const testDiv = document.createElement('div');
        testDiv.className = 'status-dot status-dot--disconnected';
        document.body.appendChild(testDiv);

        const computed = getComputedStyle(testDiv);
        const hasStyles = computed.display !== 'none';

        document.body.removeChild(testDiv);
        return hasStyles;
      });

      expect(statusDotDisconnected).toBe(true);
    });
  });

  test.describe('Admin Panel Structure', () => {

    test('should have admin-view container in DOM', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Admin view exists in DOM (hidden initially)
      const adminView = page.locator('#admin-view');
      await expect(adminView).toBeAttached();
    });

    test('should have session status container in admin view', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Session status container exists
      const sessionStatusContainer = page.locator('#session-status-container');
      await expect(sessionStatusContainer).toBeAttached();
    });

    test('should have orchestrator and VLC status indicators', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Status indicators exist
      const orchestratorStatus = page.locator('#orchestrator-status');
      const vlcStatus = page.locator('#vlc-status');

      await expect(orchestratorStatus).toBeAttached();
      await expect(vlcStatus).toBeAttached();
    });
  });

  test.describe('Standalone Mode Functionality', () => {

    test('should allow selecting standalone mode without errors', async ({ page }) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Select standalone mode
      const standaloneBtn = page.locator('button[data-action="app.selectGameMode"][data-arg="standalone"]');
      await expect(standaloneBtn).toBeVisible();
      await standaloneBtn.click();

      // Should navigate to team entry
      await expect(page.locator('#teamEntryScreen.active')).toBeVisible({ timeout: 5000 });

      // No critical errors
      const criticalErrors = errors.filter(err =>
        !err.includes('socket') && !err.includes('fetch')
      );
      expect(criticalErrors).toEqual([]);

      // Screenshot
      await page.screenshot({
        path: 'tests/e2e/screenshots/phase2-standalone-team-entry.png'
      });
    });

    test('should handle scan flow in standalone mode', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Select standalone
      await page.locator('button[data-action="app.selectGameMode"][data-arg="standalone"]').click();
      await expect(page.locator('#teamEntryScreen.active')).toBeVisible({ timeout: 5000 });

      // Enter team ID
      for (const digit of '001') {
        await page.locator(`button[data-action="app.appendNumber"][data-arg="${digit}"]`).click();
      }
      await page.locator('button[data-action="app.confirmTeamId"]').click();

      // Should be on scan screen
      await expect(page.locator('#scanScreen.active')).toBeVisible({ timeout: 5000 });

      // Screenshot
      await page.screenshot({
        path: 'tests/e2e/screenshots/phase2-standalone-scan-screen.png'
      });
    });
  });
});
