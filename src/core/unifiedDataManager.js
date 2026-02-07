/**
 * UnifiedDataManager - Single entry point for data operations
 * Delegates to LocalStorage or NetworkedStorage based on session mode
 *
 * @module core/unifiedDataManager
 */

import { LocalStorage } from './storage/LocalStorage.js';
import { NetworkedStorage } from './storage/NetworkedStorage.js';
import {
  SCORING_CONFIG,
  calculateTokenValue as calcTokenValue,
  parseGroupInfo as parseGroup,
  normalizeGroupName as sharedNormalizeGroupName
} from './scoring.js';

export class UnifiedDataManager extends EventTarget {
  /**
   * Create UnifiedDataManager instance
   * @param {Object} options - Dependencies
   * @param {Object} options.tokenManager - TokenManager instance
   * @param {Object} options.sessionModeManager - SessionModeManager instance
   * @param {Object} [options.debug] - Debug instance
   */
  constructor({ tokenManager, sessionModeManager, debug } = {}) {
    super();

    this.tokenManager = tokenManager;
    this.sessionModeManager = sessionModeManager;
    this.debug = debug;

    // Strategy instances (created on mode selection)
    this._localStrategy = null;
    this._networkedStrategy = null;
    this._activeStrategy = null;

    // Store event listener references for cleanup
    this._strategyListeners = new Map();

    // Expose scannedTokens for backward compatibility
    // NOTE: This is a shared reference to the strategy's Set
    this.scannedTokens = new Set();

    // Expose SCORING_CONFIG for UIManager.renderTokenCard()
    // This follows the pattern from DataManager and LocalStorage
    this.SCORING_CONFIG = SCORING_CONFIG;

    // Session tracking for boundary detection
    this.currentSessionId = null;
  }

  /**
   * Initialize standalone mode (LocalStorage strategy)
   * @returns {Promise<void>}
   */
  async initializeStandaloneMode() {
    this._log('Initializing standalone mode');

    this._localStrategy = new LocalStorage({
      tokenManager: this.tokenManager,
      debug: this.debug
    });

    await this._localStrategy.initialize();
    this._activeStrategy = this._localStrategy;

    // Sync scannedTokens from strategy
    this._syncScannedTokens();

    // Wire up event forwarding
    this._wireStrategyEvents(this._localStrategy);

    this._log('Standalone mode initialized');
  }

  /**
   * Initialize networked mode (NetworkedStorage strategy)
   * @param {Object} socket - Socket.io client instance (or object with .socket property)
   * @returns {Promise<void>}
   */
  async initializeNetworkedMode(socket) {
    this._log('Initializing networked mode');

    // Handle both direct socket and networkedSession-like objects
    const actualSocket = socket?.socket || socket;

    this._networkedStrategy = new NetworkedStorage({
      tokenManager: this.tokenManager,
      socket: actualSocket,
      debug: this.debug
    });

    await this._networkedStrategy.initialize();
    this._activeStrategy = this._networkedStrategy;

    // Sync scannedTokens from strategy
    this._syncScannedTokens();

    // Wire up event forwarding
    this._wireStrategyEvents(this._networkedStrategy);

    this._log('Networked mode initialized');
  }

  /**
   * Check if manager is ready
   * @returns {boolean}
   */
  isReady() {
    return this._activeStrategy?.isReady() ?? false;
  }

  /**
   * Get active strategy type
   * @returns {string|null} 'local' | 'networked' | null
   */
  getActiveStrategyType() {
    if (!this._activeStrategy) return null;
    if (this._activeStrategy === this._localStrategy) return 'local';
    if (this._activeStrategy === this._networkedStrategy) return 'networked';
    return null;
  }

  /**
   * Sync scannedTokens from active strategy
   * NOTE: Creates a shared reference for backward compatibility.
   * The scannedTokens Set is owned by the strategy - if strategy
   * replaces its Set, call this method again to re-sync.
   * @private
   */
  _syncScannedTokens() {
    if (this._activeStrategy?.scannedTokens) {
      this.scannedTokens = this._activeStrategy.scannedTokens;
    }
  }

