/**
 * Debug Module
 * Handles debug logging and panel display
 * Extracted from monolith per Phase 4.1.3
 */

const Debug = {
    messages: [],

    /**
     * Log a debug message
     * @param {string} message - Message to log
     * @param {boolean} isError - Whether this is an error message
     */
    log(message, isError = false) {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = isError ? '❌' : '✓';
        const formatted = `[${timestamp}] ${prefix} ${message}`;

        this.messages.push(formatted);
        if (this.messages.length > CONFIG.MAX_DEBUG_MESSAGES) {
            this.messages.shift();
        }

        this.updatePanel();

        if (isError) {
            console.error(message);
        } else {
            console.log(message);
        }
    },

    /**
     * Update the debug panel display
     */
    updatePanel() {
        const content = document.getElementById('debugContent');
        if (content) {
            content.textContent = this.messages.join('\n');
            // Auto-scroll to bottom if debug view is active
            if (App.viewController?.currentView === 'debug') {
                content.scrollTop = content.scrollHeight;
            }
        }
    },

    /**
     * Toggle debug panel visibility (now switches to debug tab)
     */
    toggle() {
        // Switch to debug view using the tab system
        if (App.viewController) {
            if (App.viewController.currentView === 'debug') {
                // If already on debug, go back to scanner
                App.viewController.switchView('scanner');
            } else {
                // Switch to debug view
                App.viewController.switchView('debug');
            }
        } else {
            console.warn('Debug view not available in this mode');
        }
    },

    /**
     * Clear all debug messages
     */
    clear() {
        this.messages = [];
        this.updatePanel();
    }
};

// Export for Node.js testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Debug;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.Debug = Debug;
}
