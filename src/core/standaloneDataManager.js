/**
 * Standalone Data Manager
 * Local data management for standalone mode
 * Handles permanent local storage when operating without orchestrator
 * ES6 Module - Event-Driven Architecture
 *
 * Emits events (unified with DataManager for mode parity):
 * - 'transaction:added' - After transaction added to session
 * - 'transaction:deleted' - After transaction removed from session
 * - 'team-score:updated' - After team scores recalculated
 * - 'standalone:group-completed' - When team completes a token group
 * - 'standalone:session-saved' - After session saved to localStorage
 * - 'standalone:session-loaded' - After session loaded from localStorage
 */

import {
  SCORING_CONFIG,
  parseGroupInfo as sharedParseGroupInfo,
  calculateTokenValue as sharedCalculateTokenValue
} from './scoring.js';
class StandaloneDataManager extends EventTarget {
  /**
   * Create StandaloneDataManager instance
   * @param {Object} options - Dependency injection options
   * @param {Object} options.tokenManager - TokenManager instance (for group metadata)
   * @param {Object} options.debug - Debug instance (optional, for logging)
   * @param {Object} options.app - App instance (for currentTeamId)
   */
  constructor({ tokenManager, debug, app } = {}) {
    super();

    this.tokenManager = tokenManager;
    this.debug = debug;
    this.app = app;

    this.sessionData = {
      sessionId: this.generateLocalSessionId(),
      startTime: new Date().toISOString(),
      transactions: [],
      teams: {},
      mode: 'standalone'
    };

    // Track scanned tokens for duplicate detection (same as DataManager)
    this.scannedTokens = new Set();

    // Scoring configuration from shared module
    this.SCORING_CONFIG = SCORING_CONFIG;

    // Load any previous incomplete session
    this.loadLocalSession();
  }