  /**
   * Wire event forwarding from strategy to manager
   * Stores listener references for cleanup via _unwireStrategyEvents
   * @private
   * @param {IStorageStrategy} strategy
   */
  _wireStrategyEvents(strategy) {
    const events = [
      'transaction:added',
      'transaction:deleted',
      'team-score:updated',
      'scores:cleared',
      'data:cleared',
      'game-state:updated',
      'player-scan:added',
      'session:updated'
    ];

    const listeners = [];
    events.forEach(eventName => {
      const handler = (event) => {
        this.dispatchEvent(new CustomEvent(eventName, { detail: event.detail }));
      };
      strategy.addEventListener(eventName, handler);
      listeners.push({ eventName, handler });
    });

    this._strategyListeners.set(strategy, listeners);
  }

  /**
   * Remove event listeners from strategy
   * @private
   * @param {IStorageStrategy} strategy
   */
  _unwireStrategyEvents(strategy) {
    const listeners = this._strategyListeners.get(strategy);
    if (listeners) {
      listeners.forEach(({ eventName, handler }) => {
        strategy.removeEventListener(eventName, handler);
      });
      this._strategyListeners.delete(strategy);
    }
  }

  /**
   * Log message if debug available
   * @private
   */
  _log(message) {
    if (this.debug?.log) {
      this.debug.log(`[UnifiedDataManager] ${message}`);
    }
  }

  // ============================================================================
  // DELEGATED OPERATIONS - Core IStorageStrategy methods
  // ============================================================================

  /**
   * Add a transaction
   * @param {Object} transaction - Transaction data
   * @returns {Promise<Object>} Transaction result
   */
  async addTransaction(transaction) {
    this._requireActiveStrategy();
    return this._activeStrategy.addTransaction(transaction);
  }

  /**
   * Remove a transaction
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<Object>} Result
   */
  async removeTransaction(transactionId) {
    this._requireActiveStrategy();
    return this._activeStrategy.removeTransaction(transactionId);
  }

  /**
   * Add transaction from broadcast (networked mode only)
   * Used when receiving transaction:new events from backend
   * @param {Object} tx - Transaction from broadcast
   */
  addTransactionFromBroadcast(tx) {
    // Only NetworkedStorage has this method
    if (typeof this._activeStrategy?.addTransactionFromBroadcast === 'function') {
      this._activeStrategy.addTransactionFromBroadcast(tx);
      // Emit event so UI can update
      this.dispatchEvent(new CustomEvent('transaction:added', {
        detail: { transaction: tx }
      }));
    }
  }

  /**
   * Get all transactions
   * @returns {Array} Transactions
   */
  getTransactions() {
    this._requireActiveStrategy();
    return this._activeStrategy.getTransactions();
  }

  /**
   * Get team scores
   * @returns {Array} Team scores sorted by score descending
   */
  getTeamScores() {
    this._requireActiveStrategy();
    return this._activeStrategy.getTeamScores();
  }

  /**
   * Adjust team score
   * @param {string} teamId - Team ID
   * @param {number} delta - Score adjustment
   * @param {string} reason - Reason for adjustment
   * @returns {Promise<Object>} Result
   */
  async adjustTeamScore(teamId, delta, reason) {
    this._requireActiveStrategy();
    return this._activeStrategy.adjustTeamScore(teamId, delta, reason);
  }

  /**
   * Get game activity
   * @returns {Object} { tokens, stats }
   */
  getGameActivity() {
    this._requireActiveStrategy();
    return this._activeStrategy.getGameActivity();
  }

  /**
   * Get current session info
   * @returns {Object|null}
   */
  getCurrentSession() {
    return this._activeStrategy?.getCurrentSession() ?? null;
  }

  /**
   * Create a new session
   * @param {string} name - Session name
   * @param {Array} teams - Initial teams
   * @returns {Promise<Object>}
   */
  async createSession(name, teams) {
    this._requireActiveStrategy();
    return this._activeStrategy.createSession(name, teams);
  }

