/**
 * DataManager - Transaction Storage and Scoring
 * ES6 Module Export
 *
 * Manages transactions, scoring, and persistence with dual-mode awareness.
 * Critical: Mode-specific storage prevents data leaks between networked/standalone modes.
 */

export class DataManager extends EventTarget {
  constructor({ tokenManager, settings, debug, app, sessionModeManager, networkedSession } = {}) {
    super();

    // Inject dependencies for testability
    this.tokenManager = tokenManager;
    this.settings = settings;
    this.debug = debug;
    this.app = app;
    this.sessionModeManager = sessionModeManager;  // For mode-specific storage keys
    this.networkedSession = networkedSession;      // For connection state checks

    // Initialize state
    this.transactions = [];
    this.currentSession = [];
    this.scannedTokens = new Set();
    this.backendScores = new Map();  // Store scores from orchestrator
    this.currentSessionId = null;  // Track current session for duplicate detection scope

    // Scoring configuration for Black Market mode
    this.SCORING_CONFIG = {
      BASE_VALUES: {
        1: 100,
        2: 500,
        3: 1000,
        4: 5000,
        5: 10000
      },
      TYPE_MULTIPLIERS: {
        'Personal': 1,
        'Business': 3,
        'Technical': 5,
        'UNKNOWN': 0
      }
    };
  }

  /**
   * Get mode-specific storage key for scanned tokens
   * Prevents data leak between standalone and networked modes
   */
  getScannedTokensKey() {
    const mode = this.sessionModeManager?.mode || 'standalone';
    return mode === 'networked' ? 'networked_scannedTokens' : 'standalone_scannedTokens';
  }

  /**
   * Load transactions from localStorage
   */
  loadTransactions() {
    try {
      const stored = localStorage.getItem('transactions');
      if (stored) {
        this.transactions = JSON.parse(stored);
        this.debug?.log(`Loaded ${this.transactions.length} transactions`);
      }
    } catch (e) {
      this.debug?.log('Error loading transactions', true);
      this.transactions = [];
    }
  }

  /**
   * Load scanned tokens registry from localStorage
   * Uses mode-specific key to prevent data leak between modes
   */
  loadScannedTokens() {
    try {
      const key = this.getScannedTokensKey();
      const stored = localStorage.getItem(key);
      const storedSessionId = localStorage.getItem('currentSessionId');

      // Load current session ID if available (networked mode)
      // In standalone mode, this will be null and scannedTokens will be session-local
      this.currentSessionId = storedSessionId;

      if (stored) {
        this.scannedTokens = new Set(JSON.parse(stored));
        this.debug?.log(`Loaded ${this.scannedTokens.size} scanned tokens from ${key} for session ${storedSessionId || 'local'}`);
      }
    } catch (e) {
      this.debug?.log('Error loading scanned tokens', true);
      this.scannedTokens = new Set();
    }
  }

  /**
   * Save transactions to localStorage
   */
  saveTransactions() {
    try {
      localStorage.setItem('transactions', JSON.stringify(this.transactions));
    } catch (e) {
      this.debug?.log('Error saving transactions', true);
    }
  }

  /**
   * Save scanned tokens registry to localStorage
   * Uses mode-specific key to prevent data leak between modes
   */
  saveScannedTokens() {
    try {
      const key = this.getScannedTokensKey();
      localStorage.setItem(key, JSON.stringify([...this.scannedTokens]));
    } catch (e) {
      this.debug?.log('Error saving scanned tokens', true);
    }
  }

  /**
   * Check if token has been scanned globally
   * @param {string} tokenId - Token ID to check
   * @returns {boolean} Whether token was already scanned
   */
  isTokenScanned(tokenId) {
    return this.scannedTokens.has(tokenId);
  }

  /**
   * Mark token as scanned globally
   * @param {string} tokenId - Token ID to mark
   */
  markTokenAsScanned(tokenId) {
    this.scannedTokens.add(tokenId);
    this.saveScannedTokens();
  }

