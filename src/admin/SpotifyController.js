/**
 * SpotifyController - Spotify Playback Control
 * Manages Spotify commands via WebSocket
 *
 * User Stories:
 * - GM plays/pauses/stops Spotify playback during the game
 * - GM switches between Act 1/2/3 playlists
 * - GM adjusts Spotify volume independently from other audio
 * - GM verifies cache status of offline playlists
 *
 * @module admin/SpotifyController
 */

import { sendCommand } from './utils/CommandSender.js';

export class SpotifyController {
  /**
   * @param {Object} connection - OrchestratorClient instance (EventTarget)
   */
  constructor(connection) {
    this.connection = connection;
  }

  /**
   * Play Spotify
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async play(timeout = 5000) {
    return sendCommand(this.connection, 'spotify:play', {}, timeout);
  }

  /**
   * Pause Spotify
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async pause(timeout = 5000) {
    return sendCommand(this.connection, 'spotify:pause', {}, timeout);
  }

  /**
   * Stop Spotify
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async stop(timeout = 5000) {
    return sendCommand(this.connection, 'spotify:stop', {}, timeout);
  }

  /**
   * Next track
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async next(timeout = 5000) {
    return sendCommand(this.connection, 'spotify:next', {}, timeout);
  }

  /**
   * Previous track
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async previous(timeout = 5000) {
    return sendCommand(this.connection, 'spotify:previous', {}, timeout);
  }

  /**
   * Set Spotify volume
   * @param {number} volume - Volume level (0-100)
   * @param {number} [timeout=5000] - Command timeout in milliseconds
   * @returns {Promise<Object>} Command acknowledgment
   */
  async setVolume(volume, timeout = 5000) {
    return sendCommand(this.connection, 'spotify:volume', { volume }, timeout);
  }

  /**
   * Cleanup (no persistent listeners)
   */
  destroy() {
    // SpotifyController uses one-time listeners per command via CommandSender
    // No persistent listeners to cleanup
  }
}

export default SpotifyController;
