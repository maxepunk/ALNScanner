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
    this.currentSession = null;

    // Bind handler for cleanup
    this._messageHandler = this._handleMessage.bind(this);

    // Listen to session-related broadcasts
    this.connection.addEventListener('message:received', this._messageHandler);
  }

  /**
   * Handle incoming session-related messages
   * @private
   */
  _handleMessage(event) {
    const { type, payload } = event.detail;

    // Update local session state from broadcasts
    if (type === 'session:update') {
      this.currentSession = payload;
    }

    // Update from sync:full for initial state on connection
    if (type === 'sync:full' && payload.session) {
      this.currentSession = payload.session;
    }
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
   * Pause the current session
   * @returns {Promise<Object>} Pause response
   */
  async pauseSession() {
    if (!this.currentSession) return;
    return sendCommand(this.connection, 'session:pause', {});
  }

  /**
   * Resume a paused session
   * @returns {Promise<Object>} Resume response
   */
  async resumeSession() {
    if (!this.currentSession) return;
    return sendCommand(this.connection, 'session:resume', {});
  }

  /**
   * End the current session
   * @returns {Promise<Object>} End response
   */
  async endSession() {
    if (!this.currentSession) return;
    return sendCommand(this.connection, 'session:end', {});
  }

  /**
   * Get current session state
   * @returns {Object|null} Current session or null
   */
  getSession() {
    return this.currentSession;
  }

  /**
   * Check if a session is active
   * @returns {boolean}
   */
  isActive() {
    return this.currentSession?.status === 'active';
  }

  /**
   * Check if session is paused
   * @returns {boolean}
   */
  isPaused() {
    return this.currentSession?.status === 'paused';
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

export default SessionManager;
