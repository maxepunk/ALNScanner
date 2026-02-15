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
   * Pause a running compound cue (Phase 2)
   * @param {string} cueId - Cue identifier
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async pauseCue(cueId, timeout = 5000) {
    return sendCommand(this.connection, 'cue:pause', { cueId }, timeout);
  }

  /**
   * Stop a running compound cue (Phase 2)
   * @param {string} cueId - Cue identifier
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async stopCue(cueId, timeout = 5000) {
    return sendCommand(this.connection, 'cue:stop', { cueId }, timeout);
  }

  /**
   * Resume a paused compound cue (Phase 2)
   * @param {string} cueId - Cue identifier
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async resumeCue(cueId, timeout = 5000) {
    return sendCommand(this.connection, 'cue:resume', { cueId }, timeout);
  }

  /**
   * Resolve a video conflict for a pending compound cue (Phase 2)
   * @param {string} cueId - Conflicted cue identifier
   * @param {string} decision - 'override' (stop video, start cue) or 'cancel' (discard cue)
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async resolveConflict(cueId, decision, timeout = 5000) {
    return sendCommand(this.connection, 'cue:conflict:resolve', { cueId, decision }, timeout);
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
