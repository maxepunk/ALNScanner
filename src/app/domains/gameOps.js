/**
 * Game Ops Domain
 *
 * Owns: NFC scanning pipeline, team entry, transaction recording, game mode toggle,
 * scoreboard navigation, history navigation, team details navigation, score/transaction
 * GM interventions, admin score display refresh.
 *
 * Receives `app` as a dependency handle at construction — all I/O goes through
 * app.uiManager, app.dataManager, app.settings, app.tokenManager, etc. so that
 * the App class remains the single point of injection and existing tests (which
 * mock App's collaborators) continue to work unmodified.
 *
 * @module app/domains/gameOps
 */

import { escapeHtml } from '../../utils/escapeHtml.js';
import { wireModeIds, isScoringMode, isConsumingMode, modeHasSurface, entityLabel } from '../../core/modeSemantics.js';

export class GameOpsDomain {
  /**
   * @param {import('../app.js').App} app - The App instance (provides collaborators)
   */
  constructor(app) {
    this.app = app;
  }

  // ========== Settings Management ==========

  /**
   * Cycle to the next declared mode (slice 1: the pack declares N modes;
   * the pill cycles them in declaration order — the two-mode ALN case
   * behaves exactly like the old binary flip).
   */
  toggleMode() {
    const { settings, config } = this.app;
    const ids = wireModeIds();
    const next = ids[(ids.indexOf(settings.mode) + 1) % ids.length];
    this.selectMode(next);

    const indicator = document.getElementById('modeIndicator');
    if (indicator) {
      indicator.style.transform = `scale(${config.MODE_TOGGLE_SCALE})`;
      setTimeout(() => {
        indicator.style.transform = 'scale(1)';
      }, config.ANIMATION_DURATION);
    }
  }

  /**
   * Select a specific declared mode (segmented selector, slice 1). An id
   * the active pack does not declare is REFUSED loudly — the affordance
   * is disabled, never applied blind (design §3 client rule).
   * @param {string} modeId
   */
  selectMode(modeId) {
    const { settings, uiManager, debug } = this.app;
    if (!wireModeIds().includes(modeId)) {
      debug.log(`Mode selection refused: '${modeId}' is not declared by the active pack`, true);
      return;
    }
    settings.mode = modeId;
    settings.save();
    uiManager.updateModeDisplay(settings.mode);

    const scanScreen = document.getElementById('scanScreen');
    if (scanScreen && scanScreen.classList.contains('active')) {
      uiManager.updateSessionStats();
    }
  }

  // ========== Team Entry ==========

  initTeamEntryUI() {
    const { uiManager, teamRegistry } = this.app;
    const teamInput = document.getElementById('teamNameInput');
    const teamList = document.getElementById('teamList');
    const listLabel = document.getElementById('teamListLabel');

    if (listLabel && teamRegistry) {
      listLabel.textContent = teamRegistry.getTeamListLabel();
    }

    if (teamRegistry && teamList) {
      this._renderTeamList(teamList);
    }

    if (teamInput) {
      teamInput.value = '';
      teamInput.focus();
    }

    if (teamRegistry && !this.app._teamsListenerAdded) {
      this.app._teamsListenerAdded = true;
      teamRegistry.addEventListener('teams:updated', () => {
        const list = document.getElementById('teamList');
        if (list) this._renderTeamList(list);
      });
    }
  }

  _renderTeamList(container) {
    const { teamRegistry } = this.app;
    container.innerHTML = '';
    const teams = teamRegistry.getTeamsForDisplay();
    teams.forEach(teamName => {
      const item = document.createElement('div');
      item.className = 'team-list-item';
      item.textContent = teamName;
      item.setAttribute('role', 'option');
      item.addEventListener('click', () => {
        document.getElementById('teamNameInput').value = teamName;
        this.app.confirmTeamId();
      });
      container.appendChild(item);
    });
  }

  async confirmTeamId() {
    const { uiManager, teamRegistry } = this.app;
    const teamInput = document.getElementById('teamNameInput');
    const teamName = teamInput?.value?.trim();

    if (!teamName) {
      // Q1: entity noun is pack-declared (baked 'team' is byte-identical) —
      // review-confirmed census miss, fixed post-build
      uiManager.showError(`Please enter a ${entityLabel().toLowerCase()} name`);
      return;
    }

    const result = await teamRegistry.selectTeam(teamName);
    if (!result.success) {
      // Q1: entity noun is pack-declared (baked 'team' is byte-identical)
      uiManager.showError(result.error || `Failed to select ${entityLabel().toLowerCase()}`);
      return;
    }

    this.app.currentTeamId = teamName;

    const currentTeamEl = document.getElementById('currentTeam');
    if (currentTeamEl) currentTeamEl.textContent = teamName;

    uiManager.updateSessionStats();
    uiManager.showScreen('scan');
    await this.app._startNFCScanning();
  }

