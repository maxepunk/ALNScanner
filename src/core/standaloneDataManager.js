/**
 * Standalone Data Manager
 * Local data management for standalone mode
 * Handles permanent local storage when operating without orchestrator
 * ES6 Module - Event-Driven Architecture
 *
 * Emits events:
 * - 'standalone:transaction-added' - After transaction added to session
 * - 'standalone:scores-updated' - After team scores recalculated
 * - 'standalone:group-completed' - When team completes a token group
 * - 'standalone:session-saved' - After session saved to localStorage
 * - 'standalone:session-loaded' - After session loaded from localStorage
 */

class StandaloneDataManager extends EventTarget {
  /**
   * Create StandaloneDataManager instance
   * @param {Object} options - Dependency injection options
   * @param {Object} options.tokenManager - TokenManager instance (for group metadata)
   * @param {Object} options.debug - Debug instance (optional, for logging)
   */
  constructor({ tokenManager, debug } = {}) {
    super();

    this.tokenManager = tokenManager;
    this.debug = debug;

    this.sessionData = {
      sessionId: this.generateLocalSessionId(),
      startTime: new Date().toISOString(),
      transactions: [],
      teams: {},
      mode: 'standalone'
    };

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

    // Update local scores (calculates team scores from transaction)
    this.updateLocalScores(transaction);

    // Save to localStorage AFTER scoring calculations complete
    // This ensures the calculated scores are persisted along with transaction data
    this.saveLocalSession();

    // Emit event for listeners
    this.dispatchEvent(new CustomEvent('standalone:transaction-added', {
      detail: {
        transaction,
        sessionId: this.sessionData.sessionId,
        totalTransactions: this.sessionData.transactions.length
      }
    }));
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
      tokenGroup: transaction.tokenGroup,
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
    if (transaction.mode === 'blackmarket' && transaction.tokenGroup) {
      console.log(`[StandaloneDataManager] Checking group completion for: ${transaction.tokenGroup}`);
      this.checkGroupCompletion(teamId, transaction.tokenGroup);
    } else {
      console.log('[StandaloneDataManager] Group completion check SKIPPED. Reason:', {
        mode: transaction.mode,
        isBlackmarket: transaction.mode === 'blackmarket',
        tokenGroup: transaction.tokenGroup,
        hasTokenGroup: !!transaction.tokenGroup
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

    // Emit event for UI updates (listeners handle updates)
    this.dispatchEvent(new CustomEvent('standalone:scores-updated', {
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
      if (tx.tokenGroup) {
        const txGroupMatch = tx.tokenGroup.match(/^(.+?)\s*\(x\d+\)\s*$/);
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
   * Get sorted team scores
   * @returns {Array} Array of team objects sorted by score (descending)
   */
  getTeamScores() {
    return Object.values(this.sessionData.teams)
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
   * Get session statistics
   * @returns {Object} Session stats object
   */
  getSessionStats() {
    return {
      sessionId: this.sessionData.sessionId,
      startTime: this.sessionData.startTime,
      totalTransactions: this.sessionData.transactions.length,
      totalTeams: Object.keys(this.sessionData.teams).length,
      mode: this.sessionData.mode
    };
  }
}

// Create singleton instance (browser context)
// TokenManager will be injected from window when available
const standaloneDataManager = typeof window !== 'undefined'
  ? new StandaloneDataManager({
      tokenManager: window.TokenManager,
      debug: window.Debug
    })
  : new StandaloneDataManager();

export default standaloneDataManager;
export { StandaloneDataManager };
