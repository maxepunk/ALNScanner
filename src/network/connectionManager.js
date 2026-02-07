/**
 * ConnectionManager - Connection Lifecycle Manager
 * ES6 Module - Browser Only
 *
 * Responsibilities:
 * - Token validation (JWT expiry check with 1-minute buffer)
 * - Health checks (orchestrator reachability)
 * - Retry logic with exponential backoff
 * - Reconnection handling (on server-initiated disconnect)
 * - Auth:required event emission (token expiry, max retries)
 *
 * Does NOT handle:
 * - WebSocket connection (OrchestratorClient)
 * - Message sending (OrchestratorClient)
 * - Message processing (consumers)
 * - Admin operations (AdminController)
 */

export class ConnectionManager extends EventTarget {
  constructor(config = {}) {
    super();

    this.config = {
      url: config.url || 'https://localhost:3000',
      deviceId: config.deviceId || 'GM_STATION_UNKNOWN',
      deviceType: 'gm'
    };

    this.client = config.client; // OrchestratorClient instance
    this.token = config.token || null;
    this.state = 'disconnected'; // disconnected, connecting, connected
    this.retryCount = 0;
    this.maxRetries = config.maxRetries || 5;
    this.retryTimer = null;
    this.disconnectHandler = null;

    // Wire global connection status indicator updates
    this.addEventListener('connecting', () => this._updateGlobalConnectionStatus('connecting'));
    this.addEventListener('connected', () => this._updateGlobalConnectionStatus('connected'));
    this.addEventListener('disconnected', () => this._updateGlobalConnectionStatus('disconnected'));
  }

  /**
   * Validate JWT token expiry with 1-minute buffer
   * @returns {boolean}
   */
  isTokenValid() {
    if (!this.token) return false;

    try {
      // Parse JWT (format: header.payload.signature)
      const parts = this.token.split('.');
      if (parts.length !== 3) return false;

      const payload = JSON.parse(atob(parts[1]));
      const expiry = payload.exp; // Unix timestamp (seconds)

      if (!expiry) return false;

      // Check with 1-minute buffer
      const now = Math.floor(Date.now() / 1000);
      const buffer = 60; // 1 minute

      return (expiry - buffer) > now;
    } catch {
      // Token parsing failed - consider invalid
      return false;
    }
  }

  /**
   * Check orchestrator health
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.url}/health`, {
        method: 'GET',
        mode: 'cors',
        signal: controller.signal
      });

      clearTimeout(timeout);
      return response.ok;
    } catch {
      // Health check failed - orchestrator unreachable
      return false;
    }
  }

  /**
   * Connect to orchestrator
   * @returns {Promise<void>}
   * @emits connecting - Connection attempt started
   * @emits connected - Connection established
   * @emits auth:required - Token invalid/expired
   * @throws {Error} If validation or connection fails
   */
  async connect() {
    // Validate token
    if (!this.isTokenValid()) {
      this.dispatchEvent(new CustomEvent('auth:required', {
        detail: { reason: 'invalid_token' }
      }));
      throw new Error('Invalid or expired token');
    }

    // Check health
    const healthy = await this.checkHealth();
    if (!healthy) {
      throw new Error('Orchestrator unreachable');
    }

    // Clear any pending retry timer
    this._clearRetryTimer();

    // Update state
    this.state = 'connecting';
    this.dispatchEvent(new CustomEvent('connecting'));

    try {
      // Delegate WebSocket connection to OrchestratorClient
      await this.client.connect(this.token, {
        deviceId: this.config.deviceId,
        deviceType: this.config.deviceType
      });

      // Connection successful
      this.state = 'connected';
      this.retryCount = 0;
      this.dispatchEvent(new CustomEvent('connected'));

      // Setup reconnection handler
      this._setupReconnectionHandler();

    } catch (error) {
      this.state = 'disconnected';

      // Schedule retry
      this.retryCount++;
      if (this.retryCount < this.maxRetries) {
        this._scheduleRetry();
      } else {
        this.dispatchEvent(new CustomEvent('auth:required', {
          detail: { reason: 'max_retries' }
        }));
      }

      throw error;
    }
  }

  /**
   * Disconnect from orchestrator
   * @returns {Promise<void>}
   */
  async disconnect() {
    this._clearRetryTimer();
    this._removeReconnectionHandler();

    if (this.client) {
      await this.client.disconnect();
    }

    this.state = 'disconnected';
  }

  /**
   * Update authentication token
   * @param {string} token - New JWT token
   */
  updateToken(token) {
    this.token = token;
  }

  /**
   * Setup reconnection handler for server-initiated disconnects
   * @private
   */
  _setupReconnectionHandler() {
    if (this.disconnectHandler) {
      this._removeReconnectionHandler();
    }

    this.disconnectHandler = (event) => {
      const reason = event.detail?.reason;

      this.state = 'disconnected';
      this.dispatchEvent(new CustomEvent('disconnected', { detail: { reason } }));

      // Only auto-reconnect on server-initiated disconnect
      if (reason === 'io server disconnect') {
        // Check if token still valid
        if (!this.isTokenValid()) {
          this.dispatchEvent(new CustomEvent('auth:required', {
            detail: { reason: 'token_expired' }
          }));
          return;
        }

        // Schedule reconnection
        setTimeout(() => {
          this.connect().catch(() => {
            // Retry logic handles failures
          });
        }, 1000);
      }
    };

    this.client.addEventListener('socket:disconnected', this.disconnectHandler);
  }

  /**
   * Remove reconnection handler
   * @private
   */
  _removeReconnectionHandler() {
    if (this.disconnectHandler) {
      this.client.removeEventListener('socket:disconnected', this.disconnectHandler);
      this.disconnectHandler = null;
    }
  }

  /**
   * Schedule retry with exponential backoff
   * @private
   */
  _scheduleRetry() {
    const delay = this._calculateRetryDelay();

    this.retryTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Retry logic handles failures
      });
    }, delay);
  }

  /**
   * Calculate retry delay with exponential backoff
   * @returns {number} Delay in milliseconds
   * @private
   */
  _calculateRetryDelay() {
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const delay = baseDelay * Math.pow(2, this.retryCount);
    return Math.min(delay, maxDelay);
  }

  /**
   * Clear retry timer
   * @private
   */
  _clearRetryTimer() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Update global connection status indicator in header
   * @param {string} status - Connection status: 'connecting', 'connected', 'disconnected'
   * @private
   */
  _updateGlobalConnectionStatus(status) {
    const statusElement = document.getElementById('connectionStatus');
    if (!statusElement) return;

    // Remove all status classes
    statusElement.classList.remove('connected', 'connecting', 'disconnected');

    // Add current status class
    statusElement.classList.add(status);

    // Update text
    const textElement = statusElement.querySelector('.status-text');
    if (textElement) {
      const statusText = {
        connecting: 'Connecting...',
        connected: 'Connected',
        disconnected: 'Disconnected'
      };
      textElement.textContent = statusText[status] || 'Unknown';
    }
  }
}

export default ConnectionManager;
