/**
 * SessionModeManager - Mode Locking and Persistence
 * ES6 Module - Simple State Manager
 *
 * Manages the dual operation modes (networked/standalone) with locking mechanism.
 * Once a mode is set, it cannot be changed until page reload.
 *
 * Key responsibilities:
 * - Mode locking (networked vs standalone)
 * - Mode persistence (localStorage)
 * - Mode detection and validation
 *
 * Does NOT:
 * - Initialize networked sessions (that's NetworkedSession's job)
 * - Handle UI (that's UIManager's job)
 * - Manage connections (that's ConnectionManager's job)
 */

export class SessionModeManager {
  constructor() {
    this.mode = null; // 'networked' | 'standalone' | null
    this.locked = false; // Once set, cannot change during session
  }

  /**
   * Set the session mode and lock it
   * @param {string} mode - 'networked' or 'standalone'
   * @throws {Error} If mode is already locked or invalid mode provided
   */
  setMode(mode) {
    if (this.locked) {
      throw new Error('Cannot change session mode after it is locked');
    }

    if (mode !== 'networked' && mode !== 'standalone') {
      throw new Error(`Invalid session mode: ${mode}. Must be 'networked' or 'standalone'`);
    }

    this.mode = mode;
    this.locked = true;
    this._persistMode(mode);
  }

  /**
   * Check if current mode is networked
   * @returns {boolean}
   */
  isNetworked() {
    return this.mode === 'networked';
  }

  /**
   * Check if current mode is standalone
   * @returns {boolean}
   */
  isStandalone() {
    return this.mode === 'standalone';
  }

  /**
   * Restore mode from localStorage without locking
   * Allows user to change mode on fresh start
   * @returns {string|null} Restored mode or null
   */
  restoreMode() {
    const savedMode = this._getPersistedMode();
    if (savedMode && (savedMode === 'networked' || savedMode === 'standalone')) {
      this.mode = savedMode;
      // Don't lock it yet - allow user to change on fresh start
      return savedMode;
    }
    return null;
  }

  /**
   * Clear the current mode and unlock
   * Removes mode from localStorage
   */
  clearMode() {
    this.mode = null;
    this.locked = false;
    this._clearPersistedMode();
  }

  /**
   * Get the current mode
   * @returns {string|null}
   */
  getMode() {
    return this.mode;
  }

  /**
   * Check if mode is locked
   * @returns {boolean}
   */
  isLocked() {
    return this.locked;
  }

  /**
   * Persist mode to localStorage
   * @private
   */
  _persistMode(mode) {
    try {
      localStorage.setItem('gameSessionMode', mode);
    } catch (error) {
      console.error('Failed to persist session mode:', error);
    }
  }

  /**
   * Get persisted mode from localStorage
   * @private
   * @returns {string|null}
   */
  _getPersistedMode() {
    try {
      return localStorage.getItem('gameSessionMode');
    } catch (error) {
      console.error('Failed to read persisted session mode:', error);
      return null;
    }
  }

  /**
   * Clear persisted mode from localStorage
   * @private
   */
  _clearPersistedMode() {
    try {
      localStorage.removeItem('gameSessionMode');
    } catch (error) {
      console.error('Failed to clear persisted session mode:', error);
    }
  }
}

// Create singleton instance
const sessionModeManager = new SessionModeManager();

// Export both named class and singleton instance
export default sessionModeManager;
