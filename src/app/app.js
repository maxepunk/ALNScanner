/**
 * App - Main Application Controller
 * ES6 Module
 *
 * Slim coordination shell — delegates domain logic to per-domain modules:
 *   Game Ops    → src/app/domains/gameOps.js    (scanning, team, scores, interventions)
 *   Show Control→ src/app/domains/showControl.js (video, display mode)
 *   Game Admin  → src/app/domains/gameAdmin.js   (session lifecycle, report, system reset)
 *   Environment → src/app/domains/environment.js (bluetooth, audio, lighting — controllers in admin/)
 *
 * Phase-2 structural split (capability-matrix §8 / decision C1).
 * Public API surface is UNCHANGED — all method names on App are preserved as
 * thin delegators so existing tests and domEventBindings continue to work.
 */

import Debug from '../utils/debug.js';
import { isTokenValid } from '../utils/jwtUtils.js';
import UIManager from '../ui/uiManager.js';
import Settings from '../ui/settings.js';
import TokenManager from '../core/tokenManager.js';
import NFCHandler from '../utils/nfcHandler.js';
import CONFIG from '../utils/config.js';
import InitializationSteps from './initializationSteps.js';
import { SessionModeManager } from './sessionModeManager.js'; // Import class, not singleton
import NetworkedSession from '../network/networkedSession.js';

// Domain modules
import { GameOpsDomain } from './domains/gameOps.js';
import { ShowControlDomain } from './domains/showControl.js';
import { GameAdminDomain } from './domains/gameAdmin.js';
import { EnvironmentDomain } from './domains/environment.js';

/**
 * Main Application Class
 * Coordinates all modules and handles user interaction
 *
 * Architecture: Dependency Injection + Event-Driven
 * - Dependencies injected via constructor for testability
 * - Session services received via session:ready event.detail
 * - No window.XXX global reaching (per Architecture Refactoring 2025-11)
 */
class App {
  constructor(dependencies = {}) {
    // Core dependencies (injected for testing, defaults for production)
    this.debug = dependencies.debug || Debug;
    this.uiManager = dependencies.uiManager || UIManager;
    this.settings = dependencies.settings || Settings;
    this.tokenManager = dependencies.tokenManager || TokenManager;
    this.dataManager = dependencies.dataManager; // Required: inject via main.js
    this.teamRegistry = dependencies.teamRegistry || null;
    this.stateStore = dependencies.stateStore || null;
    this.nfcHandler = dependencies.nfcHandler || NFCHandler;
    this.config = dependencies.config || CONFIG;
    this.initializationSteps = dependencies.initializationSteps || InitializationSteps;

    // Session dependencies (injected after mode selection)
    this.sessionModeManager = dependencies.sessionModeManager || null;
    this.networkedSession = dependencies.networkedSession || null;

    // Global reference for HTML onclick handlers (temporary until domEventBindings migration)
    this.showConnectionWizard = dependencies.showConnectionWizard || (typeof window !== 'undefined' ? window.showConnectionWizard : null);

    // Offline-queue indicator manager (injected by main.js). F-GMS-11: its
    // queue:changed listener must (re)attach whenever networked mode
    // initializes, not only on the startup auto-connect restore path.
    this.queueStatusManager = dependencies.queueStatusManager || null;

    // Instance state
    this.currentTeamId = '';
    this.nfcSupported = false;
    this.nfcReadErrorCount = 0; // consecutive readingerror count → escalate to Manual Entry (NFC-6)
    this._scanningActive = false; // true while NFC scanning is armed (on scan screen)
    this.currentInterventionTeamId = null; // For GM intervention features
    this.viewController = this._createViewController();

    // Domain objects (Phase-2 structural split, decision C1)
    // These receive `this` so they share all collaborators via the App handle.
    this._gameOps = new GameOpsDomain(this);
    this._showControl = new ShowControlDomain(this);
    this._gameAdmin = new GameAdminDomain(this);
    this._environment = new EnvironmentDomain(this);
  }

