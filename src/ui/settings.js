/**
 * Settings Manager
 * Manages station configuration (device ID and mode)
 * ES6 Module - Event-Driven Architecture
 *
 * Emits events:
 * - 'settings:loaded' - After loading from localStorage
 * - 'settings:saved' - After saving to localStorage
 * - 'settings:changed' - When any setting value changes
 */

class Settings extends EventTarget {
  /**
   * Create Settings instance
   * Pure event-driven - no dependencies on UIManager
   */
  constructor() {
    super();
    this.deviceId = '001';
    this.mode = 'detective';
  }

  /**
   * Load settings from localStorage
   * Updates DOM and emits 'settings:loaded' event
   */
  load() {
    // Load from localStorage
    this.deviceId = localStorage.getItem('deviceId') || '001';
    this.mode = localStorage.getItem('mode') || 'detective';

    // Update DOM elements if they exist
    const deviceIdInput = document.getElementById('deviceId');
    const deviceIdDisplay = document.getElementById('deviceIdDisplay');
    const modeToggle = document.getElementById('modeToggle');

    if (deviceIdInput) {
      deviceIdInput.value = this.deviceId;
    }
    if (deviceIdDisplay) {
      deviceIdDisplay.textContent = this.deviceId;
    }
    if (modeToggle) {
      modeToggle.checked = this.mode === 'blackmarket';
    }

    // Emit event for listeners (UIManager, App.js, etc.)
    this.dispatchEvent(new CustomEvent('settings:loaded', {
      detail: {
        deviceId: this.deviceId,
        mode: this.mode
      }
    }));
  }

  /**
   * Save settings to localStorage
   * Reads from DOM if settings screen is active
   * Emits 'settings:saved' and 'settings:changed' events
   */
  save() {
    const settingsScreen = document.getElementById('settingsScreen');

    const oldDeviceId = this.deviceId;
    const oldMode = this.mode;

    // Only read from DOM if settings screen is active
    if (settingsScreen && settingsScreen.classList.contains('active')) {
      const deviceIdInput = document.getElementById('deviceId');
      const modeToggle = document.getElementById('modeToggle');

      if (deviceIdInput) {
        this.deviceId = deviceIdInput.value || '001';
      }
      if (modeToggle) {
        this.mode = modeToggle.checked ? 'blackmarket' : 'detective';
      }
    }

    // Save to localStorage
    localStorage.setItem('deviceId', this.deviceId);
    localStorage.setItem('mode', this.mode);

    // Update display
    const deviceIdDisplay = document.getElementById('deviceIdDisplay');
    if (deviceIdDisplay) {
      deviceIdDisplay.textContent = this.deviceId;
    }

    // Emit settings:saved event
    this.dispatchEvent(new CustomEvent('settings:saved', {
      detail: {
        deviceId: this.deviceId,
        mode: this.mode
      }
    }));

    // Emit settings:changed if values actually changed
    if (oldDeviceId !== this.deviceId || oldMode !== this.mode) {
      this.dispatchEvent(new CustomEvent('settings:changed', {
        detail: {
          deviceId: this.deviceId,
          mode: this.mode,
          oldDeviceId,
          oldMode
        }
      }));
    }
  }
}

// Create singleton instance
const settings = new Settings();

export default settings;
export { Settings };
