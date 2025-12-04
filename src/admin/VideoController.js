/**
 * VideoController - Video Playback Control
 * Manages video queue and playback commands via WebSocket
 *
 * User Stories:
 * - GM plays/pauses/stops/skips video playback
 * - GM adds videos manually to the queue
 * - GM reorders or clears the video queue
 * - GM monitors current video and queue length
 *
 * @module admin/VideoController
 */

import { sendCommand } from './utils/CommandSender.js';

export class VideoController {
  /**
   * @param {Object} connection - OrchestratorClient instance (EventTarget)
   */
  constructor(connection) {
    this.connection = connection;
    this.currentVideo = null;
    this.queueLength = 0;
  }

  /**
   * Start or resume video playback
   * @returns {Promise<Object>} Play response
   */
  async playVideo() {
    return sendCommand(this.connection, 'video:play', {});
  }

  /**
   * Pause video playback
   * @returns {Promise<Object>} Pause response
   */
  async pauseVideo() {
    return sendCommand(this.connection, 'video:pause', {});
  }

  /**
   * Stop video playback (returns to idle loop)
   * @returns {Promise<Object>} Stop response
   */
  async stopVideo() {
    return sendCommand(this.connection, 'video:stop', {});
  }

  /**
   * Skip current video and play next in queue
   * @returns {Promise<Object>} Skip response
   */
  async skipVideo() {
    return sendCommand(this.connection, 'video:skip', {});
  }

  /**
   * Add a video to the playback queue
   * @param {string} videoFile - Video filename (e.g., "jaw001.mp4")
   * @returns {Promise<Object>} Add response
   */
  async addToQueue(videoFile) {
    return sendCommand(this.connection, 'video:queue:add', { videoFile });
  }

  /**
   * Reorder videos in the queue
   * @param {number} fromIndex - Current position
   * @param {number} toIndex - New position
   * @returns {Promise<Object>} Reorder response
   */
  async reorderQueue(fromIndex, toIndex) {
    return sendCommand(this.connection, 'video:queue:reorder', { fromIndex, toIndex });
  }

  /**
   * Clear all videos from the queue
   * @returns {Promise<Object>} Clear response
   */
  async clearQueue() {
    return sendCommand(this.connection, 'video:queue:clear', {});
  }



  /**
   * Cleanup (no persistent listeners)
   */
  destroy() {
    // VideoController uses one-time listeners per command via CommandSender
    // No persistent listeners to cleanup
  }
}

export default VideoController;
