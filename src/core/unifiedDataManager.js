/**
 * UnifiedDataManager - Single entry point for data operations
 * Delegates to LocalStorage or NetworkedStorage based on session mode
 *
 * @module core/unifiedDataManager
 */

import { LocalStorage } from './storage/LocalStorage.js';
import { NetworkedStorage } from './storage/NetworkedStorage.js';

export class UnifiedDataManager extends EventTarget {
  /**
   * Create UnifiedDataManager instance
   * @param {Object} options - Dependencies
   * @param {Object} options.tokenManager - TokenManager instance
   * @param {Object} options.sessionModeManager - SessionModeManager instance
   * @param {Object} [options.debug] - Debug instance
   */
  constructor({ tokenManager, sessionModeManager, debug } = {}) {
    super();

    this.tokenManager = tokenManager;
    this.sessionModeManager = sessionModeManager;
    this.debug = debug;

    // Strategy instances (created on mode selection)
    this._localStrategy = null;
    this._networkedStrategy = null;
    this._activeStrategy = null;

    // Expose scannedTokens for backward compatibility
    this.scannedTokens = new Set();
  }
}
