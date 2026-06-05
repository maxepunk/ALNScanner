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

/**
 * Server→client event names this client forwards as `message:received`.
 * Exported so contract tests can cross-check against the AsyncAPI subscribe set.
 */
export const MESSAGE_TYPES = [
  'sync:full',
  'transaction:result',
  'transaction:new',
  'transaction:deleted',
  'score:adjusted',
  'scores:reset',
  'session:update',
  'session:overtime',
  'device:connected',
  'device:disconnected',
  'group:completed',
  'display:mode',
  'gm:command:ack',
  'offline:queue:processed',
  'batch:ack',
  'error',
  'player:scan',
  'scoreboard:page',
  'cue:fired',
  'cue:completed',
  'cue:error',
  'service:state', // Sole push mechanism for service domain state
];

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
    this._actionChains = {}; // WS-6: per-action in-flight chain (serialize same-action commands)
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
    // If a live socket exists, gracefully tear it down and WAIT for the server
    // to confirm the disconnect before re-handshaking with the same deviceId.
    // Opening a new socket inside the server's stale-socket teardown window
    // triggers a spurious DEVICE_ID_COLLISION (RL-5).
    if (this.socket?.connected) {
      console.warn('OrchestratorClient: live socket present, awaiting teardown before reconnect');
      await this.disconnect(); // resolves on server 'disconnect' (1s fallback), then _cleanup()
    } else {
      this._cleanup();
    }

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
        // WS-5: socket:connected is dispatched by the persistent on('connect')
        // handler (single source) — here we only set state + resolve the
        // connect() promise, so a future on-connect listener can't double-fire
        // during reconnect churn.
        this.isConnected = true;
        resolve();
      };

      const onError = (error) => {
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        // No need to manually remove 'once' listeners - they auto-remove after firing
        this.dispatchEvent(new CustomEvent('socket:error', {
          detail: { error, reason: this._parseErrorReason(error) }
        }));
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

    // WS-6 (interim): acks correlate only by action name, so two in-flight
    // commands with the SAME action (e.g. rapid session:addTeam during churn)
    // would cross-resolve on the first ack. Serialize same-action sends — a
    // second one waits for the prior to settle before registering its handler.
    // (Full per-command requestId correlation is a coordinated contract change,
    // deferred.)
    const prior = this._actionChains[action];
    // The FIRST command for an action sends immediately (handler registered
    // synchronously — no added latency). A same-action command that arrives
    // while one is in flight waits for the prior to settle before sending, so
    // by-action ack correlation can't cross-resolve.
    const run = prior
      ? prior.catch(() => {}).then(() => this._sendCommandOnce(action, payload, timeout))
      : this._sendCommandOnce(action, payload, timeout);
    // Keep the chain alive regardless of outcome; clear it when this is the tail.
    const chainRef = run.catch(() => {}).finally(() => {
      if (this._actionChains[action] === chainRef) this._actionChains[action] = null;
    });
    this._actionChains[action] = chainRef;
    return run;
  }

  _sendCommandOnce(action, payload, timeout) {
    return new Promise((resolve, reject) => {
      // A chained same-action command reaches here a microtask after the prior
      // one settled. The socket may have been torn down in the meantime (the
      // reconnect-churn scenario this serialization targets), so re-check the
      // guard sendCommand() applies to the first command — otherwise registering
      // the handler below throws a raw TypeError on a null socket.
      if (!this.socket?.connected) {
        reject(new Error('Socket not connected'));
        return;
      }

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Command ${action} timed out`));
      }, timeout);

      const handler = (envelope) => {
        if (envelope == null || envelope.data === undefined) {
          console.warn('OrchestratorClient: non-conforming gm:command:ack envelope');
        }
        const data = envelope?.data ?? envelope;
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
        // Optional-chain: the timeout can fire after _cleanup() nulled the socket.
        this.socket?.off('gm:command:ack', handler);
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

      let fallbackTimer;
      this.socket.once('disconnect', (reason) => {
        // Clear the fallback so it can't fire ~1s later and _cleanup() a socket
        // opened by a subsequent connect() (the RL-5 await-teardown race).
        clearTimeout(fallbackTimer);
        this.dispatchEvent(new CustomEvent('socket:disconnected', { detail: { reason } }));
        this._cleanup();
        resolve();
      });

      this.socket.disconnect();

      // Timeout fallback: clean up even if the server never confirms the disconnect.
      fallbackTimer = setTimeout(() => {
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
      this.dispatchEvent(new CustomEvent('socket:error', {
        detail: { error, reason: this._parseErrorReason(error) }
      }));
    });

    // Forward all AsyncAPI message types

    this._setupMessageHandlers();
  }

  /**
   * Setup message forwarding for all AsyncAPI event types
   * @private
   */
  _setupMessageHandlers() {
    MESSAGE_TYPES.forEach(type => {
      this.socket.on(type, (envelope) => {
        // Extract payload from AsyncAPI envelope. WS-7: keep the fallback as a
        // runtime safety net, but warn when it triggers so contract drift
        // surfaces as a clear log instead of confusing undefined-field behavior.
        if (envelope == null || envelope.data === undefined) {
          console.warn('OrchestratorClient: received non-conforming (un-enveloped) event', type);
        }
        const payload = envelope?.data ?? envelope;
        // Forward as generic message:received event
        this.dispatchEvent(new CustomEvent('message:received', {
          detail: { type, payload }
        }));
      });
    });
  }

  /**
   * Extract the backend reject reason prefix from a connect_error.
   * Backend rejects with messages like "AUTH_INVALID: ...", "DEVICE_ID_COLLISION: ...".
   * @param {Error} error
   * @returns {string|null} The CONSTANT_CASE prefix, or null if not present
   * @private
   */
  _parseErrorReason(error) {
    const msg = error?.message || '';
    const match = msg.match(/^([A-Z_]+):/);
    return match ? match[1] : null;
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
    // Drop in-flight same-action chains: they targeted the socket we just tore
    // down, so a post-reconnect command must send immediately rather than queue
    // behind a pre-reconnect command destined to time out (WS-6 reconnect churn).
    this._actionChains = {};
  }
}

// Default export for convenience
export default OrchestratorClient;
