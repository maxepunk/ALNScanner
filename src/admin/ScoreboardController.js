/**
 * ScoreboardController - GM-driven evidence page navigation
 *
 * Lets the GM manually scroll through character-grouped evidence pages on
 * the scoreboard displays without waiting for the automated cycle. Pure
 * passthrough: the backend broadcasts to scoreboards via the `gm` room
 * and scoreboards perform the transition client-side. Networked mode only.
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

    /** Advance scoreboards to the next evidence page. */
    async scrollNext() {
        return sendCommand(this.connection, 'scoreboard:page:next', {});
    }

    /** Return scoreboards to the previous evidence page. */
    async scrollPrev() {
        return sendCommand(this.connection, 'scoreboard:page:prev', {});
    }

    /**
     * Jump scoreboards to the page containing the given character owner.
     * Scoreboards whose current page set does not include the owner no-op.
     * @param {string} owner - Character owner name (validated by backend)
     */
    async jumpToOwner(owner) {
        return sendCommand(this.connection, 'scoreboard:page:owner', { owner });
    }

    /** Cleanup — no persistent listeners */
    destroy() {}
}

export default ScoreboardController;