  /**
   * Generate unique local session ID
   * @returns {string} Session ID in format LOCAL_<timestamp>_<random>
   */
  generateLocalSessionId() {
    return `LOCAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add transaction to local session
   * Calculates scores and persists to localStorage
   * @param {Object} transaction - Transaction object
   */
  addTransaction(transaction) {
    // Add to permanent local storage, not temporary queue
    this.sessionData.transactions.push(transaction);

    // Mark token as scanned for duplicate detection
    if (transaction.tokenId || transaction.rfid) {
      this.markTokenAsScanned(transaction.tokenId || transaction.rfid);
    }

    // Update local scores (calculates team scores from transaction)
    this.updateLocalScores(transaction);

    // Save to localStorage AFTER scoring calculations complete
    // This ensures the calculated scores are persisted along with transaction data
    this.saveLocalSession();

    // Emit event for listeners (unified event name for mode parity)
    this.dispatchEvent(new CustomEvent('transaction:added', {
      detail: {
        transaction,
        sessionId: this.sessionData.sessionId,
        totalTransactions: this.sessionData.transactions.length
      }
    }));
  }

  /**
   * Remove transaction from local session
   * Recalculates team scores from remaining transactions
   * @param {string} transactionId - Transaction ID to remove
   * @returns {Object|null} Removed transaction or null if not found
   */
  removeTransaction(transactionId) {
    // Find transaction index
    const index = this.sessionData.transactions.findIndex(tx => tx.id === transactionId);
    if (index === -1) {
      this.debug?.log(`Transaction not found: ${transactionId}`, true);
      return null;
    }

    // Remove from transactions array
    const removedTx = this.sessionData.transactions.splice(index, 1)[0];
    const tokenId = removedTx.tokenId || removedTx.rfid;
    const affectedTeamId = removedTx.teamId;

    // CRITICAL: Remove from scannedTokens Set to allow re-scanning
    // Only remove if no other transactions have this token
    const tokenStillExists = this.sessionData.transactions.some(
      tx => (tx.tokenId || tx.rfid) === tokenId
    );
    if (!tokenStillExists && tokenId) {
      this.scannedTokens.delete(tokenId);
      this.debug?.log(`Token ${tokenId} removed from scannedTokens - can be rescanned`);
    }

    // Recalculate affected team's scores from remaining transactions
    if (affectedTeamId && this.sessionData.teams[affectedTeamId]) {
      const team = this.sessionData.teams[affectedTeamId];

      // Reset team scores
      team.baseScore = 0;
      team.bonusPoints = 0;
      team.score = 0;
      team.tokensScanned = 0;
      team.completedGroups = [];

      // Replay all remaining transactions for this team
      this.sessionData.transactions
        .filter(tx => tx.teamId === affectedTeamId)
        .forEach(tx => this.updateLocalScores(tx));

      this.debug?.log(`Recalculated scores for team ${affectedTeamId}`, {
        newScore: team.score,
        transactions: this.sessionData.transactions.filter(tx => tx.teamId === affectedTeamId).length
      });
    }

    // Persist to localStorage
    this.saveLocalSession();

    // Emit event for UI updates
    this.dispatchEvent(new CustomEvent('standalone:transaction-removed', {
      detail: {
        transaction: removedTx,
        teamId: affectedTeamId,
        sessionId: this.sessionData.sessionId
      }
    }));

    this.debug?.log(`Transaction removed: ${transactionId}`, {
      tokenId,
      teamId: affectedTeamId,
      canRescan: !tokenStillExists
    });

    return removedTx;
  }

  /**
   * Check if token has been scanned (duplicate detection)
   * @param {string} tokenId - Token ID to check
   * @returns {boolean} True if token already scanned
   */
  isTokenScanned(tokenId) {
    return this.scannedTokens.has(tokenId);
  }

  /**
   * Mark token as scanned (for duplicate detection)
   * @param {string} tokenId - Token ID to mark
   */
  markTokenAsScanned(tokenId) {
    this.scannedTokens.add(tokenId);
  }

  /**
   * Update local team scores based on transaction
   * Only processes blackmarket mode transactions
   * @param {Object} transaction - Transaction object
   */
  updateLocalScores(transaction) {
    const teamId = transaction.teamId;

    // DIAGNOSTIC: Log transaction being processed
    console.log('[StandaloneDataManager] updateLocalScores() called', {
      tokenId: transaction.tokenId,
      teamId: transaction.teamId,
      mode: transaction.mode,
      points: transaction.points,
      group: transaction.group,
      valueRating: transaction.valueRating,
      memoryType: transaction.memoryType
    });

    if (!this.sessionData.teams[teamId]) {
      this.sessionData.teams[teamId] = {
        teamId: teamId,
        score: 0,
        baseScore: 0,
        bonusPoints: 0,
        tokensScanned: 0,
        completedGroups: [],
        lastScanTime: null
      };
      console.log('[StandaloneDataManager] Created new team:', teamId);
    }

    const team = this.sessionData.teams[teamId];

    // DIAGNOSTIC: Log team state BEFORE scoring
    console.log('[StandaloneDataManager] Team state BEFORE scoring:', {
      teamId,
      baseScore: team.baseScore,
      bonusPoints: team.bonusPoints,
      score: team.score,
      tokensScanned: team.tokensScanned
    });

    // Only update score for blackmarket mode
    if (transaction.mode === 'blackmarket' && transaction.points) {
      console.log(`[StandaloneDataManager] Adding ${transaction.points} points to team ${teamId}`);
      team.baseScore += transaction.points;
      team.score = team.baseScore + team.bonusPoints;
    } else {
      console.log('[StandaloneDataManager] Score NOT updated. Reason:', {
        mode: transaction.mode,
        isBlackmarket: transaction.mode === 'blackmarket',
        points: transaction.points,
        hasPoints: !!transaction.points
      });
    }

    team.tokensScanned++;
    team.lastScanTime = transaction.timestamp;

    // DIAGNOSTIC: Log team state AFTER base scoring, BEFORE group check
    console.log('[StandaloneDataManager] Team state AFTER base scoring:', {
      teamId,
      baseScore: team.baseScore,
      bonusPoints: team.bonusPoints,
      score: team.score,
      tokensScanned: team.tokensScanned
    });

    // Check for group completion (only for blackmarket mode)
    if (transaction.mode === 'blackmarket' && transaction.group) {
      console.log(`[StandaloneDataManager] Checking group completion for: ${transaction.group}`);
      this.checkGroupCompletion(teamId, transaction.group);
    } else {
      console.log('[StandaloneDataManager] Group completion check SKIPPED. Reason:', {
        mode: transaction.mode,
        isBlackmarket: transaction.mode === 'blackmarket',
        group: transaction.group,
        hasGroup: !!transaction.group
      });
    }

    // DIAGNOSTIC: Log FINAL team state
    console.log('[StandaloneDataManager] Team state FINAL:', {
      teamId,
      baseScore: team.baseScore,
      bonusPoints: team.bonusPoints,
      score: team.score,
      tokensScanned: team.tokensScanned,
      completedGroups: team.completedGroups
    });

    // Emit event for UI updates (unified event name for mode parity)
    this.dispatchEvent(new CustomEvent('team-score:updated', {
      detail: {
        teamId,
        teamScores: this.getTeamScores(),
        updatedTeam: { ...team }
      }
    }));
  }

  /**
   * Check if team completed a token group and award bonus
   * @param {string} teamId - Team ID
   * @param {string} groupName - Group name with multiplier (e.g., "Marcus Sucks (x2)")
   */
  checkGroupCompletion(teamId, groupName) {
    // Extract group ID and multiplier from group name
    const groupMatch = groupName.match(/^(.+?)\s*\(x(\d+)\)\s*$/);
    if (!groupMatch) return; // No multiplier, no group bonus

    const groupId = groupMatch[1].trim();
    const multiplier = parseInt(groupMatch[2], 10);

    const team = this.sessionData.teams[teamId];

    // Skip if group already completed
    if (team.completedGroups.includes(groupId)) {
      return;
    }

    // Get all transactions for this team in blackmarket mode
    const teamTransactions = this.sessionData.transactions.filter(tx =>
      tx.teamId === teamId && tx.mode === 'blackmarket'
    );

    // Get unique groups from team's transactions
    const scannedGroups = {};
    teamTransactions.forEach(tx => {
      // FIXED: Check tx.group not tx.tokenGroup (consistent with line 188)
      if (tx.group) {
        const txGroupMatch = tx.group.match(/^(.+?)\s*\(x\d+\)\s*$/);
        if (txGroupMatch) {
          const txGroupId = txGroupMatch[1].trim();
          if (!scannedGroups[txGroupId]) {
            scannedGroups[txGroupId] = [];
          }
          scannedGroups[txGroupId].push(tx);
        }
      }
    });

    // Check if we have access to TokenManager for group metadata
    if (!this.tokenManager || typeof this.tokenManager.getAllTokens !== 'function') {
      console.warn('TokenManager not available for group completion check');
      return;
    }

    // Get all tokens in this group
    const allTokens = this.tokenManager.getAllTokens();
    const groupTokens = allTokens.filter(token => {
      if (!token.SF_Group) return false;
      const tokenGroupMatch = token.SF_Group.match(/^(.+?)\s*\(x\d+\)\s*$/);
      return tokenGroupMatch && tokenGroupMatch[1].trim() === groupId;
    });

    // Check if all group tokens have been scanned by this team
    const scannedTokenIds = scannedGroups[groupId] ? scannedGroups[groupId].map(tx => tx.tokenId) : [];
    const allGroupTokenIds = groupTokens.map(t => t.SF_RFID);

    const allScanned = allGroupTokenIds.every(tokenId => scannedTokenIds.includes(tokenId));

    if (allScanned && groupTokens.length > 0) {
      // Calculate bonus: (multiplier - 1) × sum of group token values
      const groupBaseScore = scannedGroups[groupId].reduce((sum, tx) => sum + (tx.points || 0), 0);
      const bonus = (multiplier - 1) * groupBaseScore;

      // Award bonus
      team.bonusPoints += bonus;
      team.score = team.baseScore + team.bonusPoints;
      team.completedGroups.push(groupId);

      console.log(`Group completed: ${groupId}, bonus: ${bonus} points`);

      // Save session
      this.saveLocalSession();

      // Emit group completion event
      this.dispatchEvent(new CustomEvent('standalone:group-completed', {
        detail: {
          teamId,
          groupId,
          groupName,
          multiplier,
          bonus,
          groupBaseScore,
          newTotalScore: team.score
        }
      }));
    }
  }

  /**
   * Getter property for transactions array (UIManager compatibility)
   * @returns {Array} Array of transactions
   */
  get transactions() {
    return this.sessionData.transactions;
  }

  /**
   * Parse group info from group name string (same as DataManager)
   * @param {string} groupName - Group name with multiplier
   * @returns {Object} Parsed group info
   */
  parseGroupInfo(groupName) {
    return sharedParseGroupInfo(groupName);
  }

  /**
   * Calculate base value of a token (same as DataManager)
   * @param {Object} transaction - Transaction data
   * @returns {number} Token value
   */
  calculateTokenValue(transaction) {
    return sharedCalculateTokenValue(transaction);
  }

  /**
   * Calculate team score with group completion bonuses (UIManager compatibility)
   * @param {string} teamId - Team ID
   * @returns {Object} Score breakdown
   */
  calculateTeamScoreWithBonuses(teamId) {
    const team = this.sessionData.teams[teamId];
    if (!team) {
      return {
        baseScore: 0,
        bonusScore: 0,
        totalScore: 0,
        completedGroups: 0,
        groupBreakdown: {}
      };
    }

    return {
      baseScore: team.baseScore,
      bonusScore: team.bonusPoints,
      totalScore: team.score,
      completedGroups: team.completedGroups.length,
      groupBreakdown: {}  // TODO: Could be enhanced if needed
    };
  }

  /**
   * Manually adjust a team's score (GM intervention)
   * Creates an admin adjustment record with audit trail
   * @param {string} teamId - Team identifier (e.g., '001', '002')
   * @param {number} delta - Score adjustment amount (positive or negative)
   * @param {string} [reason='Manual GM adjustment'] - Reason for adjustment (audit trail)
   */
  adjustTeamScore(teamId, delta, reason = 'Manual GM adjustment') {
    // Validate team exists
    if (!this.sessionData.teams[teamId]) {
      throw new Error(`Team ${teamId} not found`);
    }

    const team = this.sessionData.teams[teamId];

    // Initialize adminAdjustments array if doesn't exist
    if (!team.adminAdjustments) {
      team.adminAdjustments = [];
    }

    // Create adjustment record
    const adjustment = {
      delta: parseInt(delta),
      reason: reason,
      timestamp: new Date().toISOString(),
      gmStation: 'standalone'  // No device ID in standalone mode
    };

    // Add to adjustments array (audit trail)
    team.adminAdjustments.push(adjustment);

    // Apply adjustment to current score
    team.score += adjustment.delta;

    this.debug?.log(`[Standalone] Team ${teamId} score adjusted by ${delta}`, {
      reason,
      newScore: team.score,
      totalAdjustments: team.adminAdjustments.length
    });

    // Persist to localStorage
    this.saveLocalSession();

    // Emit event for UI updates
    this.dispatchEvent(new CustomEvent('standalone:score-adjusted', {
      detail: {
        teamId,
        delta: adjustment.delta,
        reason: adjustment.reason,
        newScore: team.score,
        adjustment: adjustment
      }
    }));
  }

  /**
   * Get global statistics (UIManager compatibility)
   * @returns {Object} Global stats
   */
  getGlobalStats() {
    const total = this.sessionData.transactions.length;
    const teams = Object.keys(this.sessionData.teams).length;
    const known = this.sessionData.transactions.filter(t => !t.isUnknown);

    const blackMarketTransactions = known.filter(t => t.mode === 'blackmarket');

    const blackMarketScore = blackMarketTransactions.reduce((sum, t) => {
      return sum + this.calculateTokenValue(t);
    }, 0);

    // totalValue derived from blackMarketScore only - detective mode has no scoring
    const totalValue = Math.floor(blackMarketScore / 1000);
    const avgValue = known.length > 0 ? (totalValue / known.length).toFixed(1) : 0;

    return { total, teams, totalValue, avgValue, blackMarketScore };
  }

  /**
   * Get enhanced team transactions with grouping (UIManager compatibility)
   * Simplified version - returns basic structure without full group inventory
   * @param {string} teamId - Team ID
   * @returns {Object} Grouped transaction data
   */
  getEnhancedTeamTransactions(teamId) {
    const teamTransactions = this.sessionData.transactions.filter(t =>
      t.teamId === teamId && t.mode === 'blackmarket'
    );

    const unknownTokens = teamTransactions.filter(t => t.isUnknown);
    const knownTokens = teamTransactions.filter(t => !t.isUnknown);

    // Group by group field
    const grouped = {};
    knownTokens.forEach(t => {
      const group = t.group || 'No Group';
      if (!grouped[group]) {
        grouped[group] = [];
      }
      grouped[group].push(t);
    });

    const team = this.sessionData.teams[teamId];
    const completedGroupNames = team?.completedGroups || [];

    const completedGroups = [];
    const incompleteGroups = [];
    const ungroupedTokens = [];

    Object.entries(grouped).forEach(([groupName, tokens]) => {
      const groupInfo = this.parseGroupInfo(groupName);

      if (groupInfo.multiplier > 1 && completedGroupNames.includes(groupInfo.name)) {
        const totalBaseValue = tokens.reduce((sum, t) => sum + this.calculateTokenValue(t), 0);
        completedGroups.push({
          displayName: groupName,
          normalizedName: groupInfo.name,
          multiplier: groupInfo.multiplier,
          tokens: tokens,
          totalBaseValue: totalBaseValue,
          bonusValue: totalBaseValue * (groupInfo.multiplier - 1)
        });
      } else if (groupInfo.multiplier > 1) {
        incompleteGroups.push({
          displayName: groupName,
          normalizedName: groupInfo.name,
          multiplier: groupInfo.multiplier,
          tokens: tokens,
          collectedTokens: tokens.length,
          totalTokens: tokens.length,  // Simplified - don't have full inventory
          progress: `${tokens.length}/?`,
          percentage: 50  // Unknown completion percentage
        });
      } else {
        ungroupedTokens.push(...tokens);
      }
    });

    return {
      completedGroups,
      incompleteGroups,
      ungroupedTokens,
      unknownTokens,
      hasCompletedGroups: completedGroups.length > 0,
      hasIncompleteGroups: incompleteGroups.length > 0,
      hasUngroupedTokens: ungroupedTokens.length > 0,
      hasUnknownTokens: unknownTokens.length > 0
    };
  }

  /**
   * Get sorted team scores
   * @returns {Array} Array of team objects sorted by score (descending)
   */
  getTeamScores() {
    return Object.values(this.sessionData.teams)
      .map(team => ({
        teamId: team.teamId,
        score: team.score,
        baseScore: team.baseScore,
        bonusScore: team.bonusPoints,
        tokenCount: team.tokensScanned,
        completedGroups: team.completedGroups.length,
        isFromBackend: false  // Local calculation
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Save session to localStorage
   * Emits standalone:session-saved event
   */
  saveLocalSession() {
    localStorage.setItem('standaloneSession', JSON.stringify(this.sessionData));

    this.dispatchEvent(new CustomEvent('standalone:session-saved', {
      detail: {
        sessionId: this.sessionData.sessionId,
        totalTransactions: this.sessionData.transactions.length,
        totalTeams: Object.keys(this.sessionData.teams).length
      }
    }));
  }

  /**
   * Load session from localStorage
   * Only loads sessions from today
   * Emits standalone:session-loaded event if successful
   */
  loadLocalSession() {
    const saved = localStorage.getItem('standaloneSession');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Only load if it's from today
        const sessionDate = new Date(parsed.startTime).toDateString();
        const today = new Date().toDateString();

        if (sessionDate === today) {
          this.sessionData = parsed;
          console.log('Loaded previous session:', parsed.sessionId);

          // Repopulate scannedTokens Set from loaded transactions for duplicate detection
          this.scannedTokens.clear();
          if (parsed.transactions && Array.isArray(parsed.transactions)) {
            parsed.transactions.forEach(tx => {
              const tokenId = tx.tokenId || tx.rfid;
              if (tokenId) {
                this.scannedTokens.add(tokenId);
              }
            });
            console.log(`Restored ${this.scannedTokens.size} scanned tokens for duplicate detection`);
          }

          this.dispatchEvent(new CustomEvent('standalone:session-loaded', {
            detail: {
              sessionId: parsed.sessionId,
              startTime: parsed.startTime,
              totalTransactions: parsed.transactions.length,
              totalTeams: Object.keys(parsed.teams).length
            }
          }));
        } else {
          console.log('Previous session is from a different day, starting fresh');
        }
      } catch (error) {
        console.error('Failed to load previous session:', error);
      }
    }
  }

  /**
   * Export session as downloadable JSON file
   */
  exportSession() {
    // Generate downloadable file
    const blob = new Blob([JSON.stringify(this.sessionData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ALN_Session_${this.sessionData.sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Clear session data
   * Prompts for export before clearing
   */
  clearSession() {
    if (confirm('Export session data before clearing?')) {
      this.exportSession();
    }
    localStorage.removeItem('standaloneSession');
    this.sessionData = {
      sessionId: this.generateLocalSessionId(),
      startTime: new Date().toISOString(),
      transactions: [],
      teams: {},
      mode: 'standalone'
    };
  }

  /**
   * Get session statistics for current team
   * Returns stats matching DataManager interface for UI compatibility
   * @returns {Object} Session stats object with count, totalValue, totalScore
   */
  getSessionStats() {
    // Get current team ID from app
    const currentTeamId = this.app?.currentTeamId;

    if (!currentTeamId) {
      // No active team - return zeros
      return { count: 0, totalValue: 0, totalScore: 0 };
    }

    // Get transactions for current team
    const teamTransactions = this.sessionData.transactions.filter(
      tx => tx.teamId === currentTeamId
    );

    const count = teamTransactions.length;
    const knownTokens = teamTransactions.filter(t => !t.isUnknown);

    // Calculate totalValue (star rating sum)
    const totalValue = knownTokens.reduce((sum, t) => sum + (t.valueRating || 0), 0);

    // Calculate totalScore (for blackmarket mode)
    const team = this.sessionData.teams[currentTeamId];
    const totalScore = team ? team.score : 0;

    return { count, totalValue, totalScore };
  }
}

// Export class only (no pre-created singleton)
// Instance created in main.js with proper dependency injection
export default StandaloneDataManager;
export { StandaloneDataManager };
