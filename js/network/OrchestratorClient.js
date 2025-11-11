/**
 * OrchestratorClient - Dumb WebSocket Pipe
 *
 * Responsibilities:
 * - Create/destroy Socket.io connection
 * - Send messages with AsyncAPI envelope wrapper
 * - Forward all received messages as events
 * - Clean connection lifecycle (connect, disconnect)
 *
 * Does NOT handle:
 * - Token validation (ConnectionManager)
 * - Retry logic (ConnectionManager)
 * - Reconnection handling (ConnectionManager)
 * - Health checks (ConnectionManager)
 * - Message processing (consumers listen to events)
 * - Admin module initialization (AdminController)
 *
 * NOTE: This is the REFACTORED version. The old orchestratorClient.js
 *       (lowercase 'o') will be removed in Phase 6.
 */

class OrchestratorClient extends EventTarget {
  constructor(config = {}) {
    super();

    this.config = {
      url: config.url || 'https://localhost:3000',
      deviceId: config.deviceId || 'GM_STATION_UNKNOWN',
      version: '1.0.0',
      transports: ['websocket']
    };

    this.socket = null;
    this.isConnected = false;
  }

  /**
   * Connect to orchestrator WebSocket
   * @param {string} token - JWT authentication token
   * @param {Object} auth - Authentication payload { deviceId, deviceType }
   * @returns {Promise<void>}
   * @emits socket:connected - Connection established
   * @emits socket:error - Connection failed
   */
  async connect(token, auth) {
    // Cleanup old socket first (allows reconnection)
    if (this.socket?.connected) {
      console.warn('OrchestratorClient: Already connected, cleaning up old socket');
    }

    this._cleanup();

    this.socket = io(this.config.url, {
      transports: this.config.transports,
      reconnection: false, // ConnectionManager handles reconnection
      timeout: 10000,
      auth: {
        token: token,
        deviceId: auth.deviceId,
        deviceType: auth.deviceType,
        version: this.config.version
      }
    });

    this._setupSocketHandlers();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket.off('connect', onConnect);
        this.socket.off('connect_error', onError);
        reject(new Error('Connection timeout'));
      }, 10000);

      const onConnect = () => {
        clearTimeout(timeout);
        this.socket.off('connect_error', onError);
        this.isConnected = true;
        this.dispatchEvent(new CustomEvent('socket:connected'));
        resolve();
      };

      const onError = (error) => {
        clearTimeout(timeout);
        this.socket.off('connect', onConnect);
        this.dispatchEvent(new CustomEvent('socket:error', { detail: { error } }));
        reject(error);
      };

      this.socket.once('connect', onConnect);
      this.socket.once('connect_error', onError);
    });
  }

  /**
   * Send message to orchestrator with AsyncAPI envelope
   * @param {string} eventType - Event name (e.g., 'transaction:submit')
   * @param {Object} data - Event payload
   * @throws {Error} If socket not connected
   */
  send(eventType, data) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    this.socket.emit(eventType, {
      event: eventType,
      data: data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Disconnect from orchestrator
   * @returns {Promise<void>}
   * @emits socket:disconnected - Disconnection complete
   */
  async disconnect() {
    if (!this.socket) return;

    return new Promise((resolve) => {
      if (!this.socket.connected) {
        this._cleanup();
        resolve();
        return;
      }

      this.socket.once('disconnect', (reason) => {
        this.dispatchEvent(new CustomEvent('socket:disconnected', { detail: { reason } }));
        this._cleanup();
        resolve();
      });

      this.socket.disconnect();

      // Timeout fallback
      setTimeout(() => {
        this._cleanup();
        resolve();
      }, 1000);
    });
  }

  /**
   * Destroy client (cleanup without graceful disconnect)
   */
  destroy() {
    this._cleanup();
  }

  /**
   * Setup Socket.io event handlers
   * @private
   */
  _setupSocketHandlers() {
    if (!this.socket) return;

    // Connection lifecycle events
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.dispatchEvent(new CustomEvent('socket:connected'));
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      this.dispatchEvent(new CustomEvent('socket:disconnected', { detail: { reason } }));
    });

    this.socket.on('connect_error', (error) => {
      this.dispatchEvent(new CustomEvent('socket:error', { detail: { error } }));
    });

    // Forward all AsyncAPI message types
    this._setupMessageHandlers();
  }

  /**
   * Setup message forwarding for all AsyncAPI event types
   * @private
   */
  _setupMessageHandlers() {
    const messageTypes = [
      'sync:full',
      'transaction:result',
      'transaction:new',
      'score:updated',
      'video:status',
      'session:update',
      'device:connected',
      'device:disconnected',
      'group:completed',
      'gm:command:ack',
      'offline:queue:processed',
      'batch:ack',
      'error'
    ];

    messageTypes.forEach(type => {
      this.socket.on(type, (envelope) => {
        // Extract payload from AsyncAPI envelope
        const payload = envelope.data || envelope;

        // Forward as generic message:received event
        this.dispatchEvent(new CustomEvent('message:received', {
          detail: { type, payload }
        }));
      });
    });
  }

  /**
   * Cleanup socket and listeners
   * @private
   */
  _cleanup() {
    if (this.socket) {
      this.socket.removeAllListeners();
      if (this.socket.connected) {
        this.socket.disconnect();
      }
      this.socket = null;
    }
    this.isConnected = false;
  }
}

// Export for both browser and Node.js (Jest)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OrchestratorClient;
} else {
  window.OrchestratorClient = OrchestratorClient;
}
