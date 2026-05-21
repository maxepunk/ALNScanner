/**
 * MusicController - Local Music Playback Control (MPD)
 * Manages music:* commands via WebSocket.
 *
 * Provides transports plus playlist + shuffle/loop semantics.
 *
 * @module admin/MusicController
 */

import { sendCommand } from './utils/CommandSender.js';

export class MusicController {
  /**
   * @param {Object} connection - OrchestratorClient instance (EventTarget)
   */
  constructor(connection) {
    this.connection = connection;
  }

  // ── Transports ──

  async play(timeout = 5000) {
    return sendCommand(this.connection, 'music:play', {}, timeout);
  }

  async pause(timeout = 5000) {
    return sendCommand(this.connection, 'music:pause', {}, timeout);
  }

  async stop(timeout = 5000) {
    return sendCommand(this.connection, 'music:stop', {}, timeout);
  }

  async next(timeout = 5000) {
    return sendCommand(this.connection, 'music:next', {}, timeout);
  }

  async previous(timeout = 5000) {
    return sendCommand(this.connection, 'music:previous', {}, timeout);
  }

  // ── Settings ──

  /**
   * Set music volume.
   * @param {number} volume - 0-100
   */
  async setVolume(volume, timeout = 5000) {
    return sendCommand(this.connection, 'music:setVolume', { volume }, timeout);
  }

  /**
   * Toggle shuffle on the active queue.
   * @param {boolean} enabled
   */
  async setShuffle(enabled, timeout = 5000) {
    return sendCommand(this.connection, 'music:setShuffle', { enabled: !!enabled }, timeout);
  }

  /**
   * Toggle loop on the active queue.
   * @param {boolean} enabled
   */
  async setLoop(enabled, timeout = 5000) {
    return sendCommand(this.connection, 'music:setLoop', { enabled: !!enabled }, timeout);
  }

  /**
   * Load a playlist by id (replaces queue, starts playback).
   * @param {string} playlistId - kebab-case id from music-playlists.json
   */
  async loadPlaylist(playlistId, timeout = 5000) {
    return sendCommand(this.connection, 'music:loadPlaylist', { playlistId }, timeout);
  }

  /**
   * Cleanup (no persistent listeners — CommandSender uses one-time listeners).
   */
  destroy() {
    // Intentionally empty — CommandSender uses one-time listeners.
  }
}

export default MusicController;
