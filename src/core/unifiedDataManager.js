/**
 * UnifiedDataManager - Single entry point for data operations
 * Delegates to LocalStorage or NetworkedStorage based on session mode
 *
 * @module core/unifiedDataManager
 */

import { LocalStorage } from './storage/LocalStorage.js';
import { NetworkedStorage } from './storage/NetworkedStorage.js';
import { DataManagerUtils } from './dataManagerUtils.js';
import {
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
    return DataManagerUtils.isTokenScanned(this.scannedTokens, tokenId);
  }

  /**
   * Mark token as scanned
   * @param {string} tokenId
   */
  markTokenAsScanned(tokenId) {
    DataManagerUtils.markTokenAsScanned(this.scannedTokens, tokenId);
  }

  /**
   * Unmark token as scanned (for re-scanning after deletion)
   * @param {string} tokenId
   */
  unmarkTokenAsScanned(tokenId) {
    DataManagerUtils.unmarkTokenAsScanned(this.scannedTokens, tokenId);
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
   */
  resetForNewSession() {
    this.scannedTokens.clear();
    if (this._localStrategy) {
      this._localStrategy.scannedTokens?.clear();
    }
    if (this._networkedStrategy) {
      this._networkedStrategy.scannedTokens?.clear();
    }
    this.dispatchEvent(new CustomEvent('data:cleared'));
  }

  /**
   * Clear all data - same as resetForNewSession
   */
  clearAllData() {
    this.resetForNewSession();
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
   * Get enhanced team transactions with score info
   * @param {string} teamId
   * @returns {Object} { teamId, transactions, score, tokensScanned }
   */
  getEnhancedTeamTransactions(teamId) {
    const transactions = this.getTeamTransactions(teamId);
    const scores = this.getTeamScores();
    const teamScore = scores.find(s => s.teamId === teamId);

    return {
      teamId,
      transactions,
      score: teamScore?.score || 0,
      tokensScanned: transactions.length
    };
  }
}
