/**
 * ScoreboardController - GM-driven evidence page navigation
 *
 * Lets the GM manually scroll through character-grouped evidence pages on
 * the scoreboard displays without waiting for the automated cycle.
 *
 * Networked mode only. Pure passthrough: sends gm:command actions, the
 * backend's scoreboardControlService broadcasts to scoreboards via the
 * `gm` room, and scoreboards perform the transition client-side.
 *
 * @module admin/ScoreboardController
 */

import { sendCommand } from './utils/CommandSender.js';

export class ScoreboardController {
    /**
     * @param {Object} connection - OrchestratorClient instance (EventTarget)
     */
    constructor(connection) {
        this.connection = connection;
    }

    /**
     * Advance scoreboards to the next evidence page.
     * @returns {Promise<Object>}
     */
    async scrollNext() {
        return sendCommand(this.connection, 'scoreboard:page:next', {});
    }

    /**
     * Return scoreboards to the previous evidence page.
     * @returns {Promise<Object>}
     */
    async scrollPrev() {
        return sendCommand(this.connection, 'scoreboard:page:prev', {});
    }

    /**
     * Jump scoreboards to the page containing the given character owner.
     * Scoreboards whose current page set does not include the owner will
     * no-op (viewport-dependent — page layout may differ per display).
     *
     * @param {string} owner - Character owner name
     * @returns {Promise<Object>}
     */
    async jumpToOwner(owner) {
        if (typeof owner !== 'string' || !owner.trim()) {
            return Promise.reject(new Error('owner is required'));
        }
        return sendCommand(this.connection, 'scoreboard:page:owner', { owner: owner.trim() });
    }

    /**
     * Cleanup
     */
    destroy() {
        // No persistent listeners
    }
}

export default ScoreboardController;
