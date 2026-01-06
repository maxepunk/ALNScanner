/**
 * LocalStorage Strategy - Browser localStorage persistence
 * Implements IStorageStrategy for standalone mode operation
 *
 * @module core/storage/LocalStorage
 */

import { IStorageStrategy } from './IStorageStrategy.js';
import {
  SCORING_CONFIG,
  parseGroupInfo,
  calculateTokenValue
} from '../scoring.js';

export class LocalStorage extends IStorageStrategy {
  /**
   * Create LocalStorage instance
   * @param {Object} options - Dependencies
   * @param {Object} options.tokenManager - TokenManager instance
   * @param {Object} [options.debug] - Debug instance
   */
  constructor({ tokenManager, debug } = {}) {
    super();

    this.tokenManager = tokenManager;
    this.debug = debug;
    this.SCORING_CONFIG = SCORING_CONFIG;

    // Initialize session data
    this.sessionData = {
      sessionId: this._generateSessionId(),
      startTime: new Date().toISOString(),
      transactions: [],
      teams: {},
      mode: 'standalone'
    };

    // Track scanned tokens for duplicate detection
    this.scannedTokens = new Set();

    // Player scans (for getGameActivity parity)
    this.playerScans = [];
  }

  /**
   * Generate unique local session ID
   * @private
   */
  _generateSessionId() {
    return `LOCAL_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Check if storage is ready
   * @returns {boolean} Always true for localStorage
   */
  isReady() {
    return true;
  }

  /**
   * Initialize storage (load from localStorage)
   * @returns {Promise<void>}
   */
  async initialize() {
    this._loadSession();
  }

  /**
   * Load session from localStorage
   * @private
   */
  _loadSession() {
    const saved = localStorage.getItem('standaloneSession');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const sessionDate = new Date(parsed.startTime).toDateString();
        const today = new Date().toDateString();

        if (sessionDate === today) {
          this.sessionData = parsed;
          this._repopulateScannedTokens();
          this.debug?.log(`Loaded session: ${parsed.sessionId}`);
        }
      } catch (e) {
        this.debug?.log('Failed to load session', true);
      }
    }
  }

  /**
   * Repopulate scannedTokens Set from loaded transactions
   * @private
   */
  _repopulateScannedTokens() {
    this.scannedTokens.clear();
    this.sessionData.transactions.forEach(tx => {
      const tokenId = tx.tokenId || tx.rfid;
      if (tokenId) {
        this.scannedTokens.add(tokenId);
      }
    });
  }

  /**
   * Save session to localStorage
   * @private
   */
  _saveSession() {
    localStorage.setItem('standaloneSession', JSON.stringify(this.sessionData));
  }

  /**
   * Get all transactions
   * @returns {Array} Array of transactions
   */
  getTransactions() {
    return this.sessionData.transactions;
  }

  /**
   * Get team scores
   * @returns {Array} Array of team score objects
   */
  getTeamScores() {
    return Object.values(this.sessionData.teams)
      .map(team => ({
        teamId: team.teamId,
        score: team.score,
        baseScore: team.baseScore,
        bonusScore: team.bonusPoints,
        tokenCount: team.tokensScanned,
        completedGroups: team.completedGroups?.length || 0,
        isFromBackend: false
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Get current session info
   * @returns {SessionInfo}
   */
  getCurrentSession() {
    return {
      sessionId: this.sessionData.sessionId,
      startTime: this.sessionData.startTime,
      status: 'active'
    };
  }

  /**
   * Create a new session
   * @param {string} name - Session name
   * @param {Array} teams - Initial teams array
   * @returns {Promise<SessionInfo>}
   */
  async createSession(name, teams) {
    this.sessionData = {
      sessionId: this._generateSessionId(),
      name: name,
      startTime: new Date().toISOString(),
      transactions: [],
      teams: {},
      mode: 'standalone'
    };
    this.scannedTokens.clear();
    this._saveSession();

    return this.getCurrentSession();
  }

  /**
   * End the current session
   * @returns {Promise<void>}
   */
  async endSession() {
    this._saveSession();
  }

  /**
   * Add transaction to local storage
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

    // Add to transactions array
    this.sessionData.transactions.push(transaction);

    // Mark token as scanned
    const tokenId = transaction.tokenId || transaction.rfid;
    if (tokenId) {
      this.scannedTokens.add(tokenId);
    }

    // Update team scores
    this._updateTeamScore(transaction);

    // Persist
    this._saveSession();

    return {
      success: true,
      transaction,
      teamScore: this.sessionData.teams[transaction.teamId]
    };
  }

  /**
   * Update team score from transaction
   * @private
   */
  _updateTeamScore(transaction) {
    const teamId = transaction.teamId;

    if (!this.sessionData.teams[teamId]) {
      this.sessionData.teams[teamId] = {
        teamId,
        score: 0,
        baseScore: 0,
        bonusPoints: 0,
        tokensScanned: 0,
        completedGroups: [],
        lastScanTime: null
      };
    }

    const team = this.sessionData.teams[teamId];

    // Only score blackmarket mode
    if (transaction.mode === 'blackmarket' && transaction.points) {
      team.baseScore += transaction.points;
      team.score = team.baseScore + team.bonusPoints;
    }

    team.tokensScanned++;
    team.lastScanTime = transaction.timestamp;

    // Check group completion
    if (transaction.mode === 'blackmarket' && transaction.group) {
      this._checkGroupCompletion(teamId, transaction.group);
    }
  }

  /**
   * Check and award group completion bonus
   * @private
   */
  _checkGroupCompletion(teamId, groupName) {
    const groupInfo = parseGroupInfo(groupName);
    if (groupInfo.multiplier <= 1) return;

    const team = this.sessionData.teams[teamId];
    if (team.completedGroups.includes(groupInfo.name)) return;

    // Get all team transactions for this group
    const teamTxs = this.sessionData.transactions.filter(tx =>
      tx.teamId === teamId && tx.mode === 'blackmarket'
    );

    const groupTxs = teamTxs.filter(tx => {
      const txGroupInfo = parseGroupInfo(tx.group);
      return txGroupInfo.name === groupInfo.name;
    });

    // Check if all group tokens collected (requires tokenManager)
    if (!this.tokenManager) return;

    const allTokens = this.tokenManager.getAllTokens();
    const groupTokens = allTokens.filter(token => {
      if (!token.SF_Group) return false;
      const tokenGroupInfo = parseGroupInfo(token.SF_Group);
      return tokenGroupInfo.name === groupInfo.name;
    });

    const scannedIds = groupTxs.map(tx => tx.tokenId);
    const allGroupIds = groupTokens.map(t => t.SF_RFID);
    const allScanned = allGroupIds.every(id => scannedIds.includes(id));

    if (allScanned && groupTokens.length > 0) {
      const groupBaseScore = groupTxs.reduce((sum, tx) => sum + (tx.points || 0), 0);
      const bonus = (groupInfo.multiplier - 1) * groupBaseScore;

      team.bonusPoints += bonus;
      team.score = team.baseScore + team.bonusPoints;
      team.completedGroups.push(groupInfo.name);

      this.debug?.log(`Group completed: ${groupInfo.name}, bonus: ${bonus}`);
    }
  }

  /**
   * Remove transaction and recalculate team scores
   * @param {string} transactionId - Transaction ID
   * @returns {Promise<TransactionResult>}
   */
  async removeTransaction(transactionId) {
    const index = this.sessionData.transactions.findIndex(tx => tx.id === transactionId);

    if (index === -1) {
      return {
        success: false,
        error: `Transaction not found: ${transactionId}`
      };
    }

    const removedTx = this.sessionData.transactions.splice(index, 1)[0];
    const tokenId = removedTx.tokenId || removedTx.rfid;
    const teamId = removedTx.teamId;

    // Allow re-scanning if no other transactions have this token
    const tokenStillExists = this.sessionData.transactions.some(
      tx => (tx.tokenId || tx.rfid) === tokenId
    );
    if (!tokenStillExists && tokenId) {
      this.scannedTokens.delete(tokenId);
    }

    // Recalculate team scores from scratch
    if (teamId && this.sessionData.teams[teamId]) {
      this._recalculateTeamScores(teamId);
    }

    this._saveSession();

    return {
      success: true,
      transaction: removedTx
    };
  }

  /**
   * Recalculate team scores from remaining transactions
   * @private
   */
  _recalculateTeamScores(teamId) {
    const team = this.sessionData.teams[teamId];

    // Reset
    team.baseScore = 0;
    team.bonusPoints = 0;
    team.score = 0;
    team.tokensScanned = 0;
    team.completedGroups = [];

    // Replay transactions
    this.sessionData.transactions
      .filter(tx => tx.teamId === teamId)
      .forEach(tx => this._updateTeamScore(tx));
  }

  /**
   * Adjust team score (admin operation)
   * @param {string} teamId - Team identifier
   * @param {number} delta - Score adjustment
   * @param {string} reason - Reason for adjustment
   * @returns {Promise<TransactionResult>}
   */
  async adjustTeamScore(teamId, delta, reason = 'Manual adjustment') {
    if (!this.sessionData.teams[teamId]) {
      return {
        success: false,
        error: `Team not found: ${teamId}`
      };
    }

    const team = this.sessionData.teams[teamId];

    if (!team.adminAdjustments) {
      team.adminAdjustments = [];
    }

    const adjustment = {
      delta: parseInt(delta),
      reason,
      timestamp: new Date().toISOString()
    };

    team.adminAdjustments.push(adjustment);
    team.score += adjustment.delta;

    this._saveSession();

    return {
      success: true,
      teamScore: { ...team }
    };
  }

  /**
   * Get unified game activity
   * Matches DataManager.getGameActivity() API for parity
   *
   * Note: LocalStorage doesn't have player scans (no backend to receive them)
   * but we maintain the same structure for API compatibility.
   *
   * @returns {Object} { tokens: Array, stats: Object }
   */
  getGameActivity() {
    const tokenMap = new Map();

    // Process player scans (empty in standalone, but maintain structure)
    this.playerScans.forEach(scan => {
      if (!tokenMap.has(scan.tokenId)) {
        tokenMap.set(scan.tokenId, {
          tokenId: scan.tokenId,
          tokenData: scan.tokenData || {},
          potentialValue: calculateTokenValue({
            valueRating: scan.tokenData?.SF_ValueRating,
            memoryType: scan.tokenData?.SF_MemoryType
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

    // Process GM transactions (claims)
    this.sessionData.transactions.forEach(tx => {
      let activity = tokenMap.get(tx.tokenId);

      if (!activity) {
        // Look up token data
        const lookedUpToken = this.tokenManager?.findToken(tx.tokenId);
        const tokenData = lookedUpToken ? {
          SF_MemoryType: lookedUpToken.SF_MemoryType,
          SF_ValueRating: lookedUpToken.SF_ValueRating,
          SF_Group: lookedUpToken.SF_Group || null,
          summary: lookedUpToken.summary || null
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

      // Add claim event
      activity.events.push({
        type: 'claim',
        timestamp: tx.timestamp,
        mode: tx.mode,
        teamId: tx.teamId,
        points: tx.points || 0,
        summary: tx.summary || activity.tokenData?.summary || null
      });
      activity.status = 'claimed';
    });

    // Sort events within each token
    tokenMap.forEach(activity => {
      activity.events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    });

    const tokens = Array.from(tokenMap.values());

    const stats = {
      totalTokens: tokens.length,
      available: tokens.filter(t => t.status === 'available').length,
      claimed: tokens.filter(t => t.status === 'claimed').length,
      claimedWithoutDiscovery: tokens.filter(t => t.status === 'claimed' && !t.discoveredByPlayers).length,
      totalPlayerScans: this.playerScans.length
    };

    return { tokens, stats };
  }

  /**
   * Dispose of resources
   * LocalStorage has no resources requiring cleanup
   */
  dispose() {
    // No-op for LocalStorage - localStorage persists automatically
  }
}