  /**
   * Unmark token as scanned (allow re-scanning)
   * Called when transaction is deleted
   * @param {string} tokenId - Token ID to unmark
   */
  unmarkTokenAsScanned(tokenId) {
    const wasRemoved = this.scannedTokens.delete(tokenId);
    if (wasRemoved) {
      this.saveScannedTokens();
      this.debug?.log(`[DataManager] Token unmarked for re-scanning: ${tokenId}`);
    }
    return wasRemoved;
  }

  /**
   * Add a transaction to the local store
   *
   * @param {Object} transaction - Transaction object
   * @param {string} transaction.rfid - RFID tag value
   * @param {string} transaction.tokenId - Token identifier
   * @param {string} transaction.teamId - Team identifier
   * @param {string} transaction.memoryType - Memory type (Personal/Business/Technical)
   * @param {number} transaction.valueRating - Star rating (1-5)
   * @param {string} [transaction.status='accepted'] - Transaction status
   *   Valid values:
   *     - 'accepted' - Transaction processed successfully
   *     - 'duplicate' - Duplicate token scan attempt
   *     - 'error' - Transaction processing failed
   *     - 'pending' - Queued for processing
   * @param {boolean} [transaction.isUnknown=false] - Whether token is unknown
   */
  addTransaction(transaction) {
    // If backend transaction, look up token data
    let tokenData = null;
    if (transaction.tokenId && !transaction.memoryType) {
      tokenData = this.tokenManager?.findToken(transaction.tokenId);
      this.debug?.log('Looking up token data for backend transaction', {
        tokenId: transaction.tokenId,
        found: !!tokenData,
        memoryType: tokenData?.SF_MemoryType,
        group: tokenData?.SF_Group
      });
    }

    // Calculate memoryType first (needed for isUnknown check)
    const memoryType = transaction.memoryType || (tokenData?.SF_MemoryType) || 'UNKNOWN';

    // Normalize transaction format (backend sends different structure)
    const normalizedTx = {
      id: transaction.id,  // Backend transaction ID (needed for deletion)
      timestamp: transaction.timestamp || new Date().toISOString(),
      deviceId: transaction.deviceId || this.settings?.deviceId,
      mode: transaction.mode || this.settings?.mode,
      teamId: transaction.teamId || this.app?.currentTeamId,
      rfid: transaction.tokenId || transaction.rfid,
      tokenId: transaction.tokenId || transaction.rfid,
      memoryType: memoryType,
      group: transaction.group || tokenData?.SF_Group || 'No Group',
      // CRITICAL FIX: valueRating is 1-5, points is calculated score - don't confuse them!
      // Use valueRating if explicitly provided (even if 0), otherwise use token data
      valueRating: transaction.valueRating !== undefined ? transaction.valueRating :
                   (tokenData?.SF_ValueRating !== undefined ? tokenData.SF_ValueRating : 0),
      // CRITICAL FIX: Check if memoryType is valid, not just if tokenData exists
      // Backend now sends memoryType in transactions, so tokenData may be null even for valid tokens
      isUnknown: transaction.isUnknown !== undefined ? transaction.isUnknown :
                 (memoryType === 'UNKNOWN'),
      // Status field with documented valid values (see JSDoc above)
      status: transaction.status || 'accepted'
      // Note: 'synced' flag removed - NetworkedQueueManager handles sync status
    };

    // Check if this transaction already exists (prevent duplicates)
    const exists = this.transactions.some(tx =>
      tx.tokenId === normalizedTx.tokenId &&
      tx.teamId === normalizedTx.teamId &&
      Math.abs(new Date(tx.timestamp) - new Date(normalizedTx.timestamp)) < 1000
    );

    if (!exists) {
      this.transactions.push(normalizedTx);
      this.currentSession.push(normalizedTx);
      this.saveTransactions();

      // Emit event for UI updates (event-driven architecture)
      this.debug?.log('[DataManager] Dispatching transaction:added event');
      this.dispatchEvent(new CustomEvent('transaction:added', {
        detail: { transaction: normalizedTx }
      }));
      this.debug?.log('[DataManager] transaction:added event dispatched');

      this.debug?.log('Added transaction to DataManager', {
        tokenId: normalizedTx.tokenId,
        memoryType: normalizedTx.memoryType,
        group: normalizedTx.group,
        teamId: normalizedTx.teamId
      });
    } else {
      this.debug?.log('Skipping duplicate transaction', normalizedTx.tokenId);
    }
  }

