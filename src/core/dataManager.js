/**
 * DataManager - Transaction Storage and Scoring
 * ES6 Module Export
 *
 * Manages transactions, scoring, and persistence with dual-mode awareness.
 * Critical: Mode-specific storage prevents data leaks between networked/standalone modes.
 */

export class DataManager extends EventTarget {
  constructor({ tokenManager, settings, debug, uiManager, app, sessionModeManager, networkedSession } = {}) {
    super();

    // Inject dependencies for testability
    this.tokenManager = tokenManager;
    this.settings = settings;
    this.debug = debug;
    this.uiManager = uiManager;
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

    // Normalize transaction format (backend sends different structure)
    const normalizedTx = {
      id: transaction.id,  // Backend transaction ID (needed for deletion)
      timestamp: transaction.timestamp || new Date().toISOString(),
      deviceId: transaction.deviceId || this.settings?.deviceId,
      mode: transaction.mode || this.settings?.mode,
      teamId: transaction.teamId || this.app?.currentTeamId,
      rfid: transaction.tokenId || transaction.rfid,
      tokenId: transaction.tokenId || transaction.rfid,
      memoryType: transaction.memoryType || (tokenData?.SF_MemoryType) || 'UNKNOWN',
      group: transaction.group || tokenData?.SF_Group || 'No Group',
      // CRITICAL FIX: valueRating is 1-5, points is calculated score - don't confuse them!
      // Use valueRating if explicitly provided (even if 0), otherwise use token data
      valueRating: transaction.valueRating !== undefined ? transaction.valueRating :
                   (tokenData?.SF_ValueRating !== undefined ? tokenData.SF_ValueRating : 0),
      isUnknown: transaction.isUnknown !== undefined ? transaction.isUnknown : !tokenData,
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
      this.uiManager?.updateHistoryBadge();
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
   * Reset state for new game session
   * Clears session-scoped state (scannedTokens, currentSession) while preserving history
   * Called when new session starts or when clearing session
   */
  resetForNewSession(sessionId = null) {
    this.currentSession = [];
    this.scannedTokens.clear();
    this.currentSessionId = sessionId;

    // Clear all scanned tokens keys (both old and mode-specific)
    localStorage.removeItem('scannedTokens'); // Legacy key
    localStorage.removeItem('standalone_scannedTokens');
    localStorage.removeItem('networked_scannedTokens');

    // If sessionId provided, save it for validation on reload
    if (sessionId) {
      localStorage.setItem('currentSessionId', sessionId);
    } else {
      localStorage.removeItem('currentSessionId');
    }

    this.debug?.log(`Reset for new session: ${sessionId || 'local'}`);
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
      this.uiManager?.updateHistoryBadge();
      alert('All data cleared');
      location.reload();
    }
  }

  // Placeholder methods for Batch 2 & 3 - will implement in next batches
  calculateTeamScoreWithBonuses(teamId) {
    // TODO: Implement in Batch 2
    return { totalScore: 0, baseScore: 0, bonusScore: 0, completedGroups: 0, groupBreakdown: {} };
  }
}

// Create singleton instance for browser
const instance = new DataManager({
  tokenManager: typeof window !== 'undefined' ? window.TokenManager : null,
  settings: typeof window !== 'undefined' ? window.Settings : null,
  debug: typeof window !== 'undefined' ? window.Debug : null,
  uiManager: typeof window !== 'undefined' ? window.UIManager : null,
  app: typeof window !== 'undefined' ? window.App : null,
  sessionModeManager: typeof window !== 'undefined' ? window.sessionModeManager : null,
  networkedSession: typeof window !== 'undefined' ? window.networkedSession : null
});

// Export both class and singleton
export default instance;
