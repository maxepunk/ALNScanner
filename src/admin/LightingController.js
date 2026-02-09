/**
 * LightingController - Home Assistant Lighting/Scene Control
 * Manages scene activation and discovery via WebSocket commands to backend
 *
 * User Stories:
 * - GM activates a Home Assistant scene (e.g., dramatic red, blackout)
 * - GM refreshes the list of available scenes from Home Assistant
 *
 * @module admin/LightingController
 */

import { sendCommand } from './utils/CommandSender.js';

export class LightingController {
  /**
   * @param {Object} connection - OrchestratorClient instance (EventTarget)
   */
  constructor(connection) {
    this.connection = connection;
  }

  /**
   * Activate a Home Assistant scene
   * @param {string} sceneId - Scene entity ID (e.g., 'scene.dramatic_red')
   * @returns {Promise<Object>} Activation response
   */
  async activateScene(sceneId) {
    return sendCommand(this.connection, 'lighting:scene:activate', { sceneId });
  }

  /**
   * Refresh available scenes from Home Assistant
   * @returns {Promise<Object>} Refresh response with updated scenes list
   */
  async refreshScenes() {
    return sendCommand(this.connection, 'lighting:scenes:refresh', {});
  }

  /**
   * Cleanup (no persistent listeners)
   */
  destroy() {
    // LightingController uses one-time listeners per command via CommandSender
    // No persistent listeners to cleanup
  }
}

export default LightingController;
