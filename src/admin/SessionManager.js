/**
 * SessionManager - Session Lifecycle Management
 * Handles create/pause/resume/end via WebSocket commands
 *
 * User Stories:
 * - GM creates new session with team configuration
 * - GM pauses session during breaks
 * - GM resumes session after breaks
 * - GM ends session when game concludes
 *
 * @module admin/SessionManager
 */

import { sendCommand } from './utils/CommandSender.js';

export class SessionManager {
  /**
   * @param {Object} connection - OrchestratorClient instance (EventTarget)
   */
  constructor(connection) {
    this.connection = connection;
  }

  /**
   * Create a new game session
   * @param {string} name - Session name (e.g., "Friday Night Game")
   * @param {string[]} [teams=[]] - Initial team IDs (teams are typically added dynamically)
   * @returns {Promise<Object>} Session creation response
   */
  async createSession(name, teams = []) {
    return sendCommand(this.connection, 'session:create', { name, teams });
  }

  /**
   * Start the game (transition from setup to active)
   * @returns {Promise<Object>} Start response
   */
  async startGame() {
    return sendCommand(this.connection, 'session:start', {});
  }

  /**
   * Pause the current session
   * @returns {Promise<Object>} Pause response
   */
  async pauseSession() {
    return sendCommand(this.connection, 'session:pause', {});
  }

  /**
   * Resume a paused session
   * @returns {Promise<Object>} Resume response
   */
  async resumeSession() {
    return sendCommand(this.connection, 'session:resume', {});
  }

  /**
   * End the current session
   * @returns {Promise<Object>} End response
   */
  async endSession() {
    return sendCommand(this.connection, 'session:end', {});
  }

  /**
   * Cleanup (no-op, no listeners to remove)
   */
  destroy() {}
}

export default SessionManager;