  /**
   * Remove transaction (event-driven pattern)
   * Called when backend broadcasts transaction:deleted
   * @param {string} transactionId - Backend transaction ID
   * @returns {boolean} True if removed, false if not found
   */
  removeTransaction(transactionId) {
    const index = this.transactions.findIndex(tx => tx.id === transactionId);

    if (index === -1) {
      this.debug?.log('[DataManager] Transaction not found for removal:', transactionId);
      return false;
    }

    const removedTx = this.transactions[index];
    this.transactions.splice(index, 1);

    // CRITICAL FIX: Remove from scannedTokens Set to allow re-scanning
    // Mirrors backend behavior (transactionService.js:663-666)
    if (removedTx.tokenId) {
      this.unmarkTokenAsScanned(removedTx.tokenId);
      this.debug?.log(`[DataManager] Token ${removedTx.tokenId} can now be re-scanned`);
    }

    // Event-driven: Emit event for UI updates
    this.debug?.log('[DataManager] Dispatching transaction:deleted event');
    this.dispatchEvent(new CustomEvent('transaction:deleted', {
      detail: {
        transactionId,
        transaction: removedTx
      }
    }));
    this.debug?.log('[DataManager] transaction:deleted event dispatched');

    this.debug?.log('[DataManager] Removed transaction', {
      transactionId,
      tokenId: removedTx.tokenId,
      teamId: removedTx.teamId
    });

    return true;
  }

  /**
   * Clear all backend scores (event-driven pattern)
   * Called when scores:reset broadcast received
   */
  clearBackendScores() {
    this.debug?.log('[DataManager] Clearing backend scores');
    this.backendScores.clear();

    // Event-driven: Emit event for UI updates
    this.debug?.log('[DataManager] Dispatching scores:cleared event');
    this.dispatchEvent(new CustomEvent('scores:cleared'));
    this.debug?.log('[DataManager] scores:cleared event dispatched');
  }

  /**
   * Reset state for new game session
   * Clears ALL session-scoped state including transactions (strict session boundaries)
   * Called when session ends or new session starts
   */
  resetForNewSession(sessionId = null) {
    // Clear ALL session-scoped state (strict session boundaries)
    this.currentSession = [];
    this.scannedTokens.clear();
    this.transactions = [];
    this.currentSessionId = sessionId;

    // Clear localStorage for all session data
    localStorage.removeItem('transactions');
    localStorage.removeItem('scannedTokens'); // Legacy key
    localStorage.removeItem('standalone_scannedTokens');
    localStorage.removeItem('networked_scannedTokens');

    // Session ID tracking:
    // - sessionId provided → save it (new session starting)
    // - sessionId null → remove it (session ended, none active)
    if (sessionId) {
      localStorage.setItem('currentSessionId', sessionId);
    } else {
      localStorage.removeItem('currentSessionId');
    }

    // Emit event for UI updates
    this.dispatchEvent(new CustomEvent('data:cleared'));

    this.debug?.log(`Reset for new session: ${sessionId || 'none'}`);
  }

  /**
   * Clear current session
   * Calls resetForNewSession to ensure duplicate detection is cleared
   */
  clearSession() {
    this.resetForNewSession();
  }

  /**
   * Parse group info from group name string
   * @param {string} groupName - Group name with multiplier
   * @returns {Object} Parsed group info
   */
  parseGroupInfo(groupName) {
    if (!groupName) {
      return { name: 'Unknown', multiplier: 1 };
    }

    // Trim input first to handle leading/trailing whitespace
    const trimmed = groupName.trim();

    // Match pattern: "Group Name (xN)"
    const match = trimmed.match(/^(.+?)\s*\(x(\d+)\)$/i);

    if (match) {
      const name = match[1].trim();
      const multiplier = parseInt(match[2]) || 1;

      if (multiplier < 1) {
        this.debug?.log(`Invalid multiplier ${multiplier} for "${name}", using 1`, true);
        return { name, multiplier: 1 };
      }

      return { name, multiplier };
    }

    return { name: trimmed, multiplier: 1 };
  }