  /**
   * Initialize application
   * Runs 11-phase initialization sequence
   */
  async init() {
    this.debug.log('App initializing...');

    // Initialize UI (Phase 1D) - MUST be before showLoadingScreen
    this.initializationSteps.initializeUIManager(this.uiManager);

    // Show loading screen after UIManager initialized (Phase 0)
    await this.initializationSteps.showLoadingScreen(this.uiManager);

    // CRITICAL: Initialize SessionModeManager BEFORE viewController (Phase 1E)
    // Store reference as instance property (no window global assignment)
    this.sessionModeManager = this.initializationSteps.createSessionModeManager(SessionModeManager);

    // Inject sessionModeManager and app into UIManager
    // This allows UIManager to access session mode for rendering decisions
    this.uiManager.sessionModeManager = this.sessionModeManager;
    this.uiManager.app = this;

    // Initialize view controller (Phase 1F)
    this.initializationSteps.initializeViewController(this.viewController);

    // Load settings (Phase 1G)
    this.initializationSteps.loadSettings(this.settings);

    // Load transaction history (Phase 1H)
    this.initializationSteps.loadDataManager(this.dataManager, this.uiManager);

    // Check NFC support (Phase 1I)
    this.nfcSupported = await this.initializationSteps.detectNFCSupport(this.nfcHandler);

    // Load token database (Phase 1A)
    await this.initializationSteps.loadTokenDatabase(this.tokenManager, this.uiManager);

    // Apply URL parameter mode override (Phase 1B)
    this.initializationSteps.applyURLModeOverride(window.location.search, this.settings);

    // Register service worker for PWA functionality (Phase 1J)
    await this.initializationSteps.registerServiceWorker(navigator, this.uiManager);

    // Connection restoration logic with full state validation (Phase 1C)
    // Use validateAndDetermineInitialScreen for networked mode validation:
    // - Validates JWT token expiration
    // - Validates orchestrator reachability
    // - Validates session exists
    // If any validation fails, clears stale state and shows mode selection
    const screenDecision = await this.initializationSteps.validateAndDetermineInitialScreen(this.sessionModeManager);

    // Log validation result if present
    if (screenDecision.validationResult) {
      if (screenDecision.validationResult.valid) {
        this.debug.log('[App] State validation passed - proceeding with auto-connect');
      } else {
        this.debug.log(`[App] State validation failed: ${screenDecision.validationResult.reason}`);
      }
    }

    await this.initializationSteps.applyInitialScreenDecision(
      screenDecision,
      this.sessionModeManager,
      this.uiManager,
      this.showConnectionWizard,
      this._initializeNetworkedMode.bind(this),
      this._initializeStandaloneMode.bind(this)
    );
  }

  /**
   * Wire event listeners for NetworkedSession lifecycle
   * Event-driven architecture: Services provided via event.detail
   * @private
   */
  _wireNetworkedSessionEvents() {
    if (!this.networkedSession) {
      this.debug.log('Cannot wire networked session events: session is null');
      return;
    }

    this.networkedSession.addEventListener('session:ready', () => {
      this.debug.log('NetworkedSession ready - initializing admin modules');
      if (this.viewController) {
        this.viewController.initAdminModules();
      }
    });

    // Listen for auth:required from NetworkedSession
    this.networkedSession.addEventListener('auth:required', () => {
      this.debug.log('Authentication required - showing connection wizard');
      if (this.showConnectionWizard) {
        this.showConnectionWizard();
      }
    });

    // F-GMS-10 / AsyncAPI Decision #10: backend error events MUST be displayed.
    // networkedSession dispatches backend:error UNCONDITIONALLY for every backend
    // 'error' broadcast (auth codes additionally trigger auth:required) — surface
    // generic service errors (QUEUE_FULL, VALIDATION_ERROR, session/video/offline
    // failures) that previously vanished.
    this.networkedSession.addEventListener('backend:error', (event) => {
      const { code, message } = event.detail || {};
      const label = code ? `${code}: ` : '';
      this.uiManager.showError(`Server error — ${label}${message || 'unknown error'}`);
    });

    this.networkedSession.addEventListener('group:completed', (event) => {
      const { teamId, bonusPoints } = event.detail || {};
      const formattedBonus = bonusPoints ? ` +$${bonusPoints.toLocaleString()}` : '';
      this.uiManager.showToast(`Group completed by ${teamId || 'team'}${formattedBonus}`);
    });

    // scoreboard:page echo — the GM scanner SENT this navigation command; the
    // backend rebroadcasts it to the gm room (consumed by the wall scoreboards).
    // The GM scanner has no embedded scoreboard view, so surface a transient
    // confirmation that the displays acted on the command. Parity-free: we
    // reflect the owner / direction, never a page index.
    this.networkedSession.addEventListener('scoreboard:page', (event) => {
      const { action, owner } = event.detail || {};
      let label;
      if (action === 'owner') label = `Displays → ${owner || 'character'}`;
      else if (action === 'next') label = 'Displays → next page';
      else if (action === 'prev') label = 'Displays → prev page';
      else label = 'Displays updated';
      this.uiManager.showToast(label);
    });

    // P3.4: a PERMANENT transaction rejection (backend status 'rejected', e.g.
    // invalid token) surfaces to the operator AND unmarks the token so the GM can
    // re-scan after correcting the cause (fixes the token-locked + no-feedback
    // lost-scan-equivalent). Duplicates are NOT unmarked (genuinely claimed) but
    // ARE surfaced (A7/F-GMS-05/F-SCAN-07): the backend's claimed-by verdict must
    // correct the optimistic "Transaction Complete!" screen, not vanish.
    this.networkedSession.addEventListener('transaction:failed', (event) => {
      const { transaction, status, message } = event.detail || {};
      const tokenId = transaction?.tokenId;
      if (status === 'duplicate') {
        const claimMessage = message || 'Token already claimed';
        this.uiManager.showError(`${claimMessage}${tokenId ? ` (${tokenId})` : ''} — no points awarded`);
        // If the optimistic result screen is still up for this scan, repaint it
        // as a duplicate. If the GM has moved on (e.g. scanning the next token),
        // the toast alone informs — don't yank them back.
        const resultScreen = document.getElementById('resultScreen');
        if (resultScreen?.classList.contains('active')) {
          this.showDuplicateError(tokenId || '', claimMessage);
        }
        return;
      }
      this.uiManager.showError(`Scan rejected${tokenId ? ` (${tokenId})` : ''}: ${message || status || 'failed'}`);
      if (tokenId) {
        this.dataManager.unmarkTokenAsScanned(tokenId);
      }
    });
  }

