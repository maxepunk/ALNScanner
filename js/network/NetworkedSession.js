/**
 * NetworkedSession - Service Factory and Lifecycle Orchestrator
 *
 * Responsibilities:
 * - Creates all networked services in correct order
 * - Wires event-driven coordination between services
 * - Manages complete session lifecycle (initialize, destroy)
 * - Single source of truth for service references
 *
 * Does NOT handle:
 * - WebSocket details (OrchestratorClient)
 * - Token validation (ConnectionManager)
 * - Retry logic (ConnectionManager)
 * - Admin UI operations (AdminController)
 */

class NetworkedSession extends EventTarget {
  constructor(config) {
    super();
    this.config = config; // { url, deviceId, stationName, token }
    this.services = null;
    this.state = 'disconnected'; // disconnected, connecting, connected, error
  }

  /**
   * Initialize session - creates services, wires events, initiates connection
   * @returns {Promise<void>}
   * @throws {Error} If initialization fails
   * @emits session:ready - All services initialized and connected
   * @emits session:error - Initialization failed
   */
  async initialize() {
    throw new Error('Not implemented');
  }

  /**
   * Get a service by name
   * @param {string} name - Service name (connectionManager, client, queueManager, adminController)
   * @returns {Object} Service instance
   * @throws {Error} If session not initialized
   */
  getService(name) {
    throw new Error('Not implemented');
  }

  /**
   * Destroy session - cleanup all services in reverse order
   * @returns {Promise<void>}
   */
  async destroy() {
    // Graceful cleanup - no error if not initialized
    if (!this.services) return;

    // TODO: Implement reverse-order service cleanup
    throw new Error('Not implemented');
  }

  /**
   * Create all services in correct order
   * @private
   */
  _createServices() {
    throw new Error('Not implemented');
  }

  /**
   * Wire event handlers between services
   * @private
   */
  _wireEventHandlers() {
    throw new Error('Not implemented');
  }

  /**
   * Initiate connection via ConnectionManager
   * @private
   */
  async _initiateConnection() {
    throw new Error('Not implemented');
  }
}

// Export for both browser and Node.js (Jest)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NetworkedSession;
} else {
  window.NetworkedSession = NetworkedSession;
}