  /**
   * Normalize group name for consistent matching
   * @param {string} name - Group name
   * @returns {string} Normalized name
   */
  normalizeGroupName(name) {
    if (!name) return '';

    return name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/['\u2018\u2019]/g, "'");  // Normalize curly apostrophes to straight
  }

  /**
   * Get current session statistics
   * @returns {Object} Session stats
   */
  getSessionStats() {
    const count = this.currentSession.length;
    const knownTokens = this.currentSession.filter(t => !t.isUnknown);
    const totalValue = knownTokens.reduce((sum, t) => sum + (t.valueRating || 0), 0);

    // Calculate score with bonuses for Black Market mode
    let totalScore = 0;
    if (this.settings?.mode === 'blackmarket' && this.currentSession.length > 0) {
      const teamId = this.currentSession[0].teamId;
      const scoreData = this.calculateTeamScoreWithBonuses(teamId);
      totalScore = scoreData.totalScore;
    } else {
      totalScore = this.currentSession.reduce((sum, t) => {
        return sum + this.calculateTokenValue(t);
      }, 0);
    }

    return { count, totalValue, totalScore };
  }

  /**
   * Calculate base value of a token
   * @param {Object} transaction - Transaction data
   * @returns {number} Token value
   */
  calculateTokenValue(transaction) {
    if (transaction.isUnknown) return 0;

    const baseValue = this.SCORING_CONFIG.BASE_VALUES[transaction.valueRating] || 0;
    const multiplier = this.SCORING_CONFIG.TYPE_MULTIPLIERS[transaction.memoryType] || 1;

    return baseValue * multiplier;
  }

  /**
   * Clear all data with confirmation
   */
  clearData() {
    if (confirm('Clear all transaction data? This cannot be undone.')) {
      this.transactions = [];
      this.resetForNewSession();  // Use resetForNewSession for consistency
      localStorage.removeItem('transactions');
      localStorage.removeItem('currentSessionId');

      // Emit event for UI updates (event-driven architecture)
      this.dispatchEvent(new CustomEvent('data:cleared'));

      alert('All data cleared');
      location.reload();
    }
  }

  /**
   * Get global statistics
   * @returns {Object} Global stats
   */
  getGlobalStats() {
    const total = this.transactions.length;
    const teams = [...new Set(this.transactions.map(t => t.teamId))].length;
    const known = this.transactions.filter(t => !t.isUnknown);

    const blackMarketTransactions = known.filter(t => t.mode === 'blackmarket');
    const detectiveTransactions = known.filter(t => t.mode === 'detective');

    const blackMarketScore = blackMarketTransactions.reduce((sum, t) => {
      return sum + this.calculateTokenValue(t);
    }, 0);

    const detectiveValue = detectiveTransactions.reduce((sum, t) => {
      return sum + (t.valueRating || 0);
    }, 0);

    const totalValue = detectiveValue + Math.floor(blackMarketScore / 1000);
    const avgValue = known.length > 0 ? (totalValue / known.length).toFixed(1) : 0;

    return { total, teams, totalValue, avgValue, blackMarketScore, detectiveValue };
  }

  /**
   * Calculate team score with group completion bonuses
   * @param {string} teamId - Team ID
   * @returns {Object} Score breakdown
   */
  calculateTeamScoreWithBonuses(teamId) {
    const transactions = this.transactions.filter(t =>
      t.teamId === teamId &&
      t.mode === 'blackmarket' &&
      !t.isUnknown
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

    this.debug?.log(`Team ${teamId}: Base=$${baseScore}, Bonus=$${bonusScore}`);

    return {
      baseScore,
      bonusScore,
      totalScore: baseScore + bonusScore,
      completedGroups: completedGroups.length,
      groupBreakdown
    };
  }

  /**
   * Get completed groups for a team
   * @param {string} teamId - Team ID
   * @returns {Array} Completed groups
   */
  getTeamCompletedGroups(teamId) {
    const groupInventory = this.tokenManager?.getGroupInventory() || {};

    const teamTokens = new Set(
      this.transactions
        .filter(t =>
          t.teamId === teamId &&
          t.mode === 'blackmarket' &&
          !t.isUnknown
        )
        .map(t => t.rfid)
    );

    const completedGroups = [];

    Object.entries(groupInventory).forEach(([normalizedName, groupData]) => {
      // Skip single-token groups and no-bonus groups
      if (groupData.tokens.size <= 1 || groupData.multiplier <= 1) {
        return;
      }

      // Check if team has ALL tokens in this group
      const groupTokenArray = [...groupData.tokens];
      const hasAllTokens = groupTokenArray.every(tokenId => teamTokens.has(tokenId));

      if (hasAllTokens) {
        completedGroups.push({
          name: groupData.displayName,
          normalizedName: normalizedName,
          multiplier: groupData.multiplier,
          tokenCount: groupData.tokens.size,
          tokens: groupTokenArray
        });
      }
    });

    return completedGroups;
  }

  /**
   * Get sorted team transactions
   * @param {string} teamId - Team ID
   * @returns {Array} Sorted transactions
   */
  getTeamTransactions(teamId) {
    const transactions = this.transactions.filter(t =>
      t.teamId === teamId
    );

    // Sort by group, value, then timestamp
    transactions.sort((a, b) => {
      const groupCompare = (a.group || '').localeCompare(b.group || '');
      if (groupCompare !== 0) return groupCompare;

      const valueCompare = (b.valueRating || 0) - (a.valueRating || 0);
      if (valueCompare !== 0) return valueCompare;

      return new Date(a.timestamp) - new Date(b.timestamp);
    });

    return transactions;
  }

  /**
   * Update game state from orchestrator
   */
  updateGameState(state) {
    if (state && typeof state === 'object') {
      // Update any relevant local state
      if (state.sessionId && this.currentSessionId !== state.sessionId) {
        this.currentSessionId = state.sessionId;
        this.debug?.log(`Session updated: ${state.sessionId}`);
      }

      if (state.gameMode && state.gameMode !== this.gameMode) {
        this.gameMode = state.gameMode;
        this.debug?.log(`Game mode updated: ${state.gameMode}`);
      }

      // If state includes new transactions, add them
      if (state.transactions && Array.isArray(state.transactions)) {
        state.transactions.forEach(transaction => {
          // Only add if we don't already have this transaction
          const exists = this.transactions.find(t =>
            t.id === transaction.id ||
            (t.rfid === transaction.tokenId && t.timestamp === transaction.timestamp)
          );
          if (!exists) {
            const localTransaction = {
              id: transaction.id || Date.now().toString(),
              rfid: transaction.tokenId,
              teamId: transaction.teamId || 'Unknown',
              timestamp: transaction.timestamp || new Date().toISOString(),
              memoryType: transaction.memoryType || 'Unknown',
              group: transaction.group || 'Unknown',
              rating: transaction.rating || 1,
              mode: this.settings?.mode || 'detective'
            };
            this.transactions.push(localTransaction);
          }
        });
        this.saveTransactions();

        // Emit event for UI updates (event-driven architecture)
        this.dispatchEvent(new CustomEvent('game-state:updated', {
          detail: { state }
        }));
      }
    }
  }

  /**
   * Update team score from backend broadcast
   * @param {Object} scoreData - Score data from backend
   */
  updateTeamScoreFromBackend(scoreData) {
    // DEBUG: Log method entry (Phase 1 instrumentation)
    console.log('[DataManager] updateTeamScoreFromBackend called:', scoreData);

    // Only update if we're connected to orchestrator
    if (!this.networkedSession || this.networkedSession.state !== 'connected') {
      console.log('[DataManager] Skipping score update - not connected. networkedSession:', this.networkedSession);
      return;
    }

    // Store backend scores for display
    if (!this.backendScores) {
      this.backendScores = new Map();
    }

    this.backendScores.set(scoreData.teamId, {
      currentScore: scoreData.currentScore,
      baseScore: scoreData.baseScore,
      bonusPoints: scoreData.bonusPoints,
      tokensScanned: scoreData.tokensScanned,
      completedGroups: scoreData.completedGroups,
      adminAdjustments: scoreData.adminAdjustments || [],
      lastUpdate: scoreData.lastUpdate
    });

    console.log('[DataManager] backendScores Map size:', this.backendScores.size, 'Full map:', this.backendScores);

    // Emit event for UI updates (event-driven architecture)
    this.dispatchEvent(new CustomEvent('team-score:updated', {
      detail: {
        teamId: scoreData.teamId,
        scoreData,
        transactions: this.getTeamTransactions(scoreData.teamId)
      }
    }));

    console.log('[DataManager] Emitted team-score:updated event');

    // Also update admin panel if it's active
    if (this.app?.viewController && this.app.viewController.currentView === 'admin') {
      this.app.updateAdminPanel();
    }

    this.debug?.log(`Score updated from backend for team ${scoreData.teamId}: $${scoreData.currentScore}`);
  }

  /**
   * Get all team scores for scoreboard
   * @returns {Array} Sorted team scores
   */
  getTeamScores() {
    // If connected and have backend scores, use those as source of truth
    if (this.networkedSession?.state === 'connected' && this.backendScores?.size > 0) {
      const scores = Array.from(this.backendScores.entries()).map(([teamId, score]) => ({
        teamId,
        score: score.currentScore,
        baseScore: score.baseScore,
        bonusScore: score.bonusPoints,
        tokenCount: score.tokensScanned,
        completedGroups: score.completedGroups,
        isFromBackend: true  // Flag to show this is authoritative
      }));

      // Sort by score
      scores.sort((a, b) => b.score - a.score);
      return scores;
    }

    // Fallback to local calculation when disconnected
    return this.calculateLocalTeamScores();
  }

  /**
   * Calculate team scores locally (fallback when disconnected)
   * @returns {Array} Sorted team scores
   */
  calculateLocalTeamScores() {
    const teamGroups = {};

    const blackMarketTransactions = this.transactions.filter(t =>
      t.mode === 'blackmarket'
    );

    blackMarketTransactions.forEach(t => {
      if (!teamGroups[t.teamId]) {
        teamGroups[t.teamId] = [];
      }
      teamGroups[t.teamId].push(t);
    });

    const teamScores = Object.keys(teamGroups).map(teamId => {
      const transactions = teamGroups[teamId];
      const scoreData = this.calculateTeamScoreWithBonuses(teamId);

      return {
        teamId: teamId,
        score: scoreData.totalScore,
        baseScore: scoreData.baseScore,
        bonusScore: scoreData.bonusScore,
        tokenCount: transactions.length,
        completedGroups: scoreData.completedGroups,
        transactions: transactions
      };
    });

    teamScores.sort((a, b) => b.score - a.score);
    return teamScores;
  }

  /**
   * Get enhanced team transactions with grouping
   * @param {string} teamId - Team ID
   * @returns {Object} Grouped transaction data
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
   * Export data in specified format
   * @param {string} format - 'json' or 'csv'
   */
  exportData(format) {
    if (this.transactions.length === 0) {
      alert('No transactions to export');
      return;
    }

    let data, filename, type;

    if (format === 'json') {
      data = JSON.stringify(this.transactions, null, 2);
      filename = `transactions_${Date.now()}.json`;
      type = 'application/json';
    } else {
      // CSV format
      const headers = ['timestamp', 'deviceId', 'mode', 'teamId', 'rfid', 'memoryType', 'group', 'valueRating'];
      const rows = [headers.join(',')];

      this.transactions.forEach(t => {
        const row = [
          t.timestamp,
          t.deviceId,
          t.mode,
          t.teamId,
          t.rfid,
          `"${t.memoryType}"`,
          `"${t.group}"`,
          t.valueRating || 0
        ];
        rows.push(row.join(','));
      });

      data = rows.join('\n');
      filename = `transactions_${Date.now()}.csv`;
      type = 'text/csv';
    }

    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Export class (not pre-created instance)
// Instance created in main.js with proper dependency injection
export default DataManager;
