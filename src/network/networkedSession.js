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

    // Global WebSocket → DataManager/StateStore event handler
    // Routes session/transaction data to DataManager, service state to StateStore
    this._messageHandler = (event) => {
      const { type, payload } = event.detail;

      switch (type) {
        case 'score:adjusted':
          // Admin score adjustments — payload wraps score in .teamScore
          if (payload.teamScore) {
            this.dataManager.updateTeamScoreFromBackend(payload.teamScore);
          }
          break;

        case 'sync:full':
          // Session boundary detection (DRY: same logic as session:update)
          this._handleSessionBoundary(payload.session?.id);

          // Restore scanned tokens from server state (handles reconnection)
          if (payload.deviceScannedTokens) {
            this.dataManager.setScannedTokensFromServer(payload.deviceScannedTokens);
          }

          // Sync scores and transactions
          if (payload.scores) {
            payload.scores.forEach(s => this.dataManager.updateTeamScoreFromBackend(s));
          }
          if (payload.recentTransactions) {
            // Bulk restore — does NOT re-submit to backend (addTransaction would re-submit)
            if (typeof this.dataManager.setTransactions === 'function') {
              this.dataManager.setTransactions(payload.recentTransactions);
            } else {
              // Fallback: add individually without re-submission
              payload.recentTransactions.forEach(tx => {
                this.dataManager.addTransactionFromBroadcast(tx);
              });
            }
          }

          // Sync player scans from server (Game Activity feature)
          if (payload.playerScans) {
            this.dataManager.setPlayerScansFromServer(payload.playerScans);
          }

          // Update Session State
          // Only update if session field is explicitly present in payload.
          // A missing session field (e.g. from a partial sync:full after score reset)
          // should NOT null out an active session — that's a different semantic than
          // an explicit session: null (server restart with no active session).
          if (payload.session) {
            this.dataManager.updateSessionState(payload.session);
          } else if ('session' in payload && payload.session === null) {
            this.dataManager.updateSessionState(null);
          }

          // Populate StateStore from sync:full (service domain state)
          if (this._store) {
            if (payload.spotify) this._store.update('spotify', payload.spotify);
            if (payload.serviceHealth) this._store.update('health', payload.serviceHealth);
            if (payload.environment?.bluetooth) this._store.update('bluetooth', payload.environment.bluetooth);
            if (payload.environment?.audio) this._store.update('audio', payload.environment.audio);
            if (payload.environment?.lighting) this._store.update('lighting', payload.environment.lighting);
            if (payload.gameClock) this._store.update('gameclock', payload.gameClock);
            if (payload.cueEngine) this._store.update('cueengine', payload.cueEngine);
            if (payload.heldItems) this._store.update('held', { items: payload.heldItems });
            if (payload.videoStatus) this._store.update('video', payload.videoStatus);
            if (payload.sound) this._store.update('sound', payload.sound);
          }

          // Restore display mode on reconnect (not a StateStore domain — routes to MonitoringDisplay)
          if (payload.displayStatus && this.services?.client) {
            this.services.client.dispatchEvent(new CustomEvent('message:received', {
              detail: { type: 'display:mode', payload: { mode: payload.displayStatus.currentMode } }
            }));
          }
          break;

        case 'session:update':
          // Session lifecycle: detect boundary changes
          // NOTE: Do NOT reset on session end — data must survive for report download.
          // Reset only happens when a NEW session ID arrives (handled by _handleSessionBoundary).
          if (payload.status !== 'ended') {
            this._handleSessionBoundary(payload.id);
          }
          // Update session state for UI (SessionRenderer)
          this.dataManager.updateSessionState(payload);
          break;

        case 'transaction:new':
          if (payload.transaction) {
            this.dataManager.addTransactionFromBroadcast(payload.transaction);
          }
          // Live score update from transaction
          if (payload.teamScore) {
            this.dataManager.updateTeamScoreFromBackend(payload.teamScore);
          }
          break;

        case 'transaction:deleted':
          if (payload.transactionId) {
            this.dataManager.removeTransaction(payload.transactionId);
          }
          // Update score after deletion (score changed by removing transaction)
          if (payload.updatedTeamScore) {
            this.dataManager.updateTeamScoreFromBackend(payload.updatedTeamScore);
          }
          break;

        case 'scores:reset':
          this.dataManager.clearBackendScores();
          break;

        case 'player:scan':
          this.dataManager.handlePlayerScan(payload);
          break;

        case 'group:completed':
          this.dispatchEvent(new CustomEvent('group:completed', {
            detail: payload
          }));
          break;

        // Unified service:state → StateStore
        // All service domain state (video, cue, spotify, audio, bluetooth,
        // lighting, health, held, gameclock) arrives via this single event
        case 'service:state':
          if (this._store && payload.domain && payload.state) {
            this._store.update(payload.domain, payload.state);
          }
          break;
      }
    };

    // Wire events
    this.services.connectionManager.addEventListener('connected', this._connectedHandler);
    this.services.connectionManager.addEventListener('disconnected', this._disconnectedHandler);
    this.services.connectionManager.addEventListener('auth:required', this._authRequiredHandler);
    this.services.client.addEventListener('message:received', this._messageHandler);
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
