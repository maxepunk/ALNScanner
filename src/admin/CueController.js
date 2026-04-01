/**
 * CueController - Cue Engine Control
 * Manages cue firing and enable/disable commands via WebSocket
 *
 * User Stories:
 * - GM fires a Quick Fire cue (pre-scripted sound/light sequence)
 * - GM enables/disables standing cues (event-driven triggers)
 *
 * @module admin/CueController
 */

import { sendCommand } from './utils/CommandSender.js';

export class CueController {
  /**
   * @param {Object} connection - OrchestratorClient instance (EventTarget)
   */
  constructor(connection) {
    this.connection = connection;
  }

  /**
   * Fire a cue (trigger its action sequence)
   * @param {string} cueId - Cue identifier (e.g., 'tension-hit')
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async fireCue(cueId, timeout = 5000) {
    return sendCommand(this.connection, 'cue:fire', { cueId }, timeout);
  }

  /**
   * Enable a standing cue (allow it to respond to triggers)
   * @param {string} cueId - Cue identifier
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async enableCue(cueId, timeout = 5000) {
    return sendCommand(this.connection, 'cue:enable', { cueId }, timeout);
  }

  /**
   * Disable a standing cue (prevent it from responding to triggers)
   * @param {string} cueId - Cue identifier
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async disableCue(cueId, timeout = 5000) {
    return sendCommand(this.connection, 'cue:disable', { cueId }, timeout);
  }

  /**
   * Pause a running compound cue
   * @param {string} cueId - Cue identifier
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async pauseCue(cueId, timeout = 5000) {
    return sendCommand(this.connection, 'cue:pause', { cueId }, timeout);
  }

  /**
   * Stop a running compound cue
   * @param {string} cueId - Cue identifier
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async stopCue(cueId, timeout = 5000) {
    return sendCommand(this.connection, 'cue:stop', { cueId }, timeout);
  }

  /**
   * Resume a paused compound cue
   * @param {string} cueId - Cue identifier
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async resumeCue(cueId, timeout = 5000) {
    return sendCommand(this.connection, 'cue:resume', { cueId }, timeout);
  }

  /**
   * Release a held cue (skip current video and start the held cue)
   * @param {string} heldId - Held item identifier
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async releaseHeld(heldId, timeout = 5000) {
    return sendCommand(this.connection, 'held:release', { heldId }, timeout);
  }

  /**
   * Discard a held cue (cancel it without starting)
   * @param {string} heldId - Held item identifier
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async discardHeld(heldId, timeout = 5000) {
    return sendCommand(this.connection, 'held:discard', { heldId }, timeout);
  }

  /**
   * Release all held items (cues + videos)
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async releaseAllHeld(timeout = 5000) {
    return sendCommand(this.connection, 'held:release-all', {}, timeout);
  }

  /**
   * Discard all held items (cues + videos)
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async discardAllHeld(timeout = 5000) {
    return sendCommand(this.connection, 'held:discard-all', {}, timeout);
  }

  /**
   * Cleanup (no persistent listeners)
   */
  destroy() {
    // CueController uses one-time listeners per command via CommandSender
    // No persistent listeners to cleanup
  }
}

export default CueController;
