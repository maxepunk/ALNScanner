/**
 * NetworkedSession - Service Factory and Lifecycle Orchestrator
 * ES6 Module - Browser Only
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

import OrchestratorClient from './orchestratorClient.js';
import ConnectionManager from './connectionManager.js';
import NetworkedQueueManager from './networkedQueueManager.js';
import AdminController from '../app/adminController.js';

export class NetworkedSession extends EventTarget {
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
    if (this.services) {
      throw new Error('Session already initialized');
    }

    try {
      this._createServices();
      this._wireEventHandlers();
      await this._initiateConnection();

      this.state = 'connected';
      this.dispatchEvent(new CustomEvent('session:ready', {
        detail: { services: this.services },
      }));
    } catch (error) {
      this.state = 'error';

      // CRITICAL: Cleanup on initialization failure
      // Prevents event listener leaks and zombie services
      await this.destroy();

      this.dispatchEvent(new CustomEvent('session:error', {
        detail: { error },
      }));
      throw error;
    }
  }

  /**
   * Get a service by name
   * @param {string} name - Service name (connectionManager, client, queueManager, adminController)
   * @returns {Object} Service instance
   * @throws {Error} If session not initialized
   */
  getService(name) {
    if (!this.services) {
      throw new Error('Session not initialized');
    }

    if (!this.services[name]) {
      throw new Error(`Unknown service: ${name}`);
    }

    return this.services[name];
  }

  /**
   * Destroy session - cleanup all services in reverse order
   * @returns {Promise<void>}
   */
  async destroy() {
    // Graceful cleanup - no error if not initialized
    if (!this.services) return;

    // Destroy in reverse order (LIFO)
    if (this.services.adminController) {
      this.services.adminController.destroy();
    }

    if (this.services.queueManager) {
      this.services.queueManager.destroy();
    }

    if (this.services.connectionManager) {
      // Remove event listeners first
      if (this._connectedHandler) {
        this.services.connectionManager.removeEventListener('connected', this._connectedHandler);
      }
      if (this._disconnectedHandler) {
        this.services.connectionManager.removeEventListener('disconnected', this._disconnectedHandler);
      }
      if (this._authRequiredHandler) {
        this.services.connectionManager.removeEventListener('auth:required', this._authRequiredHandler);
      }

      await this.services.connectionManager.disconnect();
    }

    if (this.services.client) {
      this.services.client.destroy();
    }

    this.services = null;
    this.state = 'disconnected';
  }

  /**
   * Create all services in correct order
   * @private
   */
  _createServices() {
    // Create services in dependency order
    this.services = {};

    // 1. OrchestratorClient (no dependencies)
    this.services.client = new OrchestratorClient({
      url: this.config.url,
      deviceId: this.config.deviceId,
    });

    // 2. ConnectionManager (depends on client)
    this.services.connectionManager = new ConnectionManager({
      url: this.config.url,
      deviceId: this.config.deviceId,
      token: this.config.token,
      client: this.services.client,
    });

    // 3. NetworkedQueueManager (depends on client)
    this.services.queueManager = new NetworkedQueueManager(this.services.client);

    // 4. AdminController (depends on client)
    this.services.adminController = new AdminController(this.services.client);
  }

  /**
   * Wire event handlers between services
   * @private
   */
  _wireEventHandlers() {
    // Store handler references for cleanup
    this._connectedHandler = () => {
      // On connection: initialize admin and sync queue
      if (this.services.adminController) {
        this.services.adminController.initialize();
      }
      if (this.services.queueManager) {
        this.services.queueManager.syncQueue();
      }
    };

    this._disconnectedHandler = () => {
      // On disconnection: pause admin operations
      if (this.services.adminController) {
        this.services.adminController.pause();
      }
    };

    this._authRequiredHandler = () => {
      // Forward auth:required event to session listeners
      this.dispatchEvent(new CustomEvent('auth:required'));
    };

    // Wire events
    this.services.connectionManager.addEventListener('connected', this._connectedHandler);
    this.services.connectionManager.addEventListener('disconnected', this._disconnectedHandler);
    this.services.connectionManager.addEventListener('auth:required', this._authRequiredHandler);
  }

  /**
   * Initiate connection via ConnectionManager
   * @private
   */
  async _initiateConnection() {
    await this.services.connectionManager.connect();
  }
}

export default NetworkedSession;
