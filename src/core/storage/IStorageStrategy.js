/**
 * IStorageStrategy - Interface for data storage strategies
 * Implemented by NetworkedStorage and LocalStorage
 *
 * @interface IStorageStrategy
 */

/**
 * @typedef {Object} TransactionResult
 * @property {boolean} success - Whether operation succeeded
 * @property {Object} [transaction] - The processed transaction
 * @property {Object} [teamScore] - Updated team score
 * @property {Object} [groupBonusInfo] - Group completion info if applicable
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} SessionInfo
 * @property {string} sessionId - Session identifier
 * @property {string} startTime - ISO timestamp
 * @property {string} [status] - Session status (active/paused/ended)
 */

/**
 * Storage strategy interface - defines contract for data persistence
 *
 * Implementations:
 * - NetworkedStorage: WebSocket communication with backend
 * - LocalStorage: Browser localStorage persistence
 */
export class IStorageStrategy {
  /**
   * Initialize the storage strategy
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('IStorageStrategy.initialize() must be implemented');
  }

  /**
   * Add a transaction
   * @param {Object} transaction - Transaction data
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