  // ========== Scanning ==========

  _recordNfcReadFailure(transientMessage) {
    this.app.nfcReadErrorCount++;
    return this.app.nfcReadErrorCount >= 3
      ? 'Reader trouble — use the Manual Entry button below.'
      : transientMessage;
  }

  async _startNFCScanning() {
    const { nfcHandler, nfcSupported, debug } = this.app;
    if (!nfcSupported) {
      debug.log('NFC not supported - scan simulation available via Manual Entry');
      return;
    }

    const status = document.getElementById('scanStatus');
    try {
      if (status) status.textContent = 'Scanning... Tap a token';
      await nfcHandler.startScan(
        (result) => this.app.processNFCRead(result),
        (err) => {
          const msg = this._recordNfcReadFailure('Read error. Tap token again.');
          debug.log(`NFC read error #${this.app.nfcReadErrorCount} (type: ${err?.type || err?.message || 'unknown'})`, true);
          if (status) status.textContent = msg;
        }
      );
      this.app._scanningActive = true;
      debug.log('NFC scanning started automatically');
    } catch (error) {
      debug.log(`NFC start error: ${error.message}`, true);
      if (status) status.textContent = 'NFC unavailable. Use Manual Entry.';
    }
  }

  pauseNFCForBackground() {
    const { nfcHandler, nfcSupported, _scanningActive } = this.app;
    if (nfcSupported && _scanningActive) {
      nfcHandler.stopScan();
    }
  }

  async resumeNFCForForeground() {
    const { nfcSupported, _scanningActive } = this.app;
    if (nfcSupported && _scanningActive) {
      await this._startNFCScanning();
    }
  }

  simulateScan() {
    const { nfcHandler, config } = this.app;
    const status = document.getElementById('scanStatus');
    if (status) status.textContent = 'Demo Mode: Simulating scan...';
    setTimeout(() => {
      const result = nfcHandler.simulateScan();
      this.app.processNFCRead(result);
    }, config.SCAN_SIMULATION_DELAY);
  }

  async processNFCRead(result) {
    const { debug, uiManager, sessionModeManager, dataManager, tokenManager, settings } = this.app;

    if (result.source === 'error') {
      debug.log(`NFC read failed: ${result.error}`, true);
      uiManager.showError(this._recordNfcReadFailure('Could not read token - please re-tap'));
      return;
    }

    if (typeof result.id !== 'string' || result.id.trim() === '') {
      debug.log(`NFC read returned no usable id (source=${result.source})`, true);
      uiManager.showError(this._recordNfcReadFailure('Could not read token - please re-tap'));
      return;
    }

    this.app.nfcReadErrorCount = 0;
    debug.log(`Processing token: "${result.id}" (from ${result.source})`);

    if (!this.app.currentTeamId || this.app.currentTeamId.trim() === '') {
      debug.log('ERROR: No team selected - cannot process token', true);
      // Q1: entity noun is pack-declared (baked 'team' is byte-identical) —
      // review-confirmed census miss, fixed post-build. The unit pin at
      // tests/app/app.test.js asserts the baked sentence byte-for-byte.
      uiManager.showError(`Please select a ${entityLabel().toLowerCase()} before scanning tokens`);
      return;
    }

    if (sessionModeManager && sessionModeManager.isNetworked()) {
      const sessionStatus = dataManager.sessionState?.status;
      if (sessionStatus !== 'active') {
        const label = (sessionStatus && sessionStatus !== 'disconnected') ? sessionStatus : 'not active';
        debug.log(`Scan blocked: session is ${label}`, true);
        uiManager.showError(`Cannot scan: session is ${label}`);
        return;
      }
    }

    const cleanId = result.id.trim();
    debug.log(`Cleaned ID: "${cleanId}" (length: ${cleanId.length})`);

    const tokenData = tokenManager.findToken(cleanId);
    const tokenId = tokenData ? tokenData.matchedId : cleanId;

    // D3s2: a NON-CONSUMING mode is a repeatable action — never blocked
    // by the duplicate rules (backend duplicatePolicy parity). The local
    // Set only ever holds consuming claims, so the check both ways is:
    // consuming scans consult it, non-consuming scans skip it.
    if (isConsumingMode(settings.mode) && dataManager.isTokenScanned(tokenId)) {
      debug.log(`Duplicate token detected: ${tokenId}`, true);
      this.showDuplicateError(tokenId);
      return;
    }

    if (!tokenData) {
      await this.recordTransaction(null, cleanId, true);
    } else {
      await this.recordTransaction(tokenData.token, tokenData.matchedId, false);
    }
  }