  /**
   * Create view controller
   * Manages scanner/admin/debug view switching in networked mode
   * @private
   */
  _createViewController() {
    const app = this;

    return {
      currentView: 'scanner',
      views: ['scanner', 'admin', 'debug'],
      adminInstances: null,

      init() {
        // Show view selector tabs in BOTH networked and standalone modes
        // Admin panel is now available in standalone mode
        const viewSelector = document.getElementById('viewSelector');
        if (viewSelector) {
          viewSelector.style.display = 'flex';
        }

        // Admin modules (WebSocket-based) only initialized in networked mode
        // Standalone admin operations use dataManager directly
      },

      switchView(viewName) {
        if (!this.views.includes(viewName)) {
          console.error('Invalid view:', viewName);
          app.uiManager.showError(`Invalid view: ${viewName}`);
          return;
        }

        // Hide all view contents
        document.querySelectorAll('.view-content').forEach(view => {
          view.style.display = 'none';
        });

        // Show selected view
        const selectedView = document.getElementById(`${viewName}-view`);
        if (selectedView) {
          selectedView.style.display = 'block';
        }

        // Update tab highlighting
        document.querySelectorAll('.view-tab').forEach(tab => {
          tab.classList.remove('active');
        });
        const activeTab = document.querySelector(`[data-view="${viewName}"]`);
        if (activeTab) {
          activeTab.classList.add('active');
        }

        this.currentView = viewName;

        // Trigger view-specific initialization
        if (viewName === 'admin') {
          if (!this.adminInstances) {
            this.initAdminModules();
          }
          app.updateAdminPanel();
        }
      },

      initAdminModules() {
        // Only initialize in networked mode with valid connection
        if (!app.sessionModeManager?.isNetworked()) {
          console.log('Admin modules only available in networked mode');
          return;
        }

        if (!app.networkedSession) {
          console.error('NetworkedSession not initialized');
          app.uiManager.showError('Network session not available. Check connection.');
          return;
        }

        // Get admin modules from NetworkedSession's AdminController
        const adminController = app.networkedSession.getService('adminController');

        // Initialize admin modules if not already initialized
        // This is safe to call multiple times (AdminController has guard)
        if (!adminController.initialized) {
          console.log('Initializing admin modules...');
          adminController.initialize();
        }

        // Reference admin modules (created by AdminController)
        this.adminInstances = {
          sessionManager: adminController.getModule('sessionManager'),
          videoController: adminController.getModule('videoController'),
          displayController: adminController.getModule('displayController'),
          adminOps: adminController.getModule('adminOperations'),
          monitoring: adminController.getModule('monitoringDisplay')
        };

        // Note: MonitoringDisplay automatically registers event listeners
        // for all monitoring display updates (session, video, system, scores, transactions)
        // No need to manually register event listeners here

        console.log('Admin modules referenced from AdminController');
      }
    };
  }