  /**
   * End current session
   * @returns {Promise<void>}
   */
  async endSession() {
    this._requireActiveStrategy();
    return this._activeStrategy.endSession();
  }

  /**
   * Pause the current session
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async pauseSession() {
    this._requireActiveStrategy();
    return this._activeStrategy.pauseSession();
  }

  /**
   * Resume a paused session
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async resumeSession() {
    this._requireActiveStrategy();
    return this._activeStrategy.resumeSession();
  }

  /**
   * Reset all team scores to zero
   * @returns {Promise<{success: boolean}>}
   */
  async resetScores() {
    this._requireActiveStrategy();
    return this._activeStrategy.resetScores();
  }

  /**
   * Dispose of resources - clean up event listeners and strategies
   * Call when manager is no longer needed to prevent memory leaks
   */
  dispose() {
    // Unwire event listeners from all strategies
    if (this._localStrategy) {
      this._unwireStrategyEvents(this._localStrategy);
      this._localStrategy.dispose();
    }
    if (this._networkedStrategy) {
      this._unwireStrategyEvents(this._networkedStrategy);
      this._networkedStrategy.dispose();
    }

    // Clear references
    this._activeStrategy = null;
    this._localStrategy = null;
    this._networkedStrategy = null;
    this._strategyListeners.clear();
    this.scannedTokens = new Set();

    this._log('Disposed');
  }

  /**
   * Ensure active strategy exists
   * @private
   */
  _requireActiveStrategy() {
    if (!this._activeStrategy) {
      throw new Error('UnifiedDataManager: No active strategy. Call initializeStandaloneMode() or initializeNetworkedMode() first.');
    }
  }

  // ============================================================================
  // UTILITY METHODS - Backward compatibility with DataManager/StandaloneDataManager
  // ============================================================================

  /**
   * Check if token has been scanned
   * @param {string} tokenId
   * @returns {boolean}
   */
  isTokenScanned(tokenId) {
    return this.scannedTokens.has(tokenId);
  }

  /**
   * Mark token as scanned
   * @param {string} tokenId
   */
  markTokenAsScanned(tokenId) {
    this.scannedTokens.add(tokenId);
  }

  /**
   * Unmark token as scanned (for re-scanning after deletion)
   * @param {string} tokenId
   */
  unmarkTokenAsScanned(tokenId) {
    this.scannedTokens.delete(tokenId);
  }

  /**
   * Calculate token value based on rating and type
   * @param {Object} transaction - Transaction with valueRating and memoryType
   * @returns {number}
   */
  calculateTokenValue(transaction) {
    return calcTokenValue(transaction);
  }

  /**
   * Get transactions for a specific team
   * @param {string} teamId
   * @returns {Array}
   */
  getTeamTransactions(teamId) {
    const transactions = this.getTransactions();
    return transactions.filter(tx => tx.teamId === teamId);
  }

  // ============================================================================
  // ADVANCED METHODS - Group completion, session reset, etc.
  // ============================================================================

  /**
   * Parse group info from group string
   * @param {string} groupString - e.g., "Server Logs (x5)"
   * @returns {Object} { name, multiplier }
   */
  parseGroupInfo(groupString) {
    return parseGroup(groupString);
  }

  /**
   * Normalize group name for comparison
   * Delegates to shared scoring.js implementation for consistency
   * @param {string} groupName
   * @returns {string}
   */
  normalizeGroupName(groupName) {
    return sharedNormalizeGroupName(groupName);
  }

  /**
   * Reset for new session - clears scannedTokens and emits data:cleared
   * @param {string|null} sessionId - New session ID (null to clear)
   */
  resetForNewSession(sessionId = null) {
    this.currentSessionId = sessionId;
    this.scannedTokens.clear();

    if (this._localStrategy) {
      this._localStrategy.scannedTokens?.clear();
    }
    if (this._networkedStrategy) {
      this._networkedStrategy.scannedTokens?.clear();
      this._networkedStrategy.transactions = [];
      this._networkedStrategy.playerScans = [];
      this._networkedStrategy.backendScores?.clear();
      this._networkedStrategy.setSessionId?.(sessionId);
    }

    this._log(`Reset for new session: ${sessionId || 'none'}`);
    this.dispatchEvent(new CustomEvent('data:cleared'));
  }

