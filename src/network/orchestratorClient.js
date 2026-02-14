/**
 * OrchestratorClient - WebSocket Communication Layer
 * ES6 Module - Browser Only
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
 */

export class OrchestratorClient extends EventTarget {
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
    this.connectionTimeout = null; // Track timeout for cleanup
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
      const onConnect = () => {
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        // No need to manually remove 'once' listeners - they auto-remove after firing
        this.isConnected = true;
        this.dispatchEvent(new CustomEvent('socket:connected'));
        resolve();
      };

      const onError = (error) => {
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        // No need to manually remove 'once' listeners - they auto-remove after firing
        this.dispatchEvent(new CustomEvent('socket:error', { detail: { error } }));
        reject(error);
      };

      // Setup timeout handler
      this.connectionTimeout = setTimeout(() => {
        // Guard against socket being null (e.g., if destroy() called during connection)
        if (this.socket) {
          this.socket.off('connect', onConnect);
          this.socket.off('connect_error', onError);
        }
        this.connectionTimeout = null;
        reject(new Error('Connection timeout'));
      }, 10000);

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
   * Send gm:command and wait for acknowledgment
   * Follows AsyncAPI contract for admin commands
   *
   * @param {string} action - Command action (e.g., 'session:addTeam')
   * @param {Object} payload - Command payload
   * @param {number} timeout - Timeout in ms (default 5000)
   * @returns {Promise<{success: boolean, message: string}>}
   * @throws {Error} If socket not connected or command times out
   */
  async sendCommand(action, payload = {}, timeout = 5000) {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Command ${action} timed out`));
      }, timeout);

      const handler = (envelope) => {
        const data = envelope.data || envelope;
        if (data.action === action) {
          cleanup();
          resolve({
            success: data.success,
            message: data.message || ''
          });
        }
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        this.socket.off('gm:command:ack', handler);
      };

      this.socket.on('gm:command:ack', handler);

      // Send with proper gm:command envelope (NOT raw action name)
      this.socket.emit('gm:command', {
        event: 'gm:command',
        data: { action, payload },
        timestamp: new Date().toISOString()
      });
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
      'transaction:deleted',
      'score:updated',
      'scores:reset',
      'video:status',
      'session:update',
      'session:overtime',
      'device:connected',
      'device:disconnected',
      'group:completed',
      'display:mode',  // Phase 4.2: Display control events
      'video:progress',      // Video playback progress (1s interval)
      'video:queue:update',  // Video queue changes
      'gm:command:ack',
      'offline:queue:processed',
      'batch:ack',
      'error',
      'player:scan',  // Phase 3: Unified Game Activity - player scan broadcasts
      'bluetooth:device',        // Phase 0: Environment Control - BT device state changes
      'bluetooth:scan',          // Phase 0: Environment Control - BT scan start/stop
      'audio:routing',           // Phase 0: Environment Control - audio route changes
      'audio:routing:fallback',  // Phase 0: Environment Control - audio HDMI fallback
      'lighting:scene',          // Phase 0: Environment Control - scene activated
      'lighting:status',         // Phase 0: Environment Control - HA connection/scene refresh
      'gameclock:status',        // Phase 1: Game clock state (running/paused/stopped)
      'cue:fired',               // Phase 1: Cue triggered
      'cue:status',              // Phase 2: Compound cue progress
      'cue:completed',           // Phase 1: Cue action sequence completed
      'cue:error',               // Phase 1: Cue action failed
      'cue:conflict',            // Phase 2: Compound cue video conflict detection
      'sound:status',            // Phase 1: Sound playback status
      'spotify:status'           // Phase 2: Spotify playback status
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
    // Clear connection timeout if still pending
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

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

// Default export for convenience
export default OrchestratorClient;
