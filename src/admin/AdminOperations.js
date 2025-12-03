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
import Debug from '../utils/debug.js';

export class AdminOperations {
  /**
   * @param {Object} connection - OrchestratorClient instance (EventTarget)
   */
  constructor(connection) {
    this.connection = connection;

    // Bind handler for cleanup
    this._messageHandler = this._handleMessage.bind(this);

    // Listen for command acknowledgments and broadcasts
    this.connection.addEventListener('message:received', this._messageHandler);
  }

  /**
   * Handle incoming messages (informational logging)
   * @private
   */
  _handleMessage(event) {
    const { type } = event.detail;

    // Handle scores:reset broadcast (informational)
    if (type === 'scores:reset') {
      Debug.log('[AdminOperations] Scores reset broadcast received');
      // sync:full will follow automatically
      // MonitoringDisplay handles the actual UI update
    }
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
   * Cleanup event listeners
   */
  destroy() {
    if (this.connection && this._messageHandler) {
      this.connection.removeEventListener('message:received', this._messageHandler);
    }
  }
}

export default AdminOperations;
