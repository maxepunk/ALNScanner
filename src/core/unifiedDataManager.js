/**
 * UnifiedDataManager - Single entry point for data operations
 * Delegates to LocalStorage or NetworkedStorage based on session mode
 *
 * @module core/unifiedDataManager
 */

import { LocalStorage } from './storage/LocalStorage.js';
import { NetworkedStorage } from './storage/NetworkedStorage.js';

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

    // Expose scannedTokens for backward compatibility
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
   * @private
   */
  _syncScannedTokens() {
    if (this._activeStrategy?.scannedTokens) {
      this.scannedTokens = this._activeStrategy.scannedTokens;
    }
  }

  /**
   * Wire event forwarding from strategy to manager
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
      'player-scan:added'
    ];

    events.forEach(eventName => {
      strategy.addEventListener(eventName, (event) => {
        this.dispatchEvent(new CustomEvent(eventName, { detail: event.detail }));
      });
    });
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
   * Ensure active strategy exists
   * @private
   */
  _requireActiveStrategy() {
    if (!this._activeStrategy) {
      throw new Error('UnifiedDataManager: No active strategy. Call initializeStandaloneMode() or initializeNetworkedMode() first.');
    }
  }
}
