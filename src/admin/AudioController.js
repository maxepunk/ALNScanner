/**
 * AudioController - Audio Routing Control
 * Manages per-stream audio output routing commands via WebSocket
 *
 * User Stories:
 * - GM routes video audio output to a specific PipeWire sink
 * - GM routes Spotify music to a specific PipeWire sink
 * - GM routes sound effects to a specific PipeWire sink
 *
 * Per-stream routing (video, spotify, sound)
 *
 * @module admin/AudioController
 */

import { sendCommand } from './utils/CommandSender.js';

export class AudioController {
  /**
   * @param {Object} connection - OrchestratorClient instance (EventTarget)
   */
  constructor(connection) {
    this.connection = connection;
  }

  /**
   * Set audio output for a stream
   * @param {string} sink - PipeWire sink name (e.g., 'bluez_output.AA_BB_CC_DD_EE_FF.1', 'hdmi')
   * @param {string} [stream='video'] - Stream identifier ('video', 'spotify', 'sound')
   * @returns {Promise<Object>} Route set response
   */
  async setVideoOutput(sink, stream = 'video') {
    return sendCommand(this.connection, 'audio:route:set', { stream, sink });
  }

  /**
   * Set volume for a specific audio stream
   * @param {string} stream - Stream identifier ('video', 'spotify', 'sound')
   * @param {number} volume - Volume level (0-100)
   * @returns {Promise<Object>} Volume set response
   */
  async setVolume(stream, volume) {
    return sendCommand(this.connection, 'audio:volume:set', { stream, volume });
  }

  /**
   * Cleanup (no persistent listeners)
   */
  destroy() {
    // AudioController uses one-time listeners per command via CommandSender
    // No persistent listeners to cleanup
  }
}

export default AudioController;