  // ========== Settings Management (Game Ops) ==========

  toggleMode() { return this._gameOps.toggleMode(); }

  // ========== Team Entry (Game Ops) ==========

  /** Initialize team entry UI. Delegated to GameOpsDomain. */
  initTeamEntryUI() { return this._gameOps.initTeamEntryUI(); }

  /** @private — called by GameOpsDomain and click handlers */
  _renderTeamList(container) { return this._gameOps._renderTeamList(container); }

  /** Confirm team selection and proceed to scan screen. */
  async confirmTeamId() { return this._gameOps.confirmTeamId(); }

  // ========== Game Mode Selection ==========

  /**
   * Select game mode (networked or standalone)
   * Per Architecture Refactoring 2025-11: App creates NetworkedSession
   *
   * @param {string} mode - 'networked' or 'standalone'
   */
  async selectGameMode(mode) {
    if (!this.sessionModeManager) {
      console.error('SessionModeManager not initialized');
      this.uiManager.showError('System error: SessionModeManager not initialized. Please reload the page.');
      return;
    }

    try {
      // For networked mode: Check auth token first before locking mode
      if (mode === 'networked') {
        const token = localStorage.getItem('aln_auth_token');

        if (!token || !this._isTokenValid(token)) {
          // No valid token - show connection wizard WITHOUT locking mode yet
          // The wizard's handleConnectionSubmit will lock mode after successful auth
          this.debug.log('Networked mode selected - showing connection wizard (mode not locked yet)');
          if (this.showConnectionWizard) {
            this.showConnectionWizard();
          } else {
            this.uiManager.showError('Connection wizard not available');
          }
          return;
        }

        // Valid token exists - lock mode and initialize
        this.sessionModeManager.setMode(mode);
        this.debug.log(`Game mode locked: ${mode}`);
        await this._initializeNetworkedMode();
      } else if (mode === 'standalone') {
        // Standalone mode: lock immediately and proceed (fresh selection —
        // phantom data from previous sessions is cleared)
        await this._initializeStandaloneMode({ preserveSession: false });
      }
    } catch (error) {
      console.error('Failed to set game mode:', error);
      this.uiManager.showError(`Failed to set game mode: ${error.message}`);

      // Re-throw so caller (ConnectionWizard) can display error in modal
      throw error;
    }
  }

  /**
   * Initialize standalone mode — shared by fresh selection (selectGameMode)
   * AND restore-after-reload (applyInitialScreenDecision 'initStandalone').
   *
   * F-GMS-01 / C7: a mid-show reload of a standalone station must do
   * EVERYTHING fresh selection does (storage strategy, registry wiring,
   * body class), otherwise scanning is bricked: addTransaction throws
   * 'No active strategy', teamRegistry falls into the networked branch,
   * and networked-only admin sections are un-hidden.
   *
   * @param {Object} [options]
   * @param {boolean} [options.preserveSession=false] - true on restore
   *   (keep the persisted standalone session); false on fresh selection
   *   (clear phantom data from previous sessions)
   * @private
   */
  async _initializeStandaloneMode({ preserveSession = false } = {}) {
    // Lock mode
    this.sessionModeManager.setMode('standalone');
    this.debug.log(`Game mode locked: standalone${preserveSession ? ' (restored)' : ''}`);

    // Add body class for CSS-based feature hiding
    document.body.classList.add('standalone-mode');
    document.body.classList.remove('networked-mode');

    // Clear phantom data from previous sessions (fresh selection only —
    // a reload restore must keep the persisted session)
    if (!preserveSession) {
      localStorage.removeItem('standaloneSession');
    }

    // Initialize UnifiedDataManager for standalone mode
    // This creates LocalStorage strategy and loads from localStorage if available
    this.dataManager.sessionModeManager = this.sessionModeManager;
    await this.dataManager.initializeStandaloneMode();

    this.debug.log('UnifiedDataManager initialized for standalone mode');

    // Initialize view controller (shows admin tabs in standalone mode too)
    this.viewController.init();

    // Initialize admin session display in standalone mode
    const sessionContainer = document.getElementById('session-status-container');
    if (sessionContainer) {
      this.uiManager.renderSessionStatus(sessionContainer);
    }

    // Wire TeamRegistry for unified API (standalone)
    if (this.teamRegistry) {
      this.teamRegistry.sessionModeManager = this.sessionModeManager;
    }

    // Initialize team entry UI
    this.initTeamEntryUI();

    this.uiManager.showScreen('teamEntry');
  }

