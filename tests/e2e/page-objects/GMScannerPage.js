/**
 * Page Object Model for GM Scanner
 *
 * Encapsulates DOM interactions for maintainable E2E tests.
 * Uses Playwright locators and web-first assertions.
 *
 * NO window globals - pure DOM interaction via data-action attributes.
 *
 * ARCHITECTURE:
 * - Views (top-level): #scanner-view (default), #admin-view, #debug-view (networked only)
 * - Screens (within scanner-view): Toggle with .active class
 * - L2 tests focus on standalone mode (scanner-view only, no backend)
 */

class GMScannerPage {
  constructor(page) {
    this.page = page;

    // View locators (top-level containers, networked mode only)
    this.scannerView = page.locator('#scanner-view');
    this.adminView = page.locator('#admin-view');
    this.debugView = page.locator('#debug-view');

    // Screen locators (within scanner-view, toggled with .active class)
    this.loadingScreen = page.locator('#loadingScreen.active');
    this.settingsScreen = page.locator('#settingsScreen.active');
    this.gameModeScreen = page.locator('#gameModeScreen.active');
    this.teamEntryScreen = page.locator('#teamEntryScreen.active');
    this.scanScreen = page.locator('#scanScreen.active');
    this.resultScreen = page.locator('#resultScreen.active');
    this.historyScreen = page.locator('#historyScreen.active');
    this.scoreboardScreen = page.locator('#scoreboardScreen.active');
    this.teamDetailsScreen = page.locator('#teamDetailsScreen.active');

    // Mode selection buttons
    this.standaloneBtn = page.locator('button[data-action="app.selectGameMode"][data-arg="standalone"]');
    this.networkedBtn = page.locator('button[data-action="app.selectGameMode"][data-arg="networked"]');

    // Team entry elements (standalone mode uses text input)
    this.teamNameInput = page.locator('#standaloneTeamName');
    this.confirmTeamBtn = page.locator('button[data-action="app.confirmTeamId"]');

    // Scan screen elements
    this.currentTeam = page.locator('#currentTeam');
    this.scanStatus = page.locator('#scanStatus');
    this.scanButton = page.locator('#scanButton[data-action="app.startScan"]');
    this.manualEntryBtn = page.locator('button[data-action="app.manualEntry"]');
    this.cancelScanBtn = page.locator('button[data-action="app.cancelScan"]');
    this.teamTokenCount = page.locator('#teamTokenCount');
    this.teamTotalValue = page.locator('#teamTotalValue');

    // Result screen elements
    this.resultStatus = page.locator('#resultStatus');
    this.resultTitle = page.locator('#resultTitle');
    this.resultValue = page.locator('#resultValue');
    this.continueScanBtn = page.locator('button[data-action="app.continueScan"]');
    this.finishTeamBtn = page.locator('button[data-action="app.finishTeam"]');

    // History screen elements
    this.historyBadge = page.locator('#historyBadge');
    this.historyButton = page.locator('button[data-action="app.showHistory"]');
    this.totalScans = page.locator('#totalScans');
    this.historyContainer = page.locator('#historyContainer');
    this.closeHistoryBtn = page.locator('button[data-action="app.closeHistory"]');

    // Settings elements
    this.settingsButton = page.locator('button[data-action="app.showSettings"]');
    this.deviceIdInput = page.locator('#deviceId');
    this.modeIndicator = page.locator('#modeIndicator');
    this.saveSettingsBtn = page.locator('button[data-action="app.saveSettings"]');
  }

