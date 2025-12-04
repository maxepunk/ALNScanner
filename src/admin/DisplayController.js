/**
 * DisplayController - HDMI Display Mode Control
 * Manages display state machine (IDLE_LOOP <-> SCOREBOARD) via WebSocket
 *
 * User Stories:
 * - GM toggles between Idle Loop and Scoreboard
 * - GM sees current display status
 *
 * @module admin/DisplayController
 */

import { sendCommand } from './utils/CommandSender.js';

export class DisplayController {
    /**
     * @param {Object} connection - OrchestratorClient instance (EventTarget)
     */
    constructor(connection) {
        this.connection = connection;
    }

    /**
     * Set display to Idle Loop mode (VLC plays idle-loop.mp4)
     * @returns {Promise<Object>} Response with { success, mode: 'IDLE_LOOP' }
     */
    async setIdleLoop() {
        return sendCommand(this.connection, 'display:idle-loop', {});
    }

    /**
     * Set display to Scoreboard mode (browser shows scoreboard.html)
     * @returns {Promise<Object>} Response with { success, mode: 'SCOREBOARD' }
     */
    async setScoreboard() {
        return sendCommand(this.connection, 'display:scoreboard', {});
    }

    /**
     * Toggle between Idle Loop and Scoreboard modes
     * @returns {Promise<Object>} Response with { success, mode: 'IDLE_LOOP'|'SCOREBOARD' }
     */
    async toggleDisplayMode() {
        return sendCommand(this.connection, 'display:toggle', {});
    }

    /**
     * Get current display status
     * @returns {Promise<Object>} Response with { currentMode, previousMode, pendingVideo, timestamp }
     */
    async getDisplayStatus() {
        return sendCommand(this.connection, 'display:status', {});
    }

    /**
     * Cleanup
     */
    destroy() {
        // No persistent listeners to cleanup
    }
}

export default DisplayController;