  /**
   * Get team completed groups
   * @param {string} teamId
   * @returns {Array} Completed group names
   */
  getTeamCompletedGroups(teamId) {
    // Delegate to strategy if available
    if (this._activeStrategy?.getTeamCompletedGroups) {
      return this._activeStrategy.getTeamCompletedGroups(teamId);
    }
    return [];
  }

  /**
   * Get enhanced team transactions with grouping for team details display
   * @param {string} teamId - Team ID
   * @returns {Object} Grouped transaction data with completed/incomplete groups
   */
  getEnhancedTeamTransactions(teamId) {
    const transactions = this.getTeamTransactions(teamId);
    const groupInventory = this.tokenManager?.getGroupInventory() || {};
    const completedGroups = this.getTeamCompletedGroups(teamId);
    const completedGroupNames = new Set(completedGroups.map(g => g.normalizedName));

    // Calculate bonus values
    const groupBonusData = {};
    completedGroups.forEach(group => {
      groupBonusData[group.normalizedName] = {
        displayName: group.name,
        multiplier: group.multiplier,
        tokens: [],
        totalBaseValue: 0,
        bonusValue: 0
      };
    });

    // Organize transactions
    const completedGroupTokens = {};
    const incompleteGroupTokens = {};
    const ungroupedTokens = [];
    const unknownTokens = [];

    transactions.forEach(t => {
      if (t.isUnknown) {
        unknownTokens.push(t);
        return;
      }

      const groupInfo = this.parseGroupInfo(t.group);
      const normalizedGroupName = this.normalizeGroupName(groupInfo.name);
      const groupData = groupInventory[normalizedGroupName];

      if (!groupData || groupData.tokens.size <= 1) {
        ungroupedTokens.push(t);
        return;
      }

      const tokenValue = this.calculateTokenValue(t);

      if (completedGroupNames.has(normalizedGroupName)) {
        // Completed group
        if (!completedGroupTokens[normalizedGroupName]) {
          completedGroupTokens[normalizedGroupName] = [];
        }
        completedGroupTokens[normalizedGroupName].push(t);

        if (groupBonusData[normalizedGroupName]) {
          groupBonusData[normalizedGroupName].tokens.push(t);
          groupBonusData[normalizedGroupName].totalBaseValue += tokenValue;
          groupBonusData[normalizedGroupName].bonusValue += tokenValue * (groupInfo.multiplier - 1);
        }
      } else {
        // Incomplete group
        if (!incompleteGroupTokens[normalizedGroupName]) {
          incompleteGroupTokens[normalizedGroupName] = {
            displayName: groupData.displayName,
            multiplier: groupData.multiplier,
            tokens: [],
            totalTokens: groupData.tokens.size,
            collectedTokens: 0
          };
        }
        incompleteGroupTokens[normalizedGroupName].tokens.push(t);
      }
    });

    // Calculate progress
    Object.keys(incompleteGroupTokens).forEach(normalizedName => {
      const group = incompleteGroupTokens[normalizedName];
      group.collectedTokens = group.tokens.length;
      group.progress = `${group.collectedTokens}/${group.totalTokens}`;
      group.percentage = Math.round((group.collectedTokens / group.totalTokens) * 100);
    });

    // Convert to arrays and sort
    const completedGroupsArray = Object.entries(completedGroupTokens).map(([normalizedName, tokens]) => ({
      ...groupBonusData[normalizedName],
      normalizedName,
      tokens
    })).sort((a, b) => b.bonusValue - a.bonusValue);

    const incompleteGroupsArray = Object.values(incompleteGroupTokens)
      .sort((a, b) => b.percentage - a.percentage);

    return {
      completedGroups: completedGroupsArray,
      incompleteGroups: incompleteGroupsArray,
      ungroupedTokens,
      unknownTokens,
      hasCompletedGroups: completedGroupsArray.length > 0,
      hasIncompleteGroups: incompleteGroupsArray.length > 0,
      hasUngroupedTokens: ungroupedTokens.length > 0,
      hasUnknownTokens: unknownTokens.length > 0
    };
  }

