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

    // Ephemeral state (video, cues, etc.)
    this.videoState = {
      nowPlaying: null,
      isPlaying: false,
      progress: 0,
      duration: 0
    };

    // Phase 2: Cue State
    this.cueState = {
      cues: new Map(),        // Static definitions: id -> { name, type, ... }
      activeCues: new Map(),  // Running cues: Map<cueId, { state, progress, duration }>
      disabledCues: new Set() // Manually disabled: Set<cueId>
    };

    // Phase 3: Environment State
    this.environmentState = {
      lighting: {
        connected: false,
        activeScene: null,
        scenes: []
      },
      audio: {
        routes: {}, // stream -> sink
        ducking: {}, // stream -> { ducked, volume }
        availableSinks: [] // list of sink objects
      },
      bluetooth: {
        scanning: false,
        foundedDevices: [], // Discovered during scan
        pairedDevices: [],
        connectedDevices: []
      }
    };

    // Phase 3: Session State (Reactive)
    this.sessionState = {
      id: null,
      name: null,
      status: 'disconnected',
      teams: [],
      metadata: {}
    };

    // Bind methods
    // this.handleUpdate = this.handleUpdate.bind(this); // Removed: unused
    // this.handleSync = this.handleSync.bind(this); // Removed: unused
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

  // ============================================================================
  // EPHEMERAL STATE MANAGEMENT - New State Store Pattern
  // ============================================================================

  /**
   * Get current video state
   * @returns {Object} { nowPlaying, isPlaying, progress, duration }
   */
  getVideoState() {
    return { ...this.videoState };
  }

  /**
   * Update video state and emit event
   * @param {Object} payload - Partial video state
   */
  updateVideoState(payload) {
    // Phase 1: Map backend payload to UI state
    // Backend sends: { status: 'playing'|'paused'|'idle', tokenId, progress, duration }
    // UI expects: { isPlaying: boolean, nowPlaying: string (filename/name), progress: number, duration: number }

    const newState = { ...this.videoState, ...payload };

    // 1. Map status to isPlaying
    if (payload.status) {
      newState.isPlaying = (payload.status === 'playing' || payload.status === 'loading');
    }

    // 2. Map tokenId to nowPlaying (filename)
    if (payload.tokenId) {
      // TokenManager uses findToken which returns { token, matchedId }
      const result = this.tokenManager?.findToken(payload.tokenId);
      const token = result?.token;

      if (token) {
        newState.nowPlaying = token.video || token.name || 'Unknown Video';
      } else {
        newState.nowPlaying = `Token: ${payload.tokenId}`;
      }
    } else if (payload.status === 'idle') {
      newState.nowPlaying = null; // Clear title on idle
    }

    this.videoState = newState;

    this.dispatchEvent(new CustomEvent('video-state:updated', {
      detail: this.getVideoState()
    }));
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

  // ============================================================================
  // PHASE 2: CUE STATE MANAGEMENT
  // ============================================================================

  /**
   * Get current cue state
   * @returns {Object} { cues: Map, activeCues: Set, disabledCues: Set }
   */
  getCueState() {
    return {
      cues: this.cueState.cues,
      activeCues: this.cueState.activeCues,
      disabledCues: this.cueState.disabledCues
    };
  }

  /**
   * Load static cue definitions
   * @param {Array} cues - Array of cue objects
   */
  loadCues(cues) {
    this.cueState.cues.clear();
    if (Array.isArray(cues)) {
      cues.forEach(cue => {
        this.cueState.cues.set(cue.id, cue);
      });
    }
    this._log(`Loaded ${this.cueState.cues.size} cue definitions`);
  }

  /**
   * Update cue status (started, completed, paused, etc.)
   * @param {Object} payload - { cueId, state, progress, duration }
   */
  updateCueStatus(payload) {
    const { cueId, state } = payload;

    // Update active map based on state
    if (state === 'running' || state === 'paused') {
      this.cueState.activeCues.set(cueId, payload);
    } else if (state === 'completed' || state === 'stopped' || state === 'idle' || state === 'error') {
      this.cueState.activeCues.delete(cueId);
    }

    this._dispatchCueUpdate();
    this._log(`Cue status updated: ${cueId} -> ${state}`);
  }

  /**
   * Update cue configuration (enable/disable)
   * @param {Object} payload - { cueId, enabled }
   */
  updateCueConfig(payload) {
    const { cueId, enabled } = payload;

    if (enabled) {
      this.cueState.disabledCues.delete(cueId);
    } else {
      this.cueState.disabledCues.add(cueId);
    }

    this._dispatchCueUpdate();
    this._log(`Cue config updated: ${cueId} -> enabled=${enabled}`);
  }

  /**
   * Handle cue conflict event
   * @param {Object} payload - { cueId, conflictType, details }
   */
  handleCueConflict(payload) {
    this.dispatchEvent(new CustomEvent('cue:conflict', {
      detail: payload
    }));
    this._log(`Cue conflict reported: ${payload.cueId} (${payload.conflictType})`);
  }

  /**
   * Helper to dispatch cue state update
   * @private
   */
  _dispatchCueUpdate() {
    this.dispatchEvent(new CustomEvent('cue-state:updated', {
      detail: this.getCueState()
    }));
  }

  // ============================================================================
  // PHASE 3: ENVIRONMENT & SESSION STATE MANAGEMENT
  // ============================================================================

  /**
   * Update Lighting State
   * @param {Object} payload - { connected, sceneId, sceneName, type: 'refreshed', scenes }
   */
  updateLightingState(payload) {
    const { lighting } = this.environmentState;
    let changed = false;

    if (payload.connected !== undefined && lighting.connected !== payload.connected) {
      lighting.connected = payload.connected;
      changed = true;
    }

    if (payload.sceneId) {
      lighting.activeScene = { id: payload.sceneId, name: payload.sceneName || payload.sceneId };
      changed = true;
    }

    if (payload.type === 'refreshed' && Array.isArray(payload.scenes)) {
      lighting.scenes = payload.scenes;
      changed = true;
    }

    if (changed) {
      this.dispatchEvent(new CustomEvent('lighting-state:updated', {
        detail: { lighting: { ...lighting } }
      }));
    }
  }

  /**
   * Update Audio Routing State
   * @param {Object} payload - { stream, sink }
   */
  updateAudioState(payload) {
    let changed = false;

    if (payload.availableSinks) {
      this.environmentState.audio.availableSinks = payload.availableSinks;
      changed = true;
    }

    if (payload.routes) {
      this.environmentState.audio.routes = { ...payload.routes };
      changed = true;
    }

    if (payload.stream && payload.sink) {
      this.environmentState.audio.routes[payload.stream] = payload.sink;
      changed = true;
    }

    if (changed) {
      this.dispatchEvent(new CustomEvent('audio-state:updated', {
        detail: { audio: { ...this.environmentState.audio } }
      }));
    }
  }

  /**
   * Update Audio Ducking Status
   * @param {Object} payload - { stream, ducked, volume }
   */
  updateAudioDucking(payload) {
    if (payload.stream) {
      this.environmentState.audio.ducking[payload.stream] = {
        ducked: payload.ducked,
        volume: payload.volume
      };
      this.dispatchEvent(new CustomEvent('audio-state:updated', {
        detail: { audio: { ...this.environmentState.audio } }
      }));
    }
  }

  /**
   * Update Bluetooth Scanning Status
   * @param {Object} payload - { scanning }
   */
  updateBluetoothScan(payload) {
    if (payload.scanning !== undefined) {
      this.environmentState.bluetooth.scanning = payload.scanning;
      // Clear founded devices on scan start? Maybe prefer manual clear.
      // For now, just update status.
      this.dispatchEvent(new CustomEvent('bluetooth-state:updated', {
        detail: { bluetooth: { ...this.environmentState.bluetooth } }
      }));
    }
  }

  /**
   * Update Bluetooth Device List
   * @param {Object} payload - { type: 'discovered'|'connected'|'paired'|..., device }
   */
  updateBluetoothDevice(payload) {
    const { type, device } = payload;
    const btState = this.environmentState.bluetooth;

    if (!device || !device.address) return;

    if (type === 'discovered') {
      // Add or update in foundedDevices
      const idx = btState.foundedDevices.findIndex(d => d.address === device.address);
      if (idx >= 0) {
        btState.foundedDevices[idx] = device;
      } else {
        btState.foundedDevices.push(device);
      }
    } else if (type === 'connected') {
      // Add to connectedDevices
      const idx = btState.connectedDevices.findIndex(d => d.address === device.address);
      if (idx >= 0) {
        btState.connectedDevices[idx] = device;
      } else {
        btState.connectedDevices.push(device);
      }
    } else if (type === 'disconnected') {
      // Remove from connectedDevices
      btState.connectedDevices = btState.connectedDevices.filter(d => d.address !== device.address);
    } else if (type === 'paired') {
      // Add to pairedDevices
      const idx = btState.pairedDevices.findIndex(d => d.address === device.address);
      if (idx >= 0) {
        btState.pairedDevices[idx] = device;
      } else {
        btState.pairedDevices.push(device);
      }
    } else if (type === 'unpaired') {
      // Remove from pairedDevices AND connectedDevices
      btState.pairedDevices = btState.pairedDevices.filter(d => d.address !== device.address);
      btState.connectedDevices = btState.connectedDevices.filter(d => d.address !== device.address);
    }

    this.dispatchEvent(new CustomEvent('bluetooth-state:updated', {
      detail: { bluetooth: { ...btState } }
    }));
  }

  /**
   * Update full Bluetooth state (from sync:full)
   * @param {Object} payload - { scanning, pairedDevices, connectedDevices }
   */
  updateBluetoothState(payload) {
    if (!payload) return;

    const btState = this.environmentState.bluetooth;
    let changed = false;

    if (payload.scanning !== undefined) {
      btState.scanning = payload.scanning;
      changed = true;
    }

    if (Array.isArray(payload.pairedDevices)) {
      btState.pairedDevices = payload.pairedDevices; // Replace entire list
      changed = true;
    }

    if (Array.isArray(payload.connectedDevices)) {
      btState.connectedDevices = payload.connectedDevices; // Replace entire list
      changed = true;
    }

    // Merge discovered devices if needed, or keep existing ephemeral ones
    // Usually sync:full doesn't send discovered devices (unless we add it to defaults)

    if (changed) {
      this.dispatchEvent(new CustomEvent('bluetooth-state:updated', {
        detail: { bluetooth: { ...btState } }
      }));
    }
  }

  /**
   * Update Session State
   * @param {Object} payload - Session object
   */
  updateSessionState(payload) {
    this.sessionState = {
      ...this.sessionState,
      ...payload
    };

    // Also update tracking property for consistency
    if (payload.id) {
      this.currentSessionId = payload.id;
    }

    this.dispatchEvent(new CustomEvent('session-state:updated', {
      detail: { session: this.sessionState }
    }));
  }
}
