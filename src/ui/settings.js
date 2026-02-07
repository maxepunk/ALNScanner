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
   * Emits 'settings:loaded' event
   */
  load() {
    this.deviceId = localStorage.getItem('deviceId') || '001';
    this.mode = localStorage.getItem('mode') || 'detective';

    this.dispatchEvent(new CustomEvent('settings:loaded', {
      detail: { deviceId: this.deviceId, mode: this.mode }
    }));
  }

  /**
   * Save settings to localStorage
   * Emits 'settings:saved' and 'settings:changed' events
   */
  save() {
    const oldDeviceId = localStorage.getItem('deviceId') || '001';
    const oldMode = localStorage.getItem('mode') || 'detective';

    localStorage.setItem('deviceId', this.deviceId);
    localStorage.setItem('mode', this.mode);

    const deviceIdDisplay = document.getElementById('deviceIdDisplay');
    if (deviceIdDisplay) {
      deviceIdDisplay.textContent = this.deviceId;
    }

    this.dispatchEvent(new CustomEvent('settings:saved', {
      detail: { deviceId: this.deviceId, mode: this.mode }
    }));

    if (oldDeviceId !== this.deviceId || oldMode !== this.mode) {
      this.dispatchEvent(new CustomEvent('settings:changed', {
        detail: { deviceId: this.deviceId, mode: this.mode, oldDeviceId, oldMode }
      }));
    }
  }
}

// Create singleton instance
const settings = new Settings();

export default settings;
export { Settings };
