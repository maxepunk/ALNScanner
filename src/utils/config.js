/**
 * Application Configuration Constants
 * ES6 Module Export
 */

export const CONFIG = {
    MAX_TEAM_ID_LENGTH: 6,
    MAX_DEBUG_MESSAGES: 50,
    ANIMATION_DURATION: 200,
    MODE_TOGGLE_SCALE: 1.1,
    SCAN_SIMULATION_DELAY: 1000,
    NFC_PULSE_INTERVAL: 2000
};

// Export as default as well for convenience
/**
 * Serving-origin check: is this scanner served BY the orchestrator (at
 * /gm-scanner)? Drives pack-channel selection (packLoader) and the
 * connection wizard's same-origin candidate. Exact segment match — a
 * hypothetical /gm-scanner-other path is NOT orchestrator-served.
 */
export function isOrchestratorServed(pathname) {
    return pathname === '/gm-scanner' || pathname.startsWith('/gm-scanner/');
}

export default CONFIG;
