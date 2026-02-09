/**
 * AudioController - Audio Routing Control
 * Manages audio output routing commands via WebSocket
 *
 * User Stories:
 * - GM routes video audio output to a specific PipeWire sink (e.g., Bluetooth speaker)
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
   * Set audio output for a stream (Phase 0: video stream only)
   * @param {string} sink - PipeWire sink name (e.g., 'bluez_output.AA_BB_CC_DD_EE_FF.1')
   * @param {string} [stream='video'] - Stream identifier (default: 'video')
   * @returns {Promise<Object>} Route set response
   */
  async setVideoOutput(sink, stream = 'video') {
    return sendCommand(this.connection, 'audio:route:set', { stream, sink });
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
