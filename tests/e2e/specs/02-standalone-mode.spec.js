/**
 * L2: Standalone Mode User Journey Tests
 *
 * Tests complete user workflows in standalone mode using Page Object pattern.
 * These tests validate the full application flow WITHOUT mocks or backend.
 *
 * Test Coverage:
 * - Complete team entry → scan → result → history workflow
 * - Duplicate token detection
 * - Settings persistence across page reload
 * - Team context maintenance across multiple scans
 * - History badge updates
 *
 * Uses GMScannerPage Page Object for maintainable, forward-compatible tests.
 * NO window globals, NO mocks, NO backend required.
 */

const { test, expect } = require('@playwright/test');
const { GMScannerPage } = require('../page-objects/GMScannerPage');

test.describe('L2: Standalone Mode - Complete User Journeys', () => {
  let scanner;

  test.beforeEach(async ({ page }) => {
    scanner = new GMScannerPage(page);
    await scanner.goto();
  });

  test('should complete full scan workflow: team entry → scan → result → continue', async () => {
    // Select standalone mode
    await scanner.selectStandaloneMode();

    // Verify team entry screen is active
    await expect(scanner.teamEntryScreen).toBeVisible();

    // Enter team ID "123"
    await scanner.enterTeam('123');
    const teamDisplay = await scanner.getTeamDisplay();
    expect(teamDisplay).toBe('123');

    // Confirm team and proceed to scan screen
    await scanner.confirmTeam();
    await expect(scanner.scanScreen).toBeVisible();

    // Verify team displayed on scan screen
    const currentTeam = await scanner.getCurrentTeam();
    expect(currentTeam).toBe('123');

    // Perform manual scan (using real token 'rat002')
    await scanner.manualScan('rat002');

    // Verify result screen appears
    await expect(scanner.resultScreen).toBeVisible();
    const resultStatus = await scanner.getResultStatus();
    expect(resultStatus.toLowerCase()).toContain('complete');  // "Transaction Complete!"

    // Continue scanning
    await scanner.continueScan();
    await expect(scanner.scanScreen).toBeVisible();
  });

  test('should detect duplicate token scans', async () => {
    // Setup: Enter team and scan first token
    await scanner.selectStandaloneMode();
    await scanner.enterTeam('456');
    await scanner.confirmTeam();

    // First scan should succeed (using real token 'alr001')
    await scanner.manualScan('alr001');
    await expect(scanner.resultScreen).toBeVisible();
    const firstResult = await scanner.getResultStatus();
    expect(firstResult.toLowerCase()).toMatch(/complete|success/);

    await scanner.continueScan();

    // Second scan of SAME token should show duplicate error
    await scanner.manualScan('alr001');
    await expect(scanner.resultScreen).toBeVisible();
    const duplicateResult = await scanner.getResultStatus();
    expect(duplicateResult.toLowerCase()).toContain('already');  // "Token Already Scanned"
  });

  test('should maintain team context across multiple scans', async () => {
    await scanner.selectStandaloneMode();
    await scanner.enterTeam('789');
    await scanner.confirmTeam();

    // Verify initial team
    let currentTeam = await scanner.getCurrentTeam();
    expect(currentTeam).toBe('789');

    // Scan first token
    await scanner.manualScan('alr002');
    await scanner.continueScan();

    // Team should still be 789
    currentTeam = await scanner.getCurrentTeam();
    expect(currentTeam).toBe('789');

    // Scan second token
    await scanner.manualScan('asm031');
    await scanner.continueScan();

    // Team should STILL be 789
    currentTeam = await scanner.getCurrentTeam();
    expect(currentTeam).toBe('789');
  });

  test('should update history badge after scans', async () => {
    await scanner.selectStandaloneMode();
    await scanner.enterTeam('111');
    await scanner.confirmTeam();

    // Initial badge should be hidden or 0
    let badgeCount = await scanner.getHistoryBadgeCount();
    expect(badgeCount === null || badgeCount === 0).toBe(true);

    // Scan first token
    await scanner.manualScan('asm042');
    await scanner.continueScan();

    // Badge should now show 1
    badgeCount = await scanner.getHistoryBadgeCount();
    expect(badgeCount).toBe(1);

    // Scan second token
    await scanner.manualScan('det001');
    await scanner.continueScan();

    // Badge should now show 2
    badgeCount = await scanner.getHistoryBadgeCount();
    expect(badgeCount).toBe(2);
  });

  test('should display correct history count', async () => {
    await scanner.selectStandaloneMode();
    await scanner.enterTeam('222');
    await scanner.confirmTeam();

    // Scan 3 tokens
    await scanner.manualScan('det002');
    await scanner.continueScan();

    await scanner.manualScan('din002');
    await scanner.continueScan();

    await scanner.manualScan('din021');
    await scanner.continueScan();

    // Open history
    await scanner.openHistory();
    await expect(scanner.historyScreen).toBeVisible();

    // Verify total scans
    const totalScans = await scanner.getHistoryTotalScans();
    expect(totalScans).toBe(3);

    // Note: Not testing closeHistory() here as previousScreen tracking
    // is complex and not the focus of this test
  });

  test('should clear team ID with clear button', async () => {
    await scanner.selectStandaloneMode();

    // Enter team ID
    await scanner.enterTeam('999');
    let teamDisplay = await scanner.getTeamDisplay();
    expect(teamDisplay).toBe('999');

    // Clear team name
    await scanner.clearTeam();
    teamDisplay = await scanner.getTeamDisplay();
    expect(teamDisplay).toBe('');
  });

  test('should prevent confirming empty team ID', async () => {
    await scanner.selectStandaloneMode();

    // Try to confirm without entering team ID
    await scanner.confirmTeamBtn.click();

    // Should still be on team entry screen (no transition)
    await expect(scanner.teamEntryScreen).toBeVisible();

    // Team display should show empty
    const teamDisplay = await scanner.getTeamDisplay();
    expect(teamDisplay).toBe('');
  });

  test('should persist settings across page reload', async ({ page }) => {
    // Select standalone mode first (required for mode restoration on reload)
    await scanner.selectStandaloneMode();
    await expect(scanner.teamEntryScreen).toBeVisible();

    // Open settings
    await scanner.openSettings();
    await expect(scanner.settingsScreen).toBeVisible();

    // Change device ID (maxlength=10 per index.html:1599)
    await scanner.setDeviceId('TEST_DEV_9');

    // Save settings
    await scanner.saveSettings();
    await expect(scanner.teamEntryScreen).toBeVisible();

    // Reload page - should auto-restore standalone mode and return to team entry screen
    await page.reload();
    await scanner.teamEntryScreen.waitFor({ state: 'visible', timeout: 10000 });

    // Open settings to verify device ID persistence
    await scanner.openSettings();

    // Device ID should be persisted
    const deviceId = await scanner.getDeviceId();
    expect(deviceId).toBe('TEST_DEV_9');
  });

  test('should allow canceling scan and returning to team entry', async () => {
    await scanner.selectStandaloneMode();
    await scanner.enterTeam('555');
    await scanner.confirmTeam();
    await expect(scanner.scanScreen).toBeVisible();

    // Cancel scan
    await scanner.cancelScan();

    // Should return to team entry screen
    await expect(scanner.teamEntryScreen).toBeVisible();

    // Team name should be preserved (UX improvement - allows continuing with same team)
    const teamDisplay = await scanner.getTeamDisplay();
    expect(teamDisplay).toBe('555');
  });

  test('should allow finishing team after scan', async () => {
    await scanner.selectStandaloneMode();
    await scanner.enterTeam('666');
    await scanner.confirmTeam();

    // Scan a token
    await scanner.manualScan('fli002');
    await expect(scanner.resultScreen).toBeVisible();

    // Finish team
    await scanner.finishTeam();

    // Should return to team entry screen
    await expect(scanner.teamEntryScreen).toBeVisible();
  });

  test('should show mode indicator and allow mode toggle', async () => {
    // Open settings to check mode
    await scanner.openSettings();
    await expect(scanner.settingsScreen).toBeVisible();

    // Check initial mode (Detective Mode by default)
    let modeText = await scanner.getModeText();
    expect(modeText).toBe('Detective Mode');

    // Toggle mode
    await scanner.toggleMode();

    // Should now be Black Market Mode
    modeText = await scanner.getModeText();
    expect(modeText).toBe('Black Market Mode');

    // Toggle back
    await scanner.toggleMode();
    modeText = await scanner.getModeText();
    expect(modeText).toBe('Detective Mode');
  });

  test('should increment token count on scan screen', async () => {
    await scanner.selectStandaloneMode();
    await scanner.enterTeam('777');
    await scanner.confirmTeam();

    // Initial count should be 0
    let tokenCount = await scanner.getTokenCount();
    expect(tokenCount).toBe(0);

    // Scan first token
    await scanner.manualScan('fli031');
    await scanner.continueScan();

    // Count should be 1
    tokenCount = await scanner.getTokenCount();
    expect(tokenCount).toBe(1);

    // Scan second token
    await scanner.manualScan('hos002');
    await scanner.continueScan();

    // Count should be 2
    tokenCount = await scanner.getTokenCount();
    expect(tokenCount).toBe(2);
  });
});
