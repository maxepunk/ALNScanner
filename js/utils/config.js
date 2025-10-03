/**
 * Configuration Constants
 * Extracted from monolith per Phase 4.1.1
 */

const CONFIG = {
    MAX_TEAM_ID_LENGTH: 6,
    MAX_DEBUG_MESSAGES: 50,
    ANIMATION_DURATION: 200,
    MODE_TOGGLE_SCALE: 1.1,
    SCAN_SIMULATION_DELAY: 1000,
    NFC_PULSE_INTERVAL: 2000
};

// Export for Node.js testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}
