/**
 * NetworkedStorage Strategy - WebSocket backend communication
 * Implements IStorageStrategy for networked mode operation
 *
 * @module core/storage/NetworkedStorage
 */

import { IStorageStrategy } from './IStorageStrategy.js';
import { calculateTokenValue } from '../scoring.js';

export class NetworkedStorage extends IStorageStrategy {
  /**
   * Create NetworkedStorage instance
   * @param {Object} options - Dependencies
   * @param {Object} options.socket - Socket.io client
   * @param {Object} options.tokenManager - TokenManager instance
   * @param {Object} [options.debug] - Debug instance
   */
  constructor({ socket, tokenManager, debug } = {}) {
    super();

    this.socket = socket;
    this.tokenManager = tokenManager;
    this.debug = debug;

    // Local cache (synced from backend)
    this.transactions = [];
    this.backendScores = new Map();
    this.scannedTokens = new Set();
    this.playerScans = [];
    this.currentSessionId = null;
  }

  /**
   * Check if storage is ready/connected
   * @returns {boolean}
   */
  isReady() {
    return this.socket?.connected === true;
  }

  /**
   * Initialize storage
   * @returns {Promise<void>}
   */
  async initialize() {
    // Setup event listeners for sync
    this._setupEventListeners();
  }

  /**
   * Setup event listeners
   * Note: These are typically set up by NetworkedSession which owns the socket
   * This is a pass-through storage that delegates to backend
   * @private
   */
  _setupEventListeners() {
    if (!this.socket) return;
    // Event listeners handled by NetworkedSession
  }

  /**
   * Add transaction - delegates to backend
   * @param {Transaction} transaction - Transaction data
   * @returns {Promise<TransactionResult>}
   */
  async addTransaction(transaction) {
    // Validate required fields
    if (!transaction || !transaction.teamId) {
      return {
        success: false,
        error: 'Transaction must have teamId'
      };
    }

    // Check socket connection
    if (!this.isReady()) {
      this.debug?.log('[NetworkedStorage] Cannot add transaction: socket not connected', true);
      return {
        success: false,
        error: 'Socket not connected'
      };
    }

    this.debug?.log(`[NetworkedStorage] Submitting transaction: ${transaction.tokenId} for team ${transaction.teamId}`);

    this.socket.emit('transaction:submit', {
      tokenId: transaction.tokenId,
      teamId: transaction.teamId,
      deviceId: transaction.deviceId,
      deviceType: 'gm',
      mode: transaction.mode,
      timestamp: transaction.timestamp || new Date().toISOString()
    });

    // Mark locally for duplicate prevention
    if (transaction.tokenId) {
      this.scannedTokens.add(transaction.tokenId);
    }

    // Return pending - actual result comes via WebSocket broadcast
    return {
      success: true,
      pending: true
    };
  }

  /**
   * Remove transaction - delegates to backend
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<TransactionResult>}
   */
  async removeTransaction(transactionId) {
    if (!this.isReady()) {
      this.debug?.log('[NetworkedStorage] Cannot remove transaction: socket not connected', true);
      return { success: false, error: 'Socket not connected' };
    }

    this.debug?.log(`[NetworkedStorage] Removing transaction: ${transactionId}`);

    this.socket.emit('gm:command', {
      event: 'gm:command',
      data: {
        action: 'transaction:delete',
        payload: { transactionId }
      },
      timestamp: new Date().toISOString()
    });

    return { success: true, pending: true };
  }

  /**
   * Get all transactions from local cache
   * @returns {Array}
   */
  getTransactions() {
    return this.transactions;
  }

