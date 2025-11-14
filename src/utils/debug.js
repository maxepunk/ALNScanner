/**
 * Debug Logging System
 * ES6 Module Export
 */

import CONFIG from './config.js';

class DebugLogger {
  constructor() {
    this.messages = [];
  }

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
  }

  /**
   * Update the debug panel display
   * @param {Object} app - App instance (for viewController access)
   */
  updatePanel(app = null) {
    const content = document.getElementById('debugContent');
    if (content) {
      content.textContent = this.messages.join('\n');
      // Auto-scroll to bottom if debug view is active
      // TODO: Remove app parameter once App is converted to ES6
      if (app?.viewController?.currentView === 'debug') {
        content.scrollTop = content.scrollHeight;
      }
    }
  }

  /**
   * Toggle debug panel visibility
   * @param {Object} app - App instance (for viewController access)
   */
  toggle(app = null) {
    // TODO: Remove app parameter once App is converted to ES6
    if (app?.viewController) {
      if (app.viewController.currentView === 'debug') {
        app.viewController.switchView('scanner');
      } else {
        app.viewController.switchView('debug');
      }
    } else {
      console.warn('Debug view not available in this mode');
    }
  }

  /**
   * Clear all debug messages
   */
  clear() {
    this.messages = [];
    this.updatePanel();
  }
}

// Create singleton instance
const Debug = new DebugLogger();

export default Debug;
export { DebugLogger };