  showDuplicateError(tokenId, message = 'This token has been used') {
    const statusEl = document.getElementById('resultStatus');
    if (statusEl) {
      statusEl.className = 'status-message error';
      statusEl.innerHTML = `
        <h2>Token Already Scanned</h2>
        <p style="font-size: 14px;">${escapeHtml(message)}</p>
        <p style="font-size: 12px; color: #666;">ID: ${escapeHtml(tokenId)}</p>
      `;
    }

    const rfidEl = document.getElementById('resultRfid');
    if (rfidEl) rfidEl.textContent = tokenId;

    const typeEl = document.getElementById('resultType');
    if (typeEl) {
      typeEl.textContent = 'DUPLICATE';
      typeEl.style.color = '#FF5722';
    }

    const groupEl = document.getElementById('resultGroup');
    if (groupEl) groupEl.textContent = 'Previously scanned';

    const valueEl = document.getElementById('resultValue');
    if (valueEl) {
      // The value row is shared with showTokenResult, which hides it
      // under a themed rating display of 'none' — make it visible
      // before writing so duplicate feedback is never swallowed.
      const valueRow = valueEl.closest('.transaction-detail');
      if (valueRow) valueRow.style.display = '';
      valueEl.textContent = 'No points awarded';
    }

    this.app.uiManager.showScreen('result');
  }

  async recordTransaction(token, tokenId, isUnknown) {
    const { settings, dataManager, sessionModeManager, networkedSession, uiManager, debug } = this.app;

    const transaction = {
      timestamp: new Date().toISOString(),
      deviceId: settings.deviceId,
      mode: settings.mode,
      teamId: this.app.currentTeamId,
      rfid: tokenId,
      tokenId,
      memoryType: isUnknown ? 'UNKNOWN' : (token?.SF_MemoryType || 'UNKNOWN'),
      group: isUnknown ? `Unknown: ${tokenId}` : (token?.SF_Group || ''),
      tokenGroup: isUnknown ? '' : (token?.SF_Group || ''),
      valueRating: isUnknown ? 0 : (token?.SF_ValueRating || 0),
      isUnknown,
    };

    if (isScoringMode(settings.mode) && !isUnknown) {
      transaction.points = dataManager.calculateTokenValue(transaction);
    } else {
      transaction.points = 0;
    }

    if (sessionModeManager && sessionModeManager.isNetworked()) {
      // Optimistic mark for CONSUMING claims only (D3s2): a non-consuming
      // action never registers, so marking it would wrongly block the
      // token's real consuming claim later on this device.
      if (isConsumingMode(settings.mode)) {
        dataManager.markTokenAsScanned(tokenId);
      }

      if (!networkedSession) {
        throw new Error('Cannot scan: NetworkedSession not initialized. Please reconnect.');
      }

      const queueManager = networkedSession.getService('queueManager');
      const txId = queueManager.queueTransaction({
        tokenId,
        teamId: this.app.currentTeamId,
        deviceId: settings.deviceId,
        deviceType: 'gm',
        mode: settings.mode,
        summary: token?.summary || null,
        timestamp: transaction.timestamp,
      });
      debug.log(`Transaction queued for orchestrator: ${txId}`);
    } else {
      if (sessionModeManager && sessionModeManager.isStandalone()) {
        await dataManager.addTransaction(transaction);
        if (isConsumingMode(settings.mode)) {
          dataManager.markTokenAsScanned(tokenId);
        }
        debug.log('Transaction stored via UnifiedDataManager (standalone mode)');
      } else {
        debug.log('Warning: No session mode selected - cannot process transaction', true);
        uiManager.showError('Please select a game mode first');
        return;
      }
    }

    if (isScoringMode(settings.mode) && !isUnknown) {
      debug.log(`Token scored: $${transaction.points.toLocaleString()}`);
    }

    uiManager.updateSessionStats();
    uiManager.showTokenResult(token, tokenId, isUnknown);
  }