  /**
   * Get team scores from backend cache
   * @returns {Array}
   */
  getTeamScores() {
    if (this.backendScores.size === 0) {
      return [];
    }

    return Array.from(this.backendScores.entries())
      .map(([teamId, score]) => ({
        teamId,
        score: score.currentScore,
        baseScore: score.baseScore,
        bonusScore: score.bonusPoints,
        tokenCount: score.tokensScanned,
        completedGroups: score.completedGroups?.length || 0,
        isFromBackend: true
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Adjust team score - delegates to backend
   * @param {string} teamId - Team identifier
   * @param {number} delta - Score adjustment
   * @param {string} reason - Reason for adjustment
   * @returns {Promise<TransactionResult>}
   */
  async adjustTeamScore(teamId, delta, reason) {
    if (!this.isReady()) {
      this.debug?.log('[NetworkedStorage] Cannot adjust score: socket not connected', true);
      return { success: false, error: 'Socket not connected' };
    }

    this.debug?.log(`[NetworkedStorage] Adjusting score for team ${teamId}: ${delta > 0 ? '+' : ''}${delta} (${reason})`);

    this.socket.emit('gm:command', {
      event: 'gm:command',
      data: {
        action: 'score:adjust',
        payload: { teamId, delta, reason }
      },
      timestamp: new Date().toISOString()
    });

    return { success: true, pending: true };
  }

  /**
   * Get unified game activity
   * Matches LocalStorage.getGameActivity() API for parity
   * @returns {Object} { tokens: Array, stats: Object }
   */
  getGameActivity() {
    const tokenMap = new Map();

    // Process player scans (discoveries)
    this.playerScans.forEach(scan => {
      if (!tokenMap.has(scan.tokenId)) {
        const tokenData = scan.tokenData || {};
        tokenMap.set(scan.tokenId, {
          tokenId: scan.tokenId,
          tokenData,
          potentialValue: calculateTokenValue({
            valueRating: tokenData.SF_ValueRating,
            memoryType: tokenData.SF_MemoryType
          }),
          events: [{
            type: 'discovery',
            timestamp: scan.timestamp,
            deviceId: scan.deviceId
          }],
          status: 'available',
          discoveredByPlayers: true
        });
      } else {
        tokenMap.get(scan.tokenId).events.push({
          type: 'scan',
          timestamp: scan.timestamp,
          deviceId: scan.deviceId
        });
      }
    });

    // Process transactions (claims)
    this.transactions.forEach(tx => {
      if (tx.status && tx.status !== 'accepted') return;

      let activity = tokenMap.get(tx.tokenId);

      if (!activity) {
        const lookedUpToken = this.tokenManager?.findToken(tx.tokenId);
        const tokenData = lookedUpToken ? {
          SF_MemoryType: lookedUpToken.SF_MemoryType,
          SF_ValueRating: lookedUpToken.SF_ValueRating,
          SF_Group: lookedUpToken.SF_Group,
          summary: lookedUpToken.summary
        } : {
          SF_MemoryType: tx.memoryType,
          SF_ValueRating: tx.valueRating
        };

        activity = {
          tokenId: tx.tokenId,
          tokenData,
          potentialValue: calculateTokenValue({
            valueRating: tokenData.SF_ValueRating,
            memoryType: tokenData.SF_MemoryType
          }),
          events: [],
          status: 'claimed',
          discoveredByPlayers: false
        };
        tokenMap.set(tx.tokenId, activity);
      }

      activity.events.push({
        type: 'claim',
        timestamp: tx.timestamp,
        mode: tx.mode,
        teamId: tx.teamId,
        // Use stored points (from backend) if available, fall back to recalculation
        points: tx.points || calculateTokenValue({
          valueRating: tx.valueRating,
          memoryType: tx.memoryType
        }),
        summary: tx.summary || activity.tokenData?.summary
      });
      activity.status = 'claimed';
    });

    // Sort events within each token
    tokenMap.forEach(activity => {
      activity.events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    });

    const tokens = Array.from(tokenMap.values());

    return {
      tokens,
      stats: {
        totalTokens: tokens.length,
        available: tokens.filter(t => t.status === 'available').length,
        claimed: tokens.filter(t => t.status === 'claimed').length,
        claimedWithoutDiscovery: tokens.filter(t => !t.discoveredByPlayers && t.status === 'claimed').length,
        totalPlayerScans: this.playerScans.length
      }
    };
  }

  /**
   * Create a new session - delegates to backend
   * @param {string} name - Session name
   * @param {Array} teams - Initial teams
   * @returns {Promise<Object>}
   */
  async createSession(name, teams) {
    if (!this.isReady()) {
      this.debug?.log('[NetworkedStorage] Cannot create session: socket not connected', true);
      return { success: false, error: 'Socket not connected' };
    }

    this.debug?.log(`[NetworkedStorage] Creating session: ${name}`);

    this.socket.emit('gm:command', {
      event: 'gm:command',
      data: {
        action: 'session:create',
        payload: { name, teams }
      },
      timestamp: new Date().toISOString()
    });

    return { pending: true };
  }

  /**
   * End the current session - delegates to backend
   * @returns {Promise<void>}
   */
  async endSession() {
    if (!this.isReady()) {
      this.debug?.log('[NetworkedStorage] Cannot end session: socket not connected', true);
      return;
    }

    this.debug?.log('[NetworkedStorage] Ending session');

    this.socket.emit('gm:command', {
      event: 'gm:command',
      data: { action: 'session:end', payload: {} },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get current session info
   * @returns {SessionInfo|null}
   */
  getCurrentSession() {
    return this.currentSessionId ? {
      sessionId: this.currentSessionId,
      status: 'active'
    } : null;
  }

  /**
   * Pause the current session - delegates to backend
   * @returns {Promise<Object>}
   */
  async pauseSession() {
    if (!this.isReady()) {
      this.debug?.log('[NetworkedStorage] Cannot pause session: socket not connected', true);
      return { success: false, error: 'Socket not connected' };
    }

    this.debug?.log('[NetworkedStorage] Pausing session');

    this.socket.emit('gm:command', {
      event: 'gm:command',
      data: { action: 'session:pause', payload: {} },
      timestamp: new Date().toISOString()
    });

    return { success: true, pending: true };
  }

  /**
   * Resume the current session - delegates to backend
   * @returns {Promise<Object>}
   */
  async resumeSession() {
    if (!this.isReady()) {
      this.debug?.log('[NetworkedStorage] Cannot resume session: socket not connected', true);
      return { success: false, error: 'Socket not connected' };
    }

    this.debug?.log('[NetworkedStorage] Resuming session');

    this.socket.emit('gm:command', {
      event: 'gm:command',
      data: { action: 'session:resume', payload: {} },
      timestamp: new Date().toISOString()
    });

    return { success: true, pending: true };
  }

  /**
   * Reset all scores - delegates to backend
   * @returns {Promise<Object>}
   */
  async resetScores() {
    if (!this.isReady()) {
      this.debug?.log('[NetworkedStorage] Cannot reset scores: socket not connected', true);
      return { success: false, error: 'Socket not connected' };
    }

    this.debug?.log('[NetworkedStorage] Resetting all scores');

    this.socket.emit('gm:command', {
      event: 'gm:command',
      data: { action: 'scores:reset', payload: {} },
      timestamp: new Date().toISOString()
    });

    return { success: true, pending: true };
  }

  // ========================================
  // Cache update methods for NetworkedSession
  // ========================================

  /**
   * Set transactions from sync:full
   * @param {Array} transactions
   */
  setTransactions(transactions) {
    this.transactions = transactions;
  }

  /**
   * Add transaction from broadcast (prevents duplicates)
   * @param {Object} tx
   */
  addTransactionFromBroadcast(tx) {
    const exists = this.transactions.some(t => t.id === tx.id);
    if (!exists) {
      this.transactions.push(tx);
    }
  }

  /**
   * Set backend scores for a team
   * @param {string} teamId
   * @param {Object} scoreData
   */
  setBackendScores(teamId, scoreData) {
    this.backendScores.set(teamId, scoreData);
  }

  /**
   * Clear all backend scores
   */
  clearBackendScores() {
    this.backendScores.clear();
  }

  /**
   * Set scanned tokens from sync
   * @param {Array} tokens
   */
  setScannedTokens(tokens) {
    this.scannedTokens = new Set(tokens);
  }

  /**
   * Set player scans from sync:full
   * @param {Array} scans
   */
  setPlayerScans(scans) {
    this.playerScans = scans;
  }

  /**
   * Add player scan from broadcast (prevents duplicates)
   * @param {Object} scan
   */
  addPlayerScan(scan) {
    const exists = this.playerScans.some(s => s.id === scan.id);
    if (!exists) {
      this.playerScans.push(scan);
    }
  }

  /**
   * Set current session ID
   * @param {string} sessionId
   */
  setSessionId(sessionId) {
    this.currentSessionId = sessionId;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    // NetworkedStorage doesn't own the socket, just references it
    // Cleanup is handled by NetworkedSession
  }
}
