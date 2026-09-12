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
   * Start the game (transition from setup to active).
   *
   * The backend REFUSES the start while a need the pack marked
   * `onAbsent: require` is unresolved (Block 2 T1a, pin P7); the ack comes
   * back `success:false` with a message beginning `NO-GO: `. The typed way
   * past it — collecting a reason from the operator and re-sending — lives
   * in `app/domains/gameAdmin.js`, where the scanner's prompt() idiom is;
   * this method only carries the payload.
   *
   * @param {{startAnyway?: boolean, reason?: string}} [opts]
   * @returns {Promise<Object>} Start response
   */
  async startGame({ startAnyway = false, reason } = {}) {
    const payload = startAnyway ? { startAnyway: true, reason } : {};
    return sendCommand(this.connection, 'session:start', payload);
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