  manualEntry() {
    const rfid = prompt('Enter RFID manually:');
    if (rfid && rfid.trim()) {
      this.app.processNFCRead({ id: rfid.trim(), source: 'manual', raw: rfid.trim() });
    }
  }

  cancelScan() {
    const { nfcHandler, uiManager } = this.app;
    nfcHandler.stopScan();
    this.app._scanningActive = false;
    this.app.currentTeamId = '';
    uiManager.updateTeamDisplay('');
    uiManager.showScreen('teamEntry');
  }

  continueScan() {
    const { uiManager } = this.app;
    uiManager.updateSessionStats();
    uiManager.showScreen('scan');
  }

  finishTeam() {
    const { nfcHandler, uiManager } = this.app;
    this.app.currentTeamId = '';
    nfcHandler.stopScan();
    this.app._scanningActive = false;
    uiManager.updateTeamDisplay('');
    uiManager.showScreen('teamEntry');
  }

  // ========== History ==========

  showHistory() {
    const { uiManager } = this.app;
    uiManager.updateHistoryStats();
    const historyContainer = document.getElementById('historyContainer');
    if (historyContainer) {
      uiManager.renderGameActivity(historyContainer, { showSummary: true, showFilters: true });
    }
    uiManager.showScreen('history');
  }

  closeHistory() {
    const { uiManager } = this.app;
    const targetScreen = uiManager.previousScreen || 'teamEntry';
    uiManager.showScreen(targetScreen);
  }

  // ========== Scoreboard ==========

  showScoreboard() {
    const { settings, uiManager, debug } = this.app;
    // The scoreboard screen is the RANKINGS surface — gated on the current
    // mode's declared display surface, not a mode-id literal (slice 1).
    if (!modeHasSurface(settings.mode, 'scoreboard-rankings')) {
      debug.log('Scoreboard only available in a rankings-surface mode');
      return;
    }
    uiManager.renderScoreboard();
    uiManager.showScreen('scoreboard');
  }

  closeScoreboard() {
    const { uiManager } = this.app;
    const targetScreen = uiManager.previousScreen || 'teamEntry';
    uiManager.showScreen(targetScreen);
  }

  // ========== Team Details ==========

  showTeamDetails(teamId) {
    const { uiManager, dataManager, viewController } = this.app;
    if (viewController && viewController.currentView === 'admin') {
      viewController.switchView('scanner');
    }
    this.app.currentInterventionTeamId = teamId;
    const transactions = dataManager.getTeamTransactions(teamId);
    uiManager.renderTeamDetails(teamId, transactions);
    uiManager.showScreen('teamDetails');
  }

  closeTeamDetails() {
    this.app.uiManager.showScreen('scoreboard');
  }

  // ========== Admin Panel Display Refresh ==========

  updateAdminPanel() {
    const { viewController, uiManager } = this.app;
    if (viewController?.adminInstances?.monitoring) {
      viewController.adminInstances.monitoring.refreshAllDisplays();
    }

    const gameActivityContainer = document.getElementById('admin-game-activity');
    if (gameActivityContainer) {
      uiManager.renderGameActivity(gameActivityContainer, { showSummary: true, showFilters: true });
    }

    const scoreBoard = document.getElementById('admin-score-board');
    if (scoreBoard) {
      uiManager.renderScoreboard(scoreBoard);
    }
  }

  async adminResetScores() {
    const { sessionModeManager, dataManager, uiManager, viewController, debug } = this.app;
    // Q1: entity noun is pack-declared. This dialog text is E2E-LOAD-BEARING —
    // backend/tests/e2e/flows/07d-02 asserts it pack-derived; keep in lockstep.
    if (!confirm(`Reset all ${entityLabel().toLowerCase()} scores to zero? Transactions will be preserved.`)) return;

    if (sessionModeManager?.isStandalone()) {
      try {
        const result = await dataManager.resetScores();
        if (result.success) {
          debug.log('Scores reset (standalone)');
          uiManager.showToast('All scores reset to zero', 'success');
        } else {
          uiManager.showError(result.error || 'Failed to reset scores');
        }
      } catch (error) {
        console.error('Failed to reset scores (standalone):', error);
        uiManager.showError(`Failed to reset scores: ${error.message}`);
      }
      return;
    }

    if (!viewController.adminInstances?.adminOps) {
      alert('Admin functions not available.');
      return;
    }

    try {
      await viewController.adminInstances.adminOps.resetScores();
      debug.log('Scores reset');
      uiManager.showToast('All scores reset', 'success');
    } catch (error) {
      console.error('Failed to reset scores:', error);
      uiManager.showError('Failed to reset scores.');
    }
  }