  /**
   * Initialize networked mode by creating NetworkedSession
   * @private
   */
  async _initializeNetworkedMode() {
    // Add body class for CSS-based feature display
    document.body.classList.add('networked-mode');
    document.body.classList.remove('standalone-mode');

    // Get configuration from localStorage (set by connection wizard)
    const orchestratorUrl = localStorage.getItem('aln_orchestrator_url') || 'https://localhost:3000';
    const deviceId = this.settings?.deviceId || 'GM_STATION_UNKNOWN';
    const token = localStorage.getItem('aln_auth_token');

    // Check if we have a valid token
    if (token && this._isTokenValid(token)) {
      this.debug.log('Valid token found - creating NetworkedSession...');

      // Show reconnecting toast
      this.uiManager.showToast('Reconnecting to orchestrator...', 'info', 3000);

      // Create NetworkedSession (Service Orchestrator)
      this.networkedSession = new NetworkedSession({
        url: orchestratorUrl,
        deviceId: deviceId,
        stationName: this.settings?.stationName || 'GM Station',
        token: token
      }, this.dataManager, this.teamRegistry, this.stateStore);

      // Attempt connection
      try {
        // Wire event listeners BEFORE initializing (so we catch session:ready)
        this._wireNetworkedSessionEvents();

        // CRITICAL: Initialize UnifiedDataManager BEFORE WebSocket connects
        // NetworkedSession._messageHandler calls dataManager methods on sync:full
        // If _networkedStrategy doesn't exist, score updates are silently dropped
        this.dataManager.sessionModeManager = this.sessionModeManager;
        await this.dataManager.initializeNetworkedMode(null); // Socket added after connect
        this.debug.log('UnifiedDataManager initialized for networked mode (socket pending)');

        await this.networkedSession.initialize();
        this.debug.log('NetworkedSession initialized - session:ready will fire');

        // Update NetworkedStorage with the actual socket reference
        const client = this.networkedSession.getService('client');
        if (client?.socket && this.dataManager._networkedStrategy) {
          this.dataManager._networkedStrategy.socket = client.socket;
          this.debug.log('NetworkedStorage socket reference updated');
        }

        // Wire TeamRegistry for unified API (networked)
        if (this.teamRegistry) {
          this.teamRegistry.sessionModeManager = this.sessionModeManager;
          if (client) {
            this.teamRegistry.orchestratorClient = client;
          }
        }

        // Attach the offline-queue indicator to this session's queueManager
        // (F-GMS-11: fresh-launch flow — queueStatusManager.init() at startup
        // ran before any networkedSession existed)
        this.queueStatusManager?.attach();

        // Close connection wizard modal (if open) and show team entry screen
        // Per Architecture Refactoring 2025-11: App manages UI transitions after NetworkedSession ready
        const connectionModal = document.getElementById('connectionModal');
        if (connectionModal && connectionModal.style.display !== 'none') {
          connectionModal.style.display = 'none';
          this.debug.log('Connection wizard closed after successful initialization');
        }

        // Show viewSelector (admin panel tabs) in networked mode
        const viewSelector = document.getElementById('viewSelector');
        if (viewSelector) {
          viewSelector.style.display = 'flex';
        }

        // Transition to team entry screen
        this.uiManager.showScreen('teamEntry');
        this.debug.log('UI transitioned to team entry screen');

      } catch (error) {
        console.error('NetworkedSession initialization failed:', error);
        // Clean up failed session
        if (this.networkedSession) {
          await this.networkedSession.destroy();
          this.networkedSession = null;
        }
        throw error;
      }
    } else {
      // No valid token - show connection wizard
      this.debug.log('No valid token - showing connection wizard');
      if (this.showConnectionWizard) {
        this.showConnectionWizard();
      } else {
        this.uiManager.showError('Connection wizard not available');
      }
    }
  }

  /**
   * Check if JWT token is valid (not expired, with 1-minute buffer)
   * @private
   */
  _isTokenValid(token) {
    return isTokenValid(token);
  }

  // ========== Helper Methods ==========

  /**
   * Helper to switch to a specific view
   */
  switchView(viewName) {
    this.viewController.switchView(viewName);
  }

  // ========== Scanning (Game Ops) ==========

  /** @deprecated Use _startNFCScanning() instead. */
  async startScan() {
    console.warn('startScan() is deprecated - NFC now auto-starts on team confirmation');
    await this._startNFCScanning();
  }

  /** @private — delegates to GameOpsDomain */
  _recordNfcReadFailure(transientMessage) { return this._gameOps._recordNfcReadFailure(transientMessage); }

