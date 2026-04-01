/**
 * AdminOperations - System-Level Commands
 * Handles score management, transaction deletion, and system operations
 *
 * User Stories:
 * - GM resets all team scores to zero
 * - GM adjusts individual team scores (add/subtract points)
 * - GM deletes erroneous transactions
 * - GM restarts system or clears data (emergency operations)
 *
 * @module admin/AdminOperations
 */

import { sendCommand } from './utils/CommandSender.js';

export class AdminOperations {
  /**
   * @param {Object} connection - OrchestratorClient instance (EventTarget)
   */
  constructor(connection) {
    this.connection = connection;
  }

  /**
   * Restart the orchestrator system
   * @returns {Promise<Object>} Restart response
   */
  async restartSystem() {
    return sendCommand(this.connection, 'system:restart', {});
  }

  /**
   * Clear all system data
   * @returns {Promise<Object>} Clear response
   */
  async clearData() {
    return sendCommand(this.connection, 'system:clear', {});
  }

  /**
   * Reset all team scores to zero
   * @returns {Promise<Object>} Reset response
   */
  async resetScores() {
    return sendCommand(this.connection, 'score:reset', {});
  }

  /**
   * Adjust a team's score by a delta amount
   * @param {string} teamId - Team identifier (e.g., '001', '002')
   * @param {number} delta - Score adjustment (positive or negative)
   * @param {string} [reason='Admin adjustment'] - Reason for audit trail
   * @returns {Promise<Object>} Adjustment response
   */
  async adjustScore(teamId, delta, reason = 'Admin adjustment') {
    return sendCommand(this.connection, 'score:adjust', { teamId, delta, reason });
  }

  /**
   * Delete a transaction by ID
   * Reverses the transaction's score impact and removes from history
   * @param {string} transactionId - Transaction ID to delete
   * @returns {Promise<Object>} Deletion response
   */
  async deleteTransaction(transactionId) {
    return sendCommand(this.connection, 'transaction:delete', { transactionId });
  }

  /**
   * Trigger on-demand health check for a service
   * @param {string} serviceId - Service to check (e.g., 'vlc', 'spotify', 'audio')
   * @param {number} [timeout=5000]
   * @returns {Promise<Object>}
   */
  async checkService(serviceId, timeout = 5000) {
    return sendCommand(this.connection, 'service:check', { serviceId }, timeout);
  }

  /**
   * Cleanup (no-op, no listeners to remove)
   */
  destroy() {}
}

export default AdminOperations;