  /**
   * Calculate team score with group completion bonuses
   * @param {string} teamId - Team ID
   * @returns {Object} Score breakdown
   */
  calculateTeamScoreWithBonuses(teamId) {
    const transactions = this.getTeamTransactions(teamId).filter(t =>
      t.mode === 'blackmarket' && !t.isUnknown
    );

    const completedGroups = this.getTeamCompletedGroups(teamId);
    const completedGroupNames = new Set(
      completedGroups.map(g => g.normalizedName)
    );

    let baseScore = 0;
    let bonusScore = 0;
    const groupBreakdown = {};

    // Initialize breakdown for completed groups
    completedGroups.forEach(group => {
      groupBreakdown[group.name] = {
        tokens: 0,
        baseValue: 0,
        bonusValue: 0,
        multiplier: group.multiplier
      };
    });

    // Calculate scores for each transaction
    transactions.forEach(t => {
      const tokenBaseValue = this.calculateTokenValue(t);
      baseScore += tokenBaseValue;

      // Check if this token's group is completed
      const groupInfo = this.parseGroupInfo(t.group);
      const normalizedGroupName = this.normalizeGroupName(groupInfo.name);

      if (completedGroupNames.has(normalizedGroupName)) {
        // Apply bonus (multiplier - 1) × base value
        const bonusAmount = tokenBaseValue * (groupInfo.multiplier - 1);
        bonusScore += bonusAmount;

        // Track in breakdown
        if (groupBreakdown[groupInfo.name]) {
          groupBreakdown[groupInfo.name].tokens++;
          groupBreakdown[groupInfo.name].baseValue += tokenBaseValue;
          groupBreakdown[groupInfo.name].bonusValue += bonusAmount;
        }
      }
    });

    this._log(`Team ${teamId}: Base=$${baseScore}, Bonus=$${bonusScore}`);

    return {
      baseScore,
      bonusScore,
      totalScore: baseScore + bonusScore,
      completedGroups: completedGroups.length,
      groupBreakdown
    };
  }

  /**
   * Get session stats for the current team
   * @returns {Object} { count, totalValue, totalScore }
   */
  getSessionStats() {
    const currentTeamId = this.app?.currentTeamId;

    if (!currentTeamId) {
      return { count: 0, totalValue: 0, totalScore: 0 };
    }

    const teamTransactions = this.getTeamTransactions(currentTeamId);
    const count = teamTransactions.length;
    const knownTokens = teamTransactions.filter(t => !t.isUnknown);
    const totalValue = knownTokens.reduce((sum, t) => sum + (t.valueRating || 0), 0);

    // Get team score from teamScores
    const scores = this.getTeamScores();
    const teamScore = scores.find(s => s.teamId === currentTeamId);
    const totalScore = teamScore?.score || 0;

    return { count, totalValue, totalScore };
  }

  /**
   * Get global stats across all teams
   * @returns {Object} { total, teams, totalValue, avgValue, blackMarketScore }
   */
  getGlobalStats() {
    const transactions = this.getTransactions();
    const total = transactions.length;

    // Count unique teams
    const teamIds = [...new Set(transactions.map(t => t.teamId))];
    const teams = teamIds.length;

    // Calculate black market score from team scores
    const teamScores = this.getTeamScores();
    const blackMarketScore = teamScores.reduce((sum, ts) => sum + (ts.score || 0), 0);

    // totalValue derived from blackMarketScore (display format)
    const totalValue = Math.floor(blackMarketScore / 1000);
    const known = transactions.filter(t => !t.isUnknown);
    const avgValue = known.length > 0 ? (totalValue / known.length).toFixed(1) : 0;

    return { total, teams, totalValue, avgValue, blackMarketScore };
  }

  // ============================================================================
  // WEBSOCKET EVENT HANDLERS - Facade methods for NetworkedSession
  // These delegate storage updates to the active strategy and emit UI events
  // ============================================================================

