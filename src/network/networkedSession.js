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
import { gameOpsRouter, sharedInfraRouter, gameAdminRouter, showControlRouter } from './messageRouters.js';

export class NetworkedSession extends EventTarget {
  constructor(config, dataManager, teamRegistry = null, store = null) {
    super();
    this.config = config; // { url, deviceId, stationName, token }
    this.dataManager = dataManager; // DataManager reference for AdminController
    this.teamRegistry = teamRegistry; // TeamRegistry for team dropdown sync
    this._store = store; // StateStore for service domain state (null in Standalone)
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
      if (this._txFailedHandler) {
        this.services.queueManager.removeEventListener('transaction:failed', this._txFailedHandler);
      }
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
      // Remove message handler first
      if (this._messageHandler) {
        this.services.client.removeEventListener('message:received', this._messageHandler);
      }
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
    this.services.queueManager = new NetworkedQueueManager({
      client: this.services.client,
      deviceId: this.config.deviceId,
      debug: console
    });

    // 4. AdminController (depends on client, dataManager, teamRegistry, and store)
    this.services.adminController = new AdminController(this.services.client, this.dataManager, this.teamRegistry, this._store);
  }

  /**
   * Wire event handlers between services
   * @private
   */
  _wireEventHandlers() {
    // Store handler references for cleanup
    this._connectedHandler = () => {
      // On connection: initialize admin only. Queue sync is DEFERRED to the
      // sync:full handler so server state (deviceScannedTokens) is populated
      // first and replays can be reconciled against already-recorded scans (TQ-6).
      if (this.services.adminController) {
        this.services.adminController.initialize();
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

    // P3.4: forward queueManager transaction:failed (a permanent rejection) onto
    // the session so the app has ONE event source (the session) — mirrors how
    // group:completed/backend:error are surfaced. App unmarks the token + toasts.
    this._txFailedHandler = (e) => {
      this.dispatchEvent(new CustomEvent('transaction:failed', { detail: e.detail }));
    };

    // Global WebSocket → DataManager/StateStore event handler.
    // Routes messages to per-domain routers (Phase-2 structural split).
    // Evaluation order: Game Ops first (most frequent), then Shared Infra
    // (sync:full/error/service:state), then Game Admin (session lifecycle).
    // Show Control router is a placeholder (display:mode consumed by
    // MonitoringDisplay._handleMessage directly — no session-level routing needed).
    this._messageHandler = (event) => {
      const { type, payload } = event.detail;

      const sessionRef = this; // for dispatchEvent inside routers
      const boundaryFn = this._handleSessionBoundary.bind(this);
      const services = this.services;
      const store = this._store;
      const dm = this.dataManager;

      // Try each domain router in turn. A router may return true without being
      // the only handler — sync:full intentionally touches multiple domains
      // (sharedInfraRouter handles it entirely; it calls updateSessionState
      // which is the Game Admin concern embedded there for DRY reasons).
      if (
        gameOpsRouter(type, payload, dm, sessionRef) ||
        sharedInfraRouter(type, payload, dm, sessionRef, store, services, boundaryFn) ||
        gameAdminRouter(type, payload, dm, boundaryFn) ||
        showControlRouter(type, payload)
      ) {
        // Message was handled by one (or more) domain routers.
        return;
      }
    };

    // Wire events
    this.services.connectionManager.addEventListener('connected', this._connectedHandler);
    this.services.connectionManager.addEventListener('disconnected', this._disconnectedHandler);
    this.services.connectionManager.addEventListener('auth:required', this._authRequiredHandler);
    this.services.client.addEventListener('message:received', this._messageHandler);
    this.services.queueManager.addEventListener('transaction:failed', this._txFailedHandler);
  }

  /**
   * Handle session boundary detection (DRY helper)
   * Resets DataManager only when session ID actually changes
   * @param {string|null} newSessionId - New session ID from server
   * @private
   */
  _handleSessionBoundary(newSessionId) {
    const currentSessionId = this.dataManager.currentSessionId;

    // Only reset when session ID actually changes (new session started)
    if (newSessionId && newSessionId !== currentSessionId) {
      this.dataManager.resetForNewSession(newSessionId);
      // A genuine NEW session means any offline-queued scans belong to a DEAD
      // session — discard them so syncQueue doesn't replay them into the new
      // session (the backend would score them, since the tokens aren't yet
      // scanned there → phantom transactions / score inflation). A transient
      // orchestrator restart restores the SAME id (no boundary), so same-session
      // offline scans are preserved and still flush. Review fix (cross-session).
      this.services?.queueManager?.clearQueue();
    }
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
