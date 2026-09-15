/**
 * IStorageStrategy - Interface for data storage strategies
 * Implemented by NetworkedStorage and LocalStorage
 *
 * @interface IStorageStrategy
 */

/**
 * @typedef {Object} Transaction
 * @property {string} id - Unique transaction ID
 * @property {string} tokenId - Token identifier (from NFC/manual entry)
 * @property {string} teamId - Team identifier
 * @property {string} mode - Transaction mode ('blackmarket' | 'detective')
 * @property {number} [points] - Score value (blackmarket mode only)
 * @property {number} [valueRating] - Token star rating (1-5)
 * @property {string} [memoryType] - Token type ('Personal' | 'Business' | 'Technical')
 * @property {string} [group] - Group name with multiplier, e.g., "Server Logs (x5)"
 * @property {boolean} [isUnknown] - True if token not found in database
 * @property {string} timestamp - ISO timestamp of transaction
 */

/**
 * @typedef {Object} TransactionResult
 * @property {boolean} success - Whether operation succeeded
 * @property {boolean} [pending] - True if operation is pending backend confirmation (NetworkedStorage)
 * @property {Transaction} [transaction] - The processed transaction
 * @property {Object} [teamScore] - Updated team score
 * @property {number} [teamScore.score] - Current total score
 * @property {number} [teamScore.baseScore] - Score from tokens only
 * @property {number} [teamScore.bonusPoints] - Score from group completions
 * @property {number} [teamScore.tokensScanned] - Number of tokens scanned
 * @property {Object} [groupBonusInfo] - Group completion info if applicable
 * @property {string} [groupBonusInfo.groupName] - Name of completed group
 * @property {number} [groupBonusInfo.bonus] - Bonus points awarded
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} SessionInfo
 * @property {string} sessionId - Session identifier
 * @property {string} [name] - Session name
 * @property {string} startTime - ISO timestamp
 * @property {string} [status] - Session status ('active' | 'paused' | 'ended')
 */

/**
 * Storage strategy interface - defines contract for data persistence
 *
 * Implementations:
 * - NetworkedStorage: WebSocket communication with backend
 * - LocalStorage: Browser localStorage persistence
 *
 * Extends EventTarget to allow strategies to emit events that can be
 * forwarded by UnifiedDataManager to consumers.
 *
 * OPTIONAL MEMBERS (not declared below; UnifiedDataManager feature-detects them
 * with `typeof strategy.<name> === 'function'` and no-ops otherwise):
 * - `scannedTokens: Set<string>` — duplicate-detection guard. UnifiedDataManager
 *   adopts this Set BY REFERENCE (see its `_syncScannedTokens`), so implementers
 *   must mutate it in place (`add` / `delete` / `clear`) and persist afterwards.
 *   Reassigning it (`new Set()`) silently desyncs the facade from the strategy.
 * - `clearScannedTokens(): void` — empty that guard and persist the empty state.
 *   NetworkedStorage implements it for "Reset All Scores", which frees every
 *   token on the backend (A-4). LocalStorage does not implement it.
 * - `setTransactions` / `addTransactionFromBroadcast` /
 *   `removeTransactionFromBroadcast` — networked cache updates from broadcasts.
 */

import { parseGroupInfo, normalizeGroupName } from '../scoring.js';
export class IStorageStrategy extends EventTarget {
  constructor() {
    super();
  }
  /**
   * Initialize the storage strategy
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('IStorageStrategy.initialize() must be implemented');
  }

  /**
   * Add a transaction
   * @param {Transaction} transaction - Transaction data
   * @returns {Promise<TransactionResult>}
   */
  async addTransaction(transaction) {
    throw new Error('IStorageStrategy.addTransaction() must be implemented');
  }

  /**
   * Remove a transaction
   * @param {string} transactionId - Transaction ID to remove
   * @returns {Promise<TransactionResult>}
   */
  async removeTransaction(transactionId) {
    throw new Error('IStorageStrategy.removeTransaction() must be implemented');
  }

  /**
   * Get all transactions
   * @returns {Array} Array of transactions
   */
  getTransactions() {
    throw new Error('IStorageStrategy.getTransactions() must be implemented');
  }

  /**
   * Get team scores
   * @returns {Array} Array of team score objects
   */
  getTeamScores() {
    throw new Error('IStorageStrategy.getTeamScores() must be implemented');
  }