  /**
   * Update team score from backend WebSocket event
   * Called by NetworkedSession on 'score:updated' and 'sync:full'
   * @param {Object} scoreData - Score data from backend
   */
  updateTeamScoreFromBackend(scoreData) {
    if (!this._networkedStrategy) {
      this._log('updateTeamScoreFromBackend called but no networked strategy active', true);
      return;
    }

    // Delegate storage update to strategy
    this._networkedStrategy.setBackendScores(scoreData.teamId, {
      currentScore: scoreData.currentScore,
      baseScore: scoreData.baseScore,
      bonusPoints: scoreData.bonusPoints,
      tokensScanned: scoreData.tokensScanned,
      completedGroups: scoreData.completedGroups,
      adminAdjustments: scoreData.adminAdjustments || [],
      lastUpdate: scoreData.lastUpdate
    });

    // Emit event for UI updates
    this.dispatchEvent(new CustomEvent('team-score:updated', {
      detail: {
        teamId: scoreData.teamId,
        scoreData,
        transactions: this.getTeamTransactions(scoreData.teamId)
      }
    }));

    this._log(`Score updated from backend for team ${scoreData.teamId}: $${scoreData.currentScore}`);
  }

  /**
   * Handle player scan event from WebSocket broadcast
   * Called by NetworkedSession on 'player:scan'
   * @param {Object} payload - Player scan event payload
   */
  handlePlayerScan(payload) {
    if (!this._networkedStrategy) {
      this._log('handlePlayerScan called but no networked strategy active', true);
      return;
    }

    const playerScan = {
      id: payload.scanId,
      tokenId: payload.tokenId,
      deviceId: payload.deviceId,
      timestamp: payload.timestamp,
      memoryType: payload.memoryType || null,
      videoQueued: payload.videoQueued || false,
      tokenData: payload.tokenData || null
    };

    // Delegate storage update to strategy
    this._networkedStrategy.addPlayerScan(playerScan);

    // Emit event for UI updates
    this.dispatchEvent(new CustomEvent('player-scan:added', {
      detail: { playerScan }
    }));

    this._log(`Player scan added: ${payload.tokenId} from ${payload.deviceId}`);
  }

  /**
   * Set player scans from sync:full payload
   * Called by NetworkedSession on reconnect to restore state
   * @param {Array} playerScans - Array of player scan records from server
   */
  setPlayerScansFromServer(playerScans) {
    if (!this._networkedStrategy) {
      this._log('setPlayerScansFromServer called but no networked strategy active', true);
      return;
    }

    if (!Array.isArray(playerScans)) {
      this._log('setPlayerScansFromServer: invalid input (not array)', true);
      return;
    }

    this._networkedStrategy.setPlayerScans(playerScans);
    this._log(`Synced ${playerScans.length} player scans from server`);

    // Emit event for UI updates
    this.dispatchEvent(new CustomEvent('player-scans:synced', {
      detail: { count: playerScans.length }
    }));
  }

  /**
   * Set scanned tokens from sync:full payload
   * Called by NetworkedSession on reconnect to restore duplicate tracking
   * @param {Array} tokens - Array of token IDs that have been scanned
   */
  setScannedTokensFromServer(tokens) {
    if (!this._networkedStrategy) {
      this._log('setScannedTokensFromServer called but no networked strategy active', true);
      return;
    }

    if (!Array.isArray(tokens)) {
      this._log('setScannedTokensFromServer: invalid input (not array)', true);
      return;
    }

    this._networkedStrategy.setScannedTokens(tokens);
    // Sync local reference
    this._syncScannedTokens();
    this._log(`Synced ${tokens.length} scanned tokens from server`);
  }

  /**
   * Clear all backend scores
   * Called by NetworkedSession on 'scores:reset'
   */
  clearBackendScores() {
    if (!this._networkedStrategy) {
      this._log('clearBackendScores called but no networked strategy active', true);
      return;
    }

    this._networkedStrategy.clearBackendScores();
    this._log('Backend scores cleared');

    // Emit event for UI updates
    this.dispatchEvent(new CustomEvent('scores:cleared'));
  }
}