  /** @private — delegates to GameOpsDomain */
  async _startNFCScanning() { return this._gameOps._startNFCScanning(); }

  /** Abort the live NFC scan when the page is backgrounded (NFC-3). */
  pauseNFCForBackground() { return this._gameOps.pauseNFCForBackground(); }

  /** Re-arm NFC when the page returns to the foreground, iff it was active (NFC-3). */
  async resumeNFCForForeground() { return this._gameOps.resumeNFCForForeground(); }

  simulateScan() { return this._gameOps.simulateScan(); }

  async processNFCRead(result) { return this._gameOps.processNFCRead(result); }

  /**
   * Paint the result screen as a duplicate.
   * @param {string} tokenId
   * @param {string} [message]
   */
  showDuplicateError(tokenId, message = 'This token has been used') {
    return this._gameOps.showDuplicateError(tokenId, message);
  }

  async recordTransaction(token, tokenId, isUnknown) {
    return this._gameOps.recordTransaction(token, tokenId, isUnknown);
  }

  manualEntry() { return this._gameOps.manualEntry(); }
  cancelScan() { return this._gameOps.cancelScan(); }
  continueScan() { return this._gameOps.continueScan(); }
  finishTeam() { return this._gameOps.finishTeam(); }

  // ========== History / Scoreboard / Team Details (Game Ops) ==========

  showHistory() { return this._gameOps.showHistory(); }
  closeHistory() { return this._gameOps.closeHistory(); }
  showScoreboard() { return this._gameOps.showScoreboard(); }
  closeScoreboard() { return this._gameOps.closeScoreboard(); }
  showTeamDetails(teamId) { return this._gameOps.showTeamDetails(teamId); }
  closeTeamDetails() { return this._gameOps.closeTeamDetails(); }

  // ========== Admin Actions (Game Admin) ==========

  async adminCreateSession() { return this._gameAdmin.adminCreateSession(); }
  async adminPauseSession() { return this._gameAdmin.adminPauseSession(); }
  async adminResumeSession() { return this._gameAdmin.adminResumeSession(); }
  async adminEndSession() { return this._gameAdmin.adminEndSession(); }
  async downloadSessionReport() { return this._gameAdmin.downloadSessionReport(); }
  async adminResetAndCreateNew() { return this._gameAdmin.adminResetAndCreateNew(); }
  async adminViewSessionDetails() { return this._gameAdmin.adminViewSessionDetails(); }

  /** Format duration in ms — delegates to GameAdminDomain. */
  formatSessionDuration(ms) { return this._gameAdmin.formatSessionDuration(ms); }

  /** @private */
  _refreshAdminSessionDisplay() { return this._gameAdmin._refreshAdminSessionDisplay(); }

  // ========== Show Control (video + display mode) ==========

  async _adminVideoAction(action) { return this._showControl._adminVideoAction(action); }
  async adminPlayVideo() { return this._showControl.adminPlayVideo(); }
  async adminPauseVideo() { return this._showControl.adminPauseVideo(); }
  async adminStopVideo() { return this._showControl.adminStopVideo(); }
  async adminSkipVideo() { return this._showControl.adminSkipVideo(); }
  async adminAddVideoToQueue() { return this._showControl.adminAddVideoToQueue(); }
  async adminClearQueue() { return this._showControl.adminClearQueue(); }
  async _adminDisplayAction(action, label) { return this._showControl._adminDisplayAction(action, label); }
  async adminSetIdleLoop() { return this._showControl.adminSetIdleLoop(); }
  async adminSetScoreboard() { return this._showControl.adminSetScoreboard(); }
  async adminReturnToVideo() { return this._showControl.adminReturnToVideo(); }

  // ========== Admin Panel Display / Score Interventions (Game Ops) ==========

  updateAdminPanel() { return this._gameOps.updateAdminPanel(); }
  async adminResetScores() { return this._gameOps.adminResetScores(); }
  viewFullScoreboard() { return this._gameOps.viewFullScoreboard(); }
  viewFullHistory() { return this._gameOps.viewFullHistory(); }

  // ========== GM Intervention (Game Ops) ==========

  async adjustTeamScore() { return this._gameOps.adjustTeamScore(); }
  async deleteTeamTransaction(transactionId) { return this._gameOps.deleteTeamTransaction(transactionId); }
}

// Create singleton instance
const appInstance = new App();

// Export both class and instance
export default appInstance;
export { App, appInstance };
