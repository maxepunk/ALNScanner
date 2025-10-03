/**
 * Settings Manager
 * Manages station configuration (device ID and mode)
 * Extracted from monolith per Phase 4.3.2
 */

const Settings = {
    deviceId: '001',
    stationMode: 'detective',

    /**
     * Load settings from localStorage
     */
    load() {
        // Use ConnectionManager if available, fallback to localStorage
        if (window.connectionManager) {
            this.deviceId = window.connectionManager.deviceId;
            this.stationMode = window.connectionManager.stationMode;
        } else {
            this.deviceId = localStorage.getItem('deviceId') || '001';
            this.stationMode = localStorage.getItem('stationMode') || 'detective';
        }

        document.getElementById('deviceId').value = this.deviceId;
        document.getElementById('deviceIdDisplay').textContent = this.deviceId;
        document.getElementById('modeToggle').checked = this.stationMode === 'blackmarket';

        UIManager.updateModeDisplay(this.stationMode);
    },

    /**
     * Save settings to localStorage
     */
    save() {
        const settingsScreen = document.getElementById('settingsScreen');
        if (settingsScreen && settingsScreen.classList.contains('active')) {
            this.deviceId = document.getElementById('deviceId').value || '001';
            this.stationMode = document.getElementById('modeToggle').checked ? 'blackmarket' : 'detective';
        }

        // Use ConnectionManager if available
        if (window.connectionManager) {
            window.connectionManager.deviceId = this.deviceId;
            window.connectionManager.stationMode = this.stationMode;
        } else {
            localStorage.setItem('deviceId', this.deviceId);
            localStorage.setItem('stationMode', this.stationMode);
        }

        document.getElementById('deviceIdDisplay').textContent = this.deviceId;
        UIManager.updateModeDisplay(this.stationMode);
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