  /**
   * Navigate to scanner homepage
   */
  async goto() {
    await this.page.goto('/');
    await this.gameModeScreen.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Select standalone mode
   */
  async selectStandaloneMode() {
    await this.standaloneBtn.click();
    await this.teamEntryScreen.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Select networked mode
   */
  async selectNetworkedMode() {
    await this.networkedBtn.click();
    // Connection wizard modal should appear
    await this.page.locator('#connectionModal').waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Enter team name using text input (standalone mode)
   * @param {string} teamName - Team name (e.g., "001" or "Team Alpha")
   */
  async enterTeam(teamName) {
    await this.teamNameInput.fill(teamName);
  }

  /**
   * Confirm team ID and proceed to scan screen
   */
  async confirmTeam() {
    await this.confirmTeamBtn.click();
    await this.scanScreen.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Clear team name input
   */
  async clearTeam() {
    await this.teamNameInput.clear();
  }

  /**
   * Get current team name input value
   * @returns {Promise<string>}
   */
  async getTeamDisplay() {
    return await this.teamNameInput.inputValue();
  }

  /**
   * Get current team on scan screen
   * @returns {Promise<string>}
   */
  async getCurrentTeam() {
    return await this.currentTeam.textContent();
  }

  /**
   * Perform manual token scan via prompt dialog
   * @param {string} tokenId - Token ID to scan
   */
  async manualScan(tokenId) {
    // Setup dialog handler BEFORE clicking button (use once, not waitForEvent)
    // This prevents the click from hanging when dialog appears
    this.page.once('dialog', dialog => dialog.accept(tokenId));

    // Click manual entry button (dialog will be auto-handled)
    await this.manualEntryBtn.click();

    // Wait for result screen to appear
    await this.resultScreen.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Wait for result screen to appear
   */
  async waitForResult() {
    await this.resultScreen.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Get result status text
   * @returns {Promise<string>}
   */
  async getResultStatus() {
    return await this.resultStatus.textContent();
  }

  /**
   * Get result title text
   * @returns {Promise<string>}
   */
  async getResultTitle() {
    return await this.resultTitle.textContent();
  }

  /**
   * Get result value text
   * @returns {Promise<string>}
   */
  async getResultValue() {
    return await this.resultValue.textContent();
  }

  /**
   * Continue scanning (after result)
   */
  async continueScan() {
    await this.continueScanBtn.click();
    await this.scanScreen.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Finish team (after result)
   */
  async finishTeam() {
    await this.finishTeamBtn.click();
    await this.teamEntryScreen.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Cancel scan and return to team entry
   */
  async cancelScan() {
    await this.cancelScanBtn.click();
    await this.teamEntryScreen.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Get team token count
   * @returns {Promise<number>}
   */
  async getTokenCount() {
    const text = await this.teamTokenCount.textContent();
    return parseInt(text, 10);
  }

  /**
   * Get team total value
   * @returns {Promise<number>}
   */
  async getTotalValue() {
    const text = await this.teamTotalValue.textContent();
    return parseInt(text, 10);
  }

  /**
   * Open history screen
   */
  async openHistory() {
    await this.historyButton.click();
    await this.historyScreen.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Close history screen
   */
  async closeHistory() {
    await this.closeHistoryBtn.click();
    await this.scanScreen.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Get history total scans count
   * @returns {Promise<number>}
   */
  async getHistoryTotalScans() {
    const text = await this.totalScans.textContent();
    return parseInt(text, 10);
  }

  /**
   * Get history badge count
   * @returns {Promise<number|null>} Returns null if badge is hidden
   */
  async getHistoryBadgeCount() {
    const isVisible = await this.historyBadge.isVisible();
    if (!isVisible) return null;

    const text = await this.historyBadge.textContent();
    return parseInt(text, 10);
  }

  /**
   * Open settings screen
   */
  async openSettings() {
    await this.settingsButton.click();
    await this.settingsScreen.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Set device ID in settings
   * @param {string} deviceId
   */
  async setDeviceId(deviceId) {
    await this.deviceIdInput.fill(deviceId);
  }

  /**
   * Get device ID from settings
   * @returns {Promise<string>}
   */
  async getDeviceId() {
    return await this.deviceIdInput.inputValue();
  }

  /**
   * Save settings and return to team entry screen
   */
  async saveSettings() {
    await this.saveSettingsBtn.click();
    await this.teamEntryScreen.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Toggle mode (detective/blackmarket) via mode indicator
   */
  async toggleMode() {
    await this.modeIndicator.click();
  }

  /**
   * Get current mode text
   * @returns {Promise<string>}
   */
  async getModeText() {
    return await this.modeIndicator.textContent();
  }
}

module.exports = { GMScannerPage };
