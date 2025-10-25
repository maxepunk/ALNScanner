/**
 * Settings Manager
 * Manages station configuration (device ID and mode)
 * Extracted from monolith per Phase 4.3.2
 */

const Settings = {
    deviceId: '001',
    mode: 'detective',

    /**
     * Load settings from localStorage
     */
    load() {
        // Use ConnectionManager if available, fallback to localStorage
        if (window.connectionManager) {
            this.deviceId = window.connectionManager.deviceId;
            this.mode = window.connectionManager.mode;
        } else {
            this.deviceId = localStorage.getItem('deviceId') || '001';
            this.mode = localStorage.getItem('mode') || 'detective';
        }

        document.getElementById('deviceId').value = this.deviceId;
        document.getElementById('deviceIdDisplay').textContent = this.deviceId;
        document.getElementById('modeToggle').checked = this.mode === 'blackmarket';

        UIManager.updateModeDisplay(this.mode);
    },

    /**
     * Save settings to localStorage
     */
    save() {
        const settingsScreen = document.getElementById('settingsScreen');
        if (settingsScreen && settingsScreen.classList.contains('active')) {
            this.deviceId = document.getElementById('deviceId').value || '001';
            this.mode = document.getElementById('modeToggle').checked ? 'blackmarket' : 'detective';
        }

        // Use ConnectionManager if available
        if (window.connectionManager) {
            window.connectionManager.deviceId = this.deviceId;
            window.connectionManager.mode = this.mode;
        } else {
            localStorage.setItem('deviceId', this.deviceId);
            localStorage.setItem('mode', this.mode);
        }

        document.getElementById('deviceIdDisplay').textContent = this.deviceId;
        UIManager.updateModeDisplay(this.mode);
    }
};

// Export for Node.js testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Settings;
}

// Make available globally in browser
if (typeof window !== 'undefined') {
    window.Settings = Settings;
}