  viewFullScoreboard() {
    this.app.switchView('scanner');
    this.app.showScoreboard();
  }

  viewFullHistory() {
    this.app.switchView('scanner');
    this.app.showHistory();
  }

  // ========== GM Intervention ==========

  async adjustTeamScore() {
    const { dataManager, uiManager, sessionModeManager, viewController, debug } = this.app;
    const teamId = this.app.currentInterventionTeamId;
    if (!teamId) {
      // Q1: entity noun is pack-declared (baked 'team' is byte-identical)
      const noun = entityLabel().toLowerCase();
      alert(`No ${noun} selected. Please open ${noun} details first.`);
      return;
    }

    const deltaInput = document.getElementById('scoreAdjustmentInput');
    const reasonInput = document.getElementById('scoreAdjustmentReason');
    const delta = parseInt(deltaInput?.value || '0');
    if (isNaN(delta) || delta === 0) {
      alert('Please enter a valid positive or negative number.');
      return;
    }
    const reason = reasonInput?.value.trim() || 'Manual GM adjustment';

    if (sessionModeManager?.isStandalone()) {
      try {
        const result = await dataManager.adjustTeamScore(teamId, delta, reason);
        // The strategy reports refusals as {success:false, error} without
        // throwing (e.g. the D2s2 pack-conditional score floor) — a
        // success toast on a refused adjustment lies to the GM.
        if (result && result.success === false) {
          uiManager.showError(`Failed to adjust score: ${result.error}`);
          return;
        }
        debug.log(`Score adjusted (standalone): Team ${teamId} ${delta > 0 ? '+' : ''}${delta} (${reason})`);
        if (deltaInput) deltaInput.value = '';
        if (reasonInput) reasonInput.value = '';
        const transactions = dataManager.getTeamTransactions(teamId);
        uiManager.renderTeamDetails(teamId, transactions);
        uiManager.showToast(`Score adjusted: ${delta > 0 ? '+' : ''}${delta} points`, 'success');
      } catch (error) {
        console.error('Failed to adjust score (standalone):', error);
        uiManager.showError(`Failed to adjust score: ${error.message}`);
      }
      return;
    }

    if (!viewController?.adminInstances?.adminOps) {
      alert('Admin functions not available. Ensure you are in networked mode.');
      return;
    }

    try {
      await viewController.adminInstances.adminOps.adjustScore(teamId, delta, reason);
      debug.log(`Score adjusted (networked): Team ${teamId} ${delta > 0 ? '+' : ''}${delta} (${reason})`);
      if (deltaInput) deltaInput.value = '';
      if (reasonInput) reasonInput.value = '';
      uiManager.showToast(`Score adjusted: ${delta > 0 ? '+' : ''}${delta} points`, 'success');
    } catch (error) {
      console.error('Failed to adjust score (networked):', error);
      uiManager.showError(`Failed to adjust score: ${error.message}`);
    }
  }

  async deleteTeamTransaction(transactionId) {
    const { dataManager, uiManager, sessionModeManager, viewController, debug } = this.app;
    if (!confirm('Delete this transaction? This cannot be undone.')) return;

    if (sessionModeManager?.isStandalone()) {
      try {
        const result = await dataManager.removeTransaction(transactionId);
        if (result.success) {
          debug.log(`Transaction deleted (standalone): ${transactionId}`);
          const teamId = this.app.currentInterventionTeamId;
          if (teamId) {
            const transactions = dataManager.getTeamTransactions(teamId);
            uiManager.renderTeamDetails(teamId, transactions);
          }
          uiManager.showToast('Transaction deleted', 'success');
        } else {
          uiManager.showError('Transaction not found');
        }
      } catch (error) {
        console.error('Failed to delete transaction (standalone):', error);
        uiManager.showError(`Failed to delete transaction: ${error.message}`);
      }
      return;
    }

    if (!viewController?.adminInstances?.adminOps) {
      alert('Admin functions not available. Ensure you are in networked mode.');
      return;
    }

    try {
      await viewController.adminInstances.adminOps.deleteTransaction(transactionId);
      debug.log(`Transaction deleted (networked): ${transactionId}`);
      uiManager.showToast('Transaction deleted', 'success');
    } catch (error) {
      console.error('Failed to delete transaction (networked):', error);
      uiManager.showError(`Failed to delete transaction: ${error.message}`);
    }
  }
}
