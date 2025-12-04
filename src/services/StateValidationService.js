/**
 * StateValidationService - Validates system state before mode restoration
 *
 * Problem solved: Users must clear cache when reconnecting after session ends.
 * This service validates the entire system state before restoring networked mode,
 * ensuring a clean UX without manual cache clearing.
 *
 * Validation checks:
 * 1. JWT token exists and is not expired (with 1-minute buffer)
 * 2. Orchestrator is reachable (GET /health)
 * 3. Session exists on backend (GET /api/session)
 *
 * If ANY check fails, the service signals that stale state should be cleared
 * and the user should be shown the mode selection screen.
 */

import Debug from '../utils/debug.js';

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - True if all validations passed
 * @property {string|null} reason - Failure reason (null if valid)
 * @property {Object} details - Detailed validation results
 * @property {boolean} details.tokenValid - JWT token is valid
 * @property {boolean} details.orchestratorReachable - Backend health check passed
 * @property {boolean} details.sessionExists - Backend has active session
 */

class StateValidationService {
  /**
   * @param {Object} options - Configuration options
   * @param {number} [options.timeout=5000] - Request timeout in ms
   */
  constructor(options = {}) {
    this.timeout = options.timeout || 5000;
  }

  /**
   * Validate all system state for networked mode restoration
   *
   * @param {string} orchestratorUrl - Backend URL (e.g., "https://10.0.0.1:3000")
   * @returns {Promise<ValidationResult>} Validation result
   */
  async validateAll(orchestratorUrl) {
    Debug.log('[StateValidation] Starting full validation...');

    const result = {
      valid: false,
      reason: null,
      details: {
        tokenValid: false,
        orchestratorReachable: false,
        sessionExists: false
      }
    };

    // 1. Validate JWT token
    const token = localStorage.getItem('aln_auth_token');
    if (!token) {
      result.reason = 'No authentication token found';
      Debug.log(`[StateValidation] FAIL: ${result.reason}`);
      return result;
    }

    if (!this.isTokenValid(token)) {
      result.reason = 'Authentication token expired';
      Debug.log(`[StateValidation] FAIL: ${result.reason}`);
      return result;
    }
    result.details.tokenValid = true;
    Debug.log('[StateValidation] Token valid');

    // 2. Validate orchestrator reachability
    if (!orchestratorUrl) {
      result.reason = 'No orchestrator URL configured';
      Debug.log(`[StateValidation] FAIL: ${result.reason}`);
      return result;
    }

    const healthOk = await this.checkOrchestratorHealth(orchestratorUrl);
    if (!healthOk) {
      result.reason = 'Orchestrator unreachable';
      Debug.log(`[StateValidation] FAIL: ${result.reason}`);
      return result;
    }
    result.details.orchestratorReachable = true;
    Debug.log('[StateValidation] Orchestrator reachable');

    // 3. Validate session exists
    const sessionExists = await this.checkSessionExists(orchestratorUrl);
    if (!sessionExists) {
      result.reason = 'No active session on orchestrator';
      Debug.log(`[StateValidation] FAIL: ${result.reason}`);
      return result;
    }
    result.details.sessionExists = true;
    Debug.log('[StateValidation] Session exists');

    // All validations passed
    result.valid = true;
    Debug.log('[StateValidation] All validations PASSED');
    return result;
  }

  /**
   * Check if JWT token is valid (not expired, with 1-minute buffer)
   * @param {string} token - JWT token string
   * @returns {boolean} True if valid
   */
  isTokenValid(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;

      // Use atob for browser, Buffer for Node.js (tests)
      const decode = typeof atob !== 'undefined'
        ? (str) => atob(str)
        : (str) => Buffer.from(str, 'base64').toString();

      const payload = JSON.parse(decode(parts[1]));
      const expiry = payload.exp;
      if (!expiry) return false;

      const now = Math.floor(Date.now() / 1000);
      const buffer = 60; // 1-minute safety buffer
      return (expiry - buffer) > now;
    } catch (error) {
      Debug.log(`[StateValidation] Token parse error: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if orchestrator is reachable via health endpoint
   * @param {string} orchestratorUrl - Backend URL
   * @returns {Promise<boolean>} True if reachable
   */
  async checkOrchestratorHealth(orchestratorUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${orchestratorUrl}/health`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      Debug.log(`[StateValidation] Health check error: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if session exists on backend
   * @param {string} orchestratorUrl - Backend URL
   * @returns {Promise<boolean>} True if session exists
   */
  async checkSessionExists(orchestratorUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${orchestratorUrl}/api/session`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      // Session exists if we get a valid session object (not null/empty)
      return !!(data && data.id);
    } catch (error) {
      Debug.log(`[StateValidation] Session check error: ${error.message}`);
      return false;
    }
  }

  /**
   * Clear all stale state from localStorage
   * Called when validation fails to ensure clean state
   */
  clearStaleState() {
    Debug.log('[StateValidation] Clearing stale state...');

    // Clear auth token
    localStorage.removeItem('aln_auth_token');

    // Clear saved orchestrator URL (optional - user might want to keep this)
    // localStorage.removeItem('aln_orchestrator_url');

    // Clear game session mode
    localStorage.removeItem('aln_game_session_mode');

    // Clear any cached session data
    localStorage.removeItem('aln_session_data');

    Debug.log('[StateValidation] Stale state cleared');
  }
}

// Export singleton instance and class
const stateValidationService = new StateValidationService();
export { StateValidationService };
export default stateValidationService;
