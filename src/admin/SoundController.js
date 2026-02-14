/**
 * SoundController - Sound Playback Control
 * Manages sound playback commands via WebSocket
 *
 * User Stories:
 * - GM plays a sound effect on a specific target (e.g., 'sound:spot1')
 * - GM stops a playing sound effect
 * - GM stops all playing sounds
 *
 * @module admin/SoundController
 */

import { sendCommand } from './utils/CommandSender.js';

export class SoundController {
  /**
   * @param {Object} connection - OrchestratorClient instance (EventTarget)
   */
  constructor(connection) {
    this.connection = connection;
  }

  /**
   * Play a sound effect
   * @param {string} file - Sound file path (relative to backend's sounds directory)
   * @param {string} [target] - Optional target identifier (e.g., 'sound:spot1')
   * @param {number} [volume] - Optional volume level (0-100)
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async playSound(file, target = null, volume = null, timeout = 5000) {
    const payload = { file };
    if (target !== null) payload.target = target;
    if (volume !== null) payload.volume = volume;

    return sendCommand(this.connection, 'sound:play', payload, timeout);
  }

  /**
   * Stop a specific playing sound or all sounds
   * @param {string} [file] - Optional file path to stop specific sound (omit to stop all)
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async stopSound(file = null, timeout = 5000) {
    const payload = file !== null ? { file } : {};
    return sendCommand(this.connection, 'sound:stop', payload, timeout);
  }

  /**
   * Cleanup (no persistent listeners)
   */
  destroy() {
    // SoundController uses one-time listeners per command via CommandSender
    // No persistent listeners to cleanup
  }
}

export default SoundController;