  /**
   * Get the groups a team has completed.
   *
   * Both `UnifiedDataManager.getEnhancedTeamTransactions()` and
   * `calculateTeamScoreWithBonuses()` destructure the returned elements as
   * `{ name, normalizedName, multiplier }`:
   * - `name` keys the score breakdown and is matched against
   *   `parseGroupInfo(transaction.group).name`, so it must be the RAW group
   *   name with the `(xN)` suffix stripped — never the normalized form.
   * - `normalizedName` is what the "completed vs in progress" set lookup uses.
   * - `multiplier` is display only; the paid bonus is always recomputed from
   *   the transaction's own group string.
   *
   * Implementations differ only in where the raw names come from (backend
   * score payload vs local team record) and share `_shapeCompletedGroups()`.
   *
   * @param {string} teamId - Team identifier
   * @returns {Array<{name: string, normalizedName: string, multiplier: number}>}
   */
  getTeamCompletedGroups(teamId) {
    throw new Error('IStorageStrategy.getTeamCompletedGroups() must be implemented');
  }

  /**
   * Shape raw completed-group names into the element shape both
   * UnifiedDataManager consumers expect. Single home for that shape so the two
   * strategies cannot drift (A-2).
   *
   * Accepts names with or without an `(xN)` suffix: the backend strips it
   * (tokenService `extractGroupName`) and LocalStorage stores the already
   * parsed `groupInfo.name`, but parsing again is free and keeps a raw
   * `SF_Group` string safe to pass in.
   *
   * @protected
   * @param {Array<string>} [rawNames] - Completed group names
   * @returns {Array<{name: string, normalizedName: string, multiplier: number}>}
   */
  _shapeCompletedGroups(rawNames) {
    const inventory = this.tokenManager?.getGroupInventory?.() || {};

    return (rawNames || [])
      .filter(raw => typeof raw === 'string' && raw.trim() !== '')
      .map(raw => {
        const parsed = parseGroupInfo(raw);
        const normalizedName = normalizeGroupName(parsed.name);

        return {
          name: parsed.name,
          normalizedName,
          // The token DB knows the real multiplier; the parsed one is only a
          // fallback for a name that arrived without its suffix.
          multiplier: inventory[normalizedName]?.multiplier ?? parsed.multiplier
        };
      });
  }

  /**
   * Adjust team score (admin operation)
   * @param {string} teamId - Team identifier
   * @param {number} delta - Score adjustment amount
   * @param {string} reason - Reason for adjustment
   * @returns {Promise<TransactionResult>}
   */
  async adjustTeamScore(teamId, delta, reason) {
    throw new Error('IStorageStrategy.adjustTeamScore() must be implemented');
  }

  /**
   * Get game activity (player discoveries + GM transactions)
   * @returns {Object} { tokens: Array, stats: Object }
   */
  getGameActivity() {
    throw new Error('IStorageStrategy.getGameActivity() must be implemented');
  }

  /**
   * Create a new session
   * @param {string} name - Session name
   * @param {Array} teams - Initial teams array
   * @returns {Promise<SessionInfo>}
   */
  async createSession(name, teams) {
    throw new Error('IStorageStrategy.createSession() must be implemented');
  }

  /**
   * End the current session
   * @returns {Promise<void>}
   */
  async endSession() {
    throw new Error('IStorageStrategy.endSession() must be implemented');
  }

  /**
   * Pause the current session
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async pauseSession() {
    throw new Error('IStorageStrategy.pauseSession() must be implemented');
  }

  /**
   * Resume a paused session
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async resumeSession() {
    throw new Error('IStorageStrategy.resumeSession() must be implemented');
  }

  /**
   * Reset all team scores to zero.
   * LocalStorage keeps transactions for audit; NetworkedStorage delegates to the
   * backend, which also clears transactions and the server-side dedup state, so
   * the local dedup guard must be dropped via clearScannedTokens() (A-4).
   * @returns {Promise<{success: boolean}>}
   */
  async resetScores() {
    throw new Error('IStorageStrategy.resetScores() must be implemented');
  }

  /**
   * Get current session info
   * @returns {SessionInfo|null}
   */
  getCurrentSession() {
    throw new Error('IStorageStrategy.getCurrentSession() must be implemented');
  }

  /**
   * Check if storage is ready/connected
   * @returns {boolean}
   */
  isReady() {
    throw new Error('IStorageStrategy.isReady() must be implemented');
  }

  /**
   * Dispose of resources
   */
  dispose() {
    // Optional cleanup - default no-op
  }
}
