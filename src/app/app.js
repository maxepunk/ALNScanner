/**
 * App - Main Application Controller
 * ES6 Module
 *
 * Main application coordinator that handles:
 * - NFC processing pipeline
 * - Mode-specific initialization (networked vs standalone)
 * - Admin panel integration
 * - Event wiring between all modules
 * - Team management and transaction processing
 */

import Debug from '../utils/debug.js';
import UIManager from '../ui/uiManager.js';
import Settings from '../ui/settings.js';
import TokenManager from '../core/tokenManager.js';
import DataManager from '../core/dataManager.js';
import NFCHandler from '../utils/nfcHandler.js';
import CONFIG from '../utils/config.js';
import InitializationSteps from './initializationSteps.js';
import { SessionModeManager } from './sessionModeManager.js'; // Import class, not singleton
import NetworkedSession from '../network/networkedSession.js';

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
    this.dataManager = dependencies.dataManager || DataManager;
    this.teamRegistry = dependencies.teamRegistry || null;
    this.nfcHandler = dependencies.nfcHandler || NFCHandler;
    this.config = dependencies.config || CONFIG;
    this.initializationSteps = dependencies.initializationSteps || InitializationSteps;

    // Session dependencies (injected after mode selection)
    this.sessionModeManager = dependencies.sessionModeManager || null;
    this.networkedSession = dependencies.networkedSession || null;

    // Global reference for HTML onclick handlers (temporary until Phase 6)
    this.showConnectionWizard = dependencies.showConnectionWizard || (typeof window !== 'undefined' ? window.showConnectionWizard : null);

    // Instance state
    this.currentTeamId = '';
    this.nfcSupported = false;
    this.currentInterventionTeamId = null; // For GM intervention features
    this.viewController = this._createViewController();
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

    // Connection restoration logic with full state validation (Phase 1C + Phase 4.1)
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
      this._initializeNetworkedMode.bind(this)
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

    // Listen for session:ready from NetworkedSession
    // Services are provided via event.detail.services (per Architecture Refactoring 2025-11)
    this.networkedSession.addEventListener('session:ready', (event) => {
      this.debug.log('NetworkedSession ready - initializing admin modules');

      // Event-driven: Receive services from event detail, not window lookup
      if (event.detail && event.detail.services) {
        this.debug.log('Received services via session:ready event.detail');
      }

      // Initialize admin modules when session is ready
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
        // Phase 3: Admin panel is now available in standalone mode
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
          // Initialize admin modules if not already done
          if (!this.adminInstances) {
            this.initAdminModules();
          }

          // Refresh admin panel
          if (this.adminInstances) {
            // Fetch current session state
            this.fetchCurrentSession();
          }
          // Update admin panel displays
          app.updateAdminPanel();
        }
      },

      async fetchCurrentSession() {
        // BUG FIX (Phase 2.3): Session state and display now handled by broadcasts
        // SessionManager.currentSession updated from session:update broadcasts (event-driven)
        // MonitoringDisplay updates DOM from session:update broadcasts
        // No need to manually refresh display - broadcasts handle everything
        // This follows event-driven architecture with clear separation of concerns

        if (!this.adminInstances?.sessionManager) return;

        app.debug.log(this.adminInstances.sessionManager.currentSession
          ? 'Session active: ' + JSON.stringify(this.adminInstances.sessionManager.currentSession)
          : 'No active session');
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
          systemMonitor: adminController.getModule('systemMonitor'),
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

  // ========== Settings Management ==========

  showSettings() {
    this.uiManager.showScreen('settings');
  }

  saveSettings() {
    this.settings.save();
    this.uiManager.showScreen('teamEntry');
  }

  toggleMode() {
    this.settings.mode = this.settings.mode === 'detective' ? 'blackmarket' : 'detective';

    // Mode is stored in Settings and localStorage only
    // No need to sync to services (they read from Settings)

    this.uiManager.updateModeDisplay(this.settings.mode);

    const scanScreen = document.getElementById('scanScreen');
    if (scanScreen && scanScreen.classList.contains('active')) {
      this.uiManager.updateSessionStats();
    }

    // Visual feedback
    const indicator = document.getElementById('modeIndicator');
    if (indicator) {
      indicator.style.transform = `scale(${this.config.MODE_TOGGLE_SCALE})`;
      setTimeout(() => {
        indicator.style.transform = 'scale(1)';
      }, this.config.ANIMATION_DURATION);
    }
  }

  updateModeFromToggle() {
    const modeToggle = document.getElementById('modeToggle');
    if (modeToggle) {
      this.settings.mode = modeToggle.checked ? 'blackmarket' : 'detective';
      this.uiManager.updateModeDisplay(this.settings.mode);
    }
  }

  // ========== Team Entry ==========

  /**
   * Initialize team entry UI based on session mode
   * Shows appropriate elements (dropdown vs text input)
   * Called when transitioning to team entry screen
   */
  initTeamEntryUI() {
    const teamSelect = document.getElementById('teamSelect');
    const standaloneContainer = document.querySelector('.standalone-team-container');
    const teamSelectContainer = document.querySelector('.team-select-container');
    const showAddTeamBtn = document.getElementById('showAddTeamBtn');
    const addTeamContainer = document.getElementById('addTeamInputContainer');
    const standaloneInput = document.getElementById('standaloneTeamName');

    const isStandalone = this.sessionModeManager?.isStandalone();

    if (isStandalone) {
      // Standalone mode: Show text input, hide dropdown
      if (teamSelectContainer) teamSelectContainer.style.display = 'none';
      if (standaloneContainer) standaloneContainer.style.display = 'block';
      if (showAddTeamBtn) showAddTeamBtn.style.display = 'none';
      if (addTeamContainer) addTeamContainer.style.display = 'none';

      // Focus the input
      if (standaloneInput) standaloneInput.focus();
    } else {
      // Networked mode: Show dropdown, hide standalone input
      if (teamSelectContainer) teamSelectContainer.style.display = 'block';
      if (standaloneContainer) standaloneContainer.style.display = 'none';
      if (showAddTeamBtn) showAddTeamBtn.style.display = 'block';
      if (addTeamContainer) addTeamContainer.style.display = 'none';

      // Populate dropdown from TeamRegistry
      if (teamSelect && this.teamRegistry) {
        this.teamRegistry.populateDropdown(teamSelect);
      }

      // Listen for team updates from other GMs (add once, not repeatedly)
      if (this.teamRegistry && !this._teamsUpdatedListenerAdded) {
        this._teamsUpdatedListenerAdded = true;
        this.teamRegistry.addEventListener('teams:updated', () => {
          const currentTeamSelect = document.getElementById('teamSelect');
          if (currentTeamSelect && !this.sessionModeManager?.isStandalone()) {
            this.teamRegistry.populateDropdown(currentTeamSelect);
          }
        });
      }
    }

    // Wire up "Add New Team" toggle
    if (showAddTeamBtn && addTeamContainer) {
      showAddTeamBtn.onclick = () => {
        addTeamContainer.style.display = addTeamContainer.style.display === 'none' ? 'flex' : 'none';
        const newTeamInput = document.getElementById('newTeamNameInput');
        if (newTeamInput && addTeamContainer.style.display === 'flex') {
          newTeamInput.focus();
        }
      };
    }
  }

  /**
   * Create and select a new team (networked mode)
   * Sends session:addTeam to backend and selects the new team
   */
  async createAndSelectTeam() {
    const newTeamInput = document.getElementById('newTeamNameInput');
    const teamName = newTeamInput?.value?.trim();

    if (!teamName) {
      this.uiManager.showError('Please enter a team name');
      return;
    }

    // No client-side validation - server handles it, GM types what they want

    if (this.sessionModeManager?.isNetworked() && this.networkedSession) {
      try {
        const client = this.networkedSession.getService('client');
        if (!client) {
          this.uiManager.showError('Not connected to server');
          return;
        }

        // FIXED: Use sendCommand (waits for ack) with gm:command event type
        const response = await client.sendCommand('session:addTeam', { teamId: teamName });

        if (!response.success) {
          this.uiManager.showError(`Failed to create team: ${response.message}`);
          return;
        }

        // ONLY after backend confirms, update local state
        if (this.teamRegistry) {
          this.teamRegistry.addTeam(teamName);
        }

        this.currentTeamId = teamName;
        const teamSelect = document.getElementById('teamSelect');
        if (teamSelect && this.teamRegistry) {
          this.teamRegistry.populateDropdown(teamSelect, { selectedTeamId: teamName });
        }

        // Clear input and hide container
        if (newTeamInput) newTeamInput.value = '';
        const addTeamContainer = document.getElementById('addTeamInputContainer');
        if (addTeamContainer) addTeamContainer.style.display = 'none';

        this.uiManager.showToast(`Team "${teamName}" created`, 'success', 2000);
      } catch (error) {
        this.uiManager.showError(`Failed to create team: ${error.message}`);
      }
    } else {
      // Standalone mode: just set the team name
      this.currentTeamId = teamName;
      this.uiManager.showToast(`Team "${teamName}" set`, 'success', 2000);
    }
  }

  /**
   * Confirm team selection and proceed to scan screen
   * Reads from dropdown (networked) or text input (standalone)
   */
  confirmTeamId() {
    const isStandalone = this.sessionModeManager?.isStandalone();
    let teamName = '';

    if (isStandalone) {
      // Read from text input
      const standaloneInput = document.getElementById('standaloneTeamName');
      teamName = standaloneInput?.value?.trim() || '';
    } else {
      // Read from dropdown
      const teamSelect = document.getElementById('teamSelect');
      teamName = teamSelect?.value || '';
    }

    if (!teamName) {
      this.uiManager.showError('Please select or enter a team name');
      return;
    }

    this.currentTeamId = teamName;

    const currentTeamElement = document.getElementById('currentTeam');
    if (currentTeamElement) {
      currentTeamElement.textContent = this.currentTeamId;
    }

    // Note: Team will be created automatically when first transaction is added
    // UnifiedDataManager's strategy (LocalStorage/NetworkedStorage) handles team creation

    // Update stats and proceed to scan screen
    this.uiManager.updateSessionStats();
    this.uiManager.showScreen('scan');
  }

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
        // Standalone mode: lock immediately and proceed
        this.sessionModeManager.setMode(mode);
        this.debug.log(`Game mode locked: ${mode}`);

        // Phase 3: Add body class for CSS-based feature hiding
        document.body.classList.add('standalone-mode');
        document.body.classList.remove('networked-mode');

        // Clear phantom data from previous sessions
        localStorage.removeItem('standaloneSession');

        // Initialize UnifiedDataManager for standalone mode
        // This creates LocalStorage strategy and loads from localStorage if available
        this.dataManager.sessionModeManager = this.sessionModeManager;
        await this.dataManager.initializeStandaloneMode();

        this.debug.log('UnifiedDataManager initialized for standalone mode');

        // Phase 3: Initialize view controller (shows admin tabs in standalone mode too)
        this.viewController.init();

        // Phase 3: Initialize admin session display in standalone mode
        const sessionContainer = document.getElementById('session-status-container');
        if (sessionContainer) {
          this.uiManager.renderSessionStatus(sessionContainer);
        }

        // Initialize team entry UI
        this.initTeamEntryUI();

        this.uiManager.showScreen('teamEntry');
      }
    } catch (error) {
      console.error('Failed to set game mode:', error);
      this.uiManager.showError(`Failed to set game mode: ${error.message}`);

      // Re-throw so caller (ConnectionWizard) can display error in modal
      throw error;
    }
  }

  /**
   * Initialize networked mode by creating NetworkedSession
   * Per Architecture Refactoring 2025-11 line 166: "App creates NetworkedSession with config"
   * @private
   */
  async _initializeNetworkedMode() {
    // Phase 3: Add body class for CSS-based feature display
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
      }, this.dataManager, this.teamRegistry);

      // Attempt connection
      try {
        // Wire event listeners BEFORE initializing (so we catch session:ready)
        this._wireNetworkedSessionEvents();

        await this.networkedSession.initialize();
        this.debug.log('NetworkedSession initialized - session:ready will fire');

        // Initialize UnifiedDataManager for networked mode
        // Pass the socket from networkedSession for NetworkedStorage strategy
        this.dataManager.sessionModeManager = this.sessionModeManager;
        const client = this.networkedSession.getService('client');
        await this.dataManager.initializeNetworkedMode(client?.socket);
        this.debug.log('UnifiedDataManager initialized for networked mode');

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
    if (!token) return false;

    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;

      const payload = JSON.parse(atob(parts[1]));
      const exp = payload.exp;

      if (!exp) return false;

      const now = Math.floor(Date.now() / 1000);
      const bufferMinutes = 1;
      return exp > (now + (bufferMinutes * 60));
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }

  // ========== Helper Methods ==========

  /**
   * Helper to switch to a specific view
   */
  switchView(viewName) {
    this.viewController.switchView(viewName);
  }

  // ========== Scanning ==========

  async startScan() {
    const button = document.getElementById('scanButton');
    const status = document.getElementById('scanStatus');

    if (!this.nfcSupported) {
      this.simulateScan();
      return;
    }

    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Scanning...';
      }
      if (status) {
        status.textContent = 'Scanning... Tap a token';
      }

      await this.nfcHandler.startScan(
        (result) => this.processNFCRead(result),
        (err) => {
          this.debug.log(`NFC read error: ${err?.message || err}`, true);
          if (status) {
            status.textContent = 'Read error. Try again.';
          }
          if (button) {
            button.disabled = false;
            button.textContent = 'Start Scanning';
          }
        }
      );
    } catch (error) {
      this.debug.log(`Scan error: ${error.message}`, true);
      if (status) {
        status.textContent = 'NFC not available. Using demo mode.';
      }
      this.simulateScan();
    }
  }

  simulateScan() {
    const status = document.getElementById('scanStatus');
    if (status) {
      status.textContent = 'Demo Mode: Simulating scan...';
    }

    setTimeout(() => {
      const result = this.nfcHandler.simulateScan();
      this.processNFCRead(result);
    }, this.config.SCAN_SIMULATION_DELAY);
  }

  async processNFCRead(result) {
    this.debug.log(`Processing token: "${result.id}" (from ${result.source})`);
    this.debug.log(`Token ID length: ${result.id.length} characters`);

    // VALIDATION: Ensure team is selected before processing
    if (!this.currentTeamId || this.currentTeamId.trim() === '') {
      this.debug.log('ERROR: No team selected - cannot process token', true);
      this.uiManager.showError('Please select a team before scanning tokens');

      // Reset scan button if it exists
      const button = document.getElementById('scanButton');
      if (button) {
        button.disabled = false;
        button.textContent = 'Start Scanning';
      }
      return;
    }

    // Trim any whitespace
    const cleanId = result.id.trim();
    this.debug.log(`Cleaned ID: "${cleanId}" (length: ${cleanId.length})`);

    // Look up token first to get normalized ID (findToken handles case variations)
    const tokenData = this.tokenManager.findToken(cleanId);

    // Use matched ID for duplicate check (handles case variations)
    const tokenId = tokenData ? tokenData.matchedId : cleanId;

    // Check for duplicate using normalized ID
    // UnifiedDataManager handles this for both modes
    if (this.dataManager.isTokenScanned(tokenId)) {
      this.debug.log(`Duplicate token detected: ${tokenId}`, true);
      this.showDuplicateError(tokenId);
      return;
    }

    if (!tokenData) {
      await this.recordTransaction(null, cleanId, true);
    } else {
      await this.recordTransaction(tokenData.token, tokenData.matchedId, false);
    }
  }

  showDuplicateError(tokenId) {
    const button = document.getElementById('scanButton');
    if (button) {
      button.disabled = false;
      button.textContent = 'Start Scanning';
    }

    const statusEl = document.getElementById('resultStatus');
    if (statusEl) {
      statusEl.className = 'status-message error';
      statusEl.innerHTML = `
        <h2>Token Already Scanned</h2>
        <p style="font-size: 14px;">This token has been used</p>
        <p style="font-size: 12px; color: #666;">ID: ${tokenId}</p>
      `;
    }

    const rfidEl = document.getElementById('resultRfid');
    if (rfidEl) {
      rfidEl.textContent = tokenId;
    }

    const typeEl = document.getElementById('resultType');
    if (typeEl) {
      typeEl.textContent = 'DUPLICATE';
      typeEl.style.color = '#FF5722';
    }

    const groupEl = document.getElementById('resultGroup');
    if (groupEl) {
      groupEl.textContent = 'Previously scanned';
    }

    const valueEl = document.getElementById('resultValue');
    if (valueEl) {
      valueEl.textContent = 'No points awarded';
    }

    this.uiManager.showScreen('result');
  }

  async recordTransaction(token, tokenId, isUnknown) {
    const transaction = {
      timestamp: new Date().toISOString(),
      deviceId: this.settings.deviceId,
      mode: this.settings.mode,
      teamId: this.currentTeamId,
      rfid: tokenId,
      tokenId: tokenId,  // Add tokenId for consistency with backend
      memoryType: isUnknown ? 'UNKNOWN' : (token?.SF_MemoryType || 'UNKNOWN'),
      group: isUnknown ? `Unknown: ${tokenId}` : (token?.SF_Group || ''),
      tokenGroup: isUnknown ? '' : (token?.SF_Group || ''),  // For group completion detection
      valueRating: isUnknown ? 0 : (token?.SF_ValueRating || 0),
      isUnknown: isUnknown
    };

    // Calculate points for blackmarket mode
    if (this.settings.mode === 'blackmarket' && !isUnknown) {
      transaction.points = this.dataManager.calculateTokenValue(transaction);
      // DIAGNOSTIC: Log calculated points
      console.log('[app.js] Transaction points calculated:', {
        tokenId: transaction.tokenId,
        valueRating: transaction.valueRating,
        memoryType: transaction.memoryType,
        calculatedPoints: transaction.points,
        tokenGroup: transaction.tokenGroup
      });
    } else {
      transaction.points = 0;
      console.log('[app.js] Transaction points set to 0 (detective mode or unknown token)');
    }

    // Submit transaction based on session mode
    if (this.sessionModeManager && this.sessionModeManager.isNetworked()) {
      // Networked mode - DON'T add to DataManager yet (will be added when backend confirms)
      this.dataManager.markTokenAsScanned(tokenId);  // Still mark as scanned to prevent duplicates

      // Get queue manager from NetworkedSession
      if (!this.networkedSession) {
        throw new Error('Cannot scan: NetworkedSession not initialized. Please reconnect.');
      }

      const queueManager = this.networkedSession.getService('queueManager');

      // Use queue manager for reliable delivery
      const txId = queueManager.queueTransaction({
        tokenId: tokenId,
        teamId: this.currentTeamId,
        deviceId: this.settings.deviceId,
        deviceType: 'gm',  // BUG #1 FIX: Required by backend validators
        mode: this.settings.mode,  // AsyncAPI contract field (was 'mode')
        summary: token?.summary || null,  // Include summary for persistence (backend AsyncAPI contract)
        timestamp: transaction.timestamp  // Use same timestamp
      });
      this.debug.log(`Transaction queued for orchestrator: ${txId}`);
    } else {
      // Standalone mode - use UnifiedDataManager (LocalStorage strategy)
      if (this.sessionModeManager && this.sessionModeManager.isStandalone()) {
        // Add transaction via UnifiedDataManager (delegates to LocalStorage strategy)
        // LocalStorage handles scoring, group bonuses, and persists to localStorage
        await this.dataManager.addTransaction(transaction);
        this.dataManager.markTokenAsScanned(tokenId);
        this.debug.log('Transaction stored via UnifiedDataManager (standalone mode)');
      } else {
        // No session mode selected yet - should not happen, but handle gracefully
        this.debug.log('Warning: No session mode selected - cannot process transaction', true);
        this.uiManager.showError('Please select a game mode first');
        return;
      }
    }

    if (this.settings.mode === 'blackmarket' && !isUnknown) {
      // Use UnifiedDataManager for all modes
      const tokenScore = this.dataManager.calculateTokenValue(transaction);
      this.debug.log(`Token scored: $${tokenScore.toLocaleString()}`);
    }

    this.uiManager.updateSessionStats();
    this.uiManager.showTokenResult(token, tokenId, isUnknown);

    const button = document.getElementById('scanButton');
    if (button) {
      button.disabled = false;
      button.textContent = 'Start Scanning';
    }
  }

  manualEntry() {
    const rfid = prompt('Enter RFID manually:');
    if (rfid && rfid.trim()) {
      this.processNFCRead({
        id: rfid.trim(),
        source: 'manual',
        raw: rfid.trim()
      });
    }
  }

  cancelScan() {
    this.nfcHandler.stopScan();
    this.currentTeamId = '';
    this.uiManager.updateTeamDisplay('');
    this.uiManager.showScreen('teamEntry');
  }

  continueScan() {
    this.uiManager.updateSessionStats();
    this.uiManager.showScreen('scan');
  }

  finishTeam() {
    this.currentTeamId = '';
    // Note: Do NOT clear DataManager session here - scannedTokens must persist
    // across team switches for cross-team duplicate detection
    this.uiManager.updateTeamDisplay('');
    this.uiManager.showScreen('teamEntry');
  }

  // ========== History ==========

  showHistory() {
    this.uiManager.updateHistoryStats();
    // Use unified Game Activity renderer (same as admin panel)
    const historyContainer = document.getElementById('historyContainer');
    if (historyContainer) {
      this.uiManager.renderGameActivity(historyContainer, { showSummary: true, showFilters: true });
    }
    this.uiManager.showScreen('history');
  }

  closeHistory() {
    // Default to teamEntry if no valid previous screen
    const targetScreen = this.uiManager.previousScreen || 'teamEntry';
    this.uiManager.showScreen(targetScreen);
  }

  // ========== Scoreboard ==========

  showScoreboard() {
    if (this.settings.mode !== 'blackmarket') {
      this.debug.log('Scoreboard only available in Black Market mode');
      return;
    }
    this.uiManager.renderScoreboard();
    this.uiManager.showScreen('scoreboard');
  }

  closeScoreboard() {
    // Default to teamEntry if no valid previous screen
    const targetScreen = this.uiManager.previousScreen || 'teamEntry';
    this.uiManager.showScreen(targetScreen);
  }

  // ========== Team Details ==========

  showTeamDetails(teamId) {
    // CRITICAL: teamDetailsScreen is inside scanner-view, so switch to scanner view first
    // if currently in admin view (common when clicking team from admin panel score board)
    if (this.viewController && this.viewController.currentView === 'admin') {
      this.viewController.switchView('scanner');
    }

    // CRITICAL: Track current team for intervention actions (deletion, score adjustment)
    this.currentInterventionTeamId = teamId;

    const transactions = this.dataManager.getTeamTransactions(teamId);
    this.uiManager.renderTeamDetails(teamId, transactions);
    this.uiManager.showScreen('teamDetails');
  }

  closeTeamDetails() {
    this.uiManager.showScreen('scoreboard');
  }

  // ========== Admin Actions ==========
  // These methods wrap calls to AdminModule functionality

  async adminCreateSession() {
    const name = prompt('Enter session name:');
    if (!name) return;

    const isStandalone = this.sessionModeManager?.isStandalone();

    // Standalone mode: Use UnifiedDataManager (LocalStorage strategy)
    if (isStandalone) {
      try {
        await this.dataManager.createSession(name.trim(), []);
        this.debug.log(`Session created (standalone): ${name}`);
        this.uiManager.showToast('Session created', 'success');

        // Refresh session display
        this._refreshAdminSessionDisplay();
      } catch (error) {
        console.error('Failed to create session (standalone):', error);
        this.uiManager.showError(`Failed to create session: ${error.message}`);
      }
      return;
    }

    // Networked mode: Use SessionManager (existing code)
    if (!this.viewController.adminInstances?.sessionManager) {
      alert('Admin functions not available. Please ensure you are connected.');
      return;
    }

    try {
      await this.viewController.adminInstances.sessionManager.createSession(name);
      this.debug.log(`Session created: ${name}`);
    } catch (error) {
      console.error('Failed to create session:', error);
      this.uiManager.showError('Failed to create session. Check connection.');
    }
  }

  async adminPauseSession() {
    const isStandalone = this.sessionModeManager?.isStandalone();

    // Standalone mode: Use UnifiedDataManager
    if (isStandalone) {
      try {
        const result = await this.dataManager.pauseSession();
        if (result.success) {
          this.debug.log('Session paused (standalone)');
          this.uiManager.showToast('Session paused', 'info');
          this._refreshAdminSessionDisplay();
        } else {
          this.uiManager.showError(result.error || 'Failed to pause session');
        }
      } catch (error) {
        console.error('Failed to pause session (standalone):', error);
        this.uiManager.showError(`Failed to pause session: ${error.message}`);
      }
      return;
    }

    // Networked mode (existing code)
    if (!this.viewController.adminInstances?.sessionManager) {
      alert('Admin functions not available.');
      return;
    }
    try {
      await this.viewController.adminInstances.sessionManager.pauseSession();
      this.debug.log('Session paused');
    } catch (error) {
      console.error('Failed to pause session:', error);
      this.uiManager.showError('Failed to pause session.');
    }
  }

  async adminResumeSession() {
    const isStandalone = this.sessionModeManager?.isStandalone();

    // Standalone mode: Use UnifiedDataManager
    if (isStandalone) {
      try {
        const result = await this.dataManager.resumeSession();
        if (result.success) {
          this.debug.log('Session resumed (standalone)');
          this.uiManager.showToast('Session resumed', 'success');
          this._refreshAdminSessionDisplay();
        } else {
          this.uiManager.showError(result.error || 'Failed to resume session');
        }
      } catch (error) {
        console.error('Failed to resume session (standalone):', error);
        this.uiManager.showError(`Failed to resume session: ${error.message}`);
      }
      return;
    }

    // Networked mode (existing code)
    if (!this.viewController.adminInstances?.sessionManager) {
      alert('Admin functions not available.');
      return;
    }
    try {
      await this.viewController.adminInstances.sessionManager.resumeSession();
      this.debug.log('Session resumed');
    } catch (error) {
      console.error('Failed to resume session:', error);
      this.uiManager.showError('Failed to resume session.');
    }
  }

  async adminEndSession() {
    if (!confirm('Are you sure you want to end the session?')) return;

    const isStandalone = this.sessionModeManager?.isStandalone();

    // Standalone mode: Use UnifiedDataManager
    if (isStandalone) {
      try {
        await this.dataManager.endSession();
        this.debug.log('Session ended (standalone)');
        this.uiManager.showToast('Session ended', 'info');
        this._refreshAdminSessionDisplay();
      } catch (error) {
        console.error('Failed to end session (standalone):', error);
        this.uiManager.showError(`Failed to end session: ${error.message}`);
      }
      return;
    }

    // Networked mode (existing code)
    if (!this.viewController.adminInstances?.sessionManager) {
      alert('Admin functions not available.');
      return;
    }
    try {
      await this.viewController.adminInstances.sessionManager.endSession();
      this.debug.log('Session ended');
    } catch (error) {
      console.error('Failed to end session:', error);
      this.uiManager.showError('Failed to end session.');
    }
  }

  async adminResetAndCreateNew() {
    // Step 0: Confirm with user
    const confirmReset = confirm(
      'Reset system and start new session?\n\n' +
      'This will:\n' +
      '• Archive the current completed session\n' +
      '• Clear all current data\n' +
      '• Prepare system for a new game\n\n' +
      'Continue?'
    );

    if (!confirmReset) return;

    // Step 1: Get new session name
    const name = prompt('Enter new session name:');
    if (!name || name.trim() === '') {
      alert('Session name is required');
      return;
    }

    // Step 2: Verify admin instances available
    if (!this.viewController.adminInstances?.sessionManager) {
      alert('Admin functions not available. Please ensure you are connected to the orchestrator.');
      return;
    }

    try {
      // Step 3: Send system:reset command
      this.debug.log('Sending system:reset command...');

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('System reset timeout (5s)'));
        }, 5000);

        const socket = this.viewController.adminInstances.sessionManager.connection.socket;

        socket.once('gm:command:ack', (response) => {
          clearTimeout(timeout);

          if (response.data && response.data.success) {
            this.debug.log('System reset successful');
            resolve();
          } else {
            const errorMsg = response.data?.message || 'Reset failed';
            reject(new Error(errorMsg));
          }
        });

        socket.emit('gm:command', {
          event: 'gm:command',
          data: {
            action: 'system:reset',
            payload: {}
          },
          timestamp: new Date().toISOString()
        });
      });

      this.debug.log('System reset complete, creating new session...');

      // Step 4: Create new session
      await this.viewController.adminInstances.sessionManager.createSession(name.trim());

      this.debug.log(`New session created: ${name}`);

      // Step 5: Show success feedback
      if (this.uiManager.showToast) {
        this.uiManager.showToast(`Session "${name}" started successfully`, 'success', 5000);
      } else {
        alert(`Session "${name}" created successfully!`);
      }

    } catch (error) {
      console.error('Failed to reset and create session:', error);

      const errorMsg = `Failed to reset and create session: ${error.message}`;

      if (this.uiManager.showError) {
        this.uiManager.showError(errorMsg);
      } else {
        alert(errorMsg);
      }
    }
  }

  async adminViewSessionDetails() {
    const session = this.viewController.adminInstances?.sessionManager?.currentSession;

    if (!session) {
      alert('No session data available');
      return;
    }

    // Format session details
    const startTime = session.startTime ? new Date(session.startTime).toLocaleString() : 'Unknown';
    const endTime = session.endTime ? new Date(session.endTime).toLocaleString() : 'Ongoing';
    const duration = session.getDuration ? this.formatSessionDuration(session.getDuration()) : 'Unknown';

    const details = `
═══════════════════════════════════
SESSION DETAILS
═══════════════════════════════════

Name: ${session.name || 'Unnamed Session'}
ID: ${session.id}
Status: ${session.status.toUpperCase()}

TIMING
──────────────────────────────────
Started: ${startTime}
${session.endTime ? 'Ended: ' + endTime : 'Status: In Progress'}
Duration: ${duration}

STATISTICS
──────────────────────────────────
Total Scans: ${session.metadata?.totalScans || 0}
Unique Tokens: ${session.metadata?.uniqueTokensScanned?.length || 0}
Teams: ${session.scores?.length || 0}
GM Stations: ${session.connectedDevices?.filter(d => d.type === 'gm').length || 0}

═══════════════════════════════════
    `.trim();

    alert(details);
  }

  /**
   * Helper: Format duration for session details
   */
  formatSessionDuration(ms) {
    if (ms == null || ms < 0) return 'Unknown';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0 && parts.length < 2) parts.push(`${minutes % 60}m`);
    if (seconds % 60 > 0 && parts.length < 2) parts.push(`${seconds % 60}s`);

    return parts.length > 0 ? parts.join(' ') : '0s';
  }

  async adminPlayVideo() {
    if (!this.viewController.adminInstances?.videoController) {
      alert('Video controls not available.');
      return;
    }
    try {
      await this.viewController.adminInstances.videoController.playVideo();
    } catch (error) {
      console.error('Failed to play video:', error);
      this.uiManager.showError('Failed to play video.');
    }
  }

  async adminPauseVideo() {
    if (!this.viewController.adminInstances?.videoController) {
      alert('Video controls not available.');
      return;
    }
    try {
      await this.viewController.adminInstances.videoController.pauseVideo();
    } catch (error) {
      console.error('Failed to pause video:', error);
      this.uiManager.showError('Failed to pause video.');
    }
  }

  async adminStopVideo() {
    if (!this.viewController.adminInstances?.videoController) {
      alert('Video controls not available.');
      return;
    }
    try {
      await this.viewController.adminInstances.videoController.stopVideo();
    } catch (error) {
      console.error('Failed to stop video:', error);
      this.uiManager.showError('Failed to stop video.');
    }
  }

  async adminSkipVideo() {
    if (!this.viewController.adminInstances?.videoController) {
      alert('Video controls not available.');
      return;
    }
    try {
      await this.viewController.adminInstances.videoController.skipVideo();
    } catch (error) {
      console.error('Failed to skip video:', error);
      this.uiManager.showError('Failed to skip video.');
    }
  }

  // ============================================
  async adminAddVideoToQueue() {
    if (!this.viewController.adminInstances?.videoController) {
      alert('Video controls not available.');
      return;
    }
    const input = document.getElementById('manual-video-input');
    const filename = input?.value;
    if (!filename) {
      alert('Enter a video filename (e.g., jaw001.mp4)');
      return;
    }
    try {
      await this.viewController.adminInstances.videoController.addToQueue(filename);
      this.uiManager.showToast(`Added ${filename} to queue`, 'success');
      if (input) {
        input.value = '';
      }
    } catch (error) {
      console.error('Failed to add video to queue:', error);
      this.uiManager.showError(`Failed to add video: ${error.message}`);
    }
  }

  async adminClearQueue() {
    if (!this.viewController.adminInstances?.videoController) {
      alert('Video controls not available.');
      return;
    }
    if (!confirm('Clear entire video queue?')) {
      return;
    }
    try {
      await this.viewController.adminInstances.videoController.clearQueue();
      this.uiManager.showToast('Queue cleared', 'success');
    } catch (error) {
      console.error('Failed to clear queue:', error);
      this.uiManager.showError(`Failed to clear queue: ${error.message}`);
    }
  }

  // ========== Admin Panel Display Updates ==========

  updateAdminPanel() {
    // In networked mode, delegate to MonitoringDisplay for session/device/video status
    if (this.viewController?.adminInstances?.monitoring) {
      this.viewController.adminInstances.monitoring.refreshAllDisplays();
    }

    // Render Game Activity (unified display for both modes)
    // This replaces the old transaction log with the new token lifecycle view
    const gameActivityContainer = document.getElementById('admin-game-activity');
    if (gameActivityContainer) {
      this.uiManager.renderGameActivity(gameActivityContainer, { showSummary: true, showFilters: true });
    }

    // Fallback scoreboard for standalone mode (no WebSocket connection)
    // In networked mode, scores are rendered by ScreenUpdateManager container handlers
    if (!this.viewController?.adminInstances?.monitoring) {
      const scoreBoard = document.getElementById('admin-score-board');
      if (scoreBoard) {
        const teams = {};
        this.dataManager.transactions.forEach(tx => {
          if (!teams[tx.teamId]) {
            teams[tx.teamId] = {
              score: 0,
              count: 0
            };
          }
          teams[tx.teamId].count++;
          // Use each transaction's mode, not the current setting
          if (tx.mode === 'blackmarket') {
            const score = this.dataManager.calculateTokenValue(tx);
            teams[tx.teamId].score += score;
          }
        });

        // Display scores
        let html = '<table class="score-table"><tr><th>Team</th><th>Tokens</th><th>Score</th></tr>';
        Object.keys(teams).forEach(teamId => {
          html += `<tr>
            <td style="cursor: pointer; color: #007bff; text-decoration: underline;"
                data-action="app.showTeamDetails" data-arg="${teamId}">
              ${teamId}
            </td>
            <td>${teams[teamId].count}</td>
            <td>${teams[teamId].score.toLocaleString()}</td>
          </tr>`;
        });
        html += '</table>';
        scoreBoard.innerHTML = html;
      }
    }
  }

  async adminResetScores() {
    if (!confirm('Reset all team scores to zero? Transactions will be preserved.')) return;

    const isStandalone = this.sessionModeManager?.isStandalone();

    // Standalone mode: Use UnifiedDataManager
    if (isStandalone) {
      try {
        const result = await this.dataManager.resetScores();
        if (result.success) {
          this.debug.log('Scores reset (standalone)');
          this.uiManager.showToast('All scores reset to zero', 'success');
        } else {
          this.uiManager.showError(result.error || 'Failed to reset scores');
        }
      } catch (error) {
        console.error('Failed to reset scores (standalone):', error);
        this.uiManager.showError(`Failed to reset scores: ${error.message}`);
      }
      return;
    }

    // Networked mode: Use AdminOps
    if (!this.viewController.adminInstances?.adminOps) {
      alert('Admin functions not available.');
      return;
    }

    try {
      await this.viewController.adminInstances.adminOps.resetScores();
      this.debug.log('Scores reset');
      this.uiManager.showToast('All scores reset', 'success');
    } catch (error) {
      console.error('Failed to reset scores:', error);
      this.uiManager.showError('Failed to reset scores.');
    }
  }

  /**
   * Navigate to full scoreboard view from admin panel
   */
  viewFullScoreboard() {
    this.switchView('scanner');
    this.showScoreboard();
  }

  /**
   * Navigate to full transaction history from admin panel
   */
  viewFullHistory() {
    this.switchView('scanner');
    this.showHistory();
  }

  /**
   * Refresh admin session display (standalone mode)
   * @private
   */
  _refreshAdminSessionDisplay() {
    const container = document.getElementById('session-status-container');
    if (container && this.uiManager) {
      this.uiManager.renderSessionStatus(container);
    }
  }

  // ========== GM Intervention (Both Modes) ==========

  async adjustTeamScore() {
    const teamId = this.currentInterventionTeamId;
    if (!teamId) {
      alert('No team selected. Please open team details first.');
      return;
    }

    const deltaInput = document.getElementById('scoreAdjustmentInput');
    const reasonInput = document.getElementById('scoreAdjustmentReason');

    const delta = parseInt(deltaInput?.value || '0');
    if (isNaN(delta) || delta === 0) {
      alert('Please enter a valid positive or negative number.');
      return;
    }

    const reason = reasonInput?.value.trim() || 'Manual GM adjustment';

    const isStandalone = this.sessionModeManager?.isStandalone();

    // Standalone mode: Use UnifiedDataManager (LocalStorage strategy)
    if (isStandalone) {
      try {
        await this.dataManager.adjustTeamScore(teamId, delta, reason);
        this.debug.log(`Score adjusted (standalone): Team ${teamId} ${delta > 0 ? '+' : ''}${delta} (${reason})`);

        // Clear inputs
        if (deltaInput) deltaInput.value = '';
        if (reasonInput) reasonInput.value = '';

        // Refresh team details immediately with updated local data
        const transactions = this.dataManager.getTeamTransactions(teamId);
        this.uiManager.renderTeamDetails(teamId, transactions);

        this.uiManager.showToast(`Score adjusted: ${delta > 0 ? '+' : ''}${delta} points`, 'success');
      } catch (error) {
        console.error('Failed to adjust score (standalone):', error);
        this.uiManager.showError(`Failed to adjust score: ${error.message}`);
      }
      return;
    }

    // Networked mode: Use AdminOps (backend authoritative)
    if (!this.viewController?.adminInstances?.adminOps) {
      alert('Admin functions not available. Ensure you are in networked mode.');
      return;
    }

    try {
      await this.viewController.adminInstances.adminOps.adjustScore(teamId, delta, reason);
      this.debug.log(`Score adjusted (networked): Team ${teamId} ${delta > 0 ? '+' : ''}${delta} (${reason})`);

      // Clear inputs
      if (deltaInput) deltaInput.value = '';
      if (reasonInput) reasonInput.value = '';

      // Team details screen will auto-refresh via updateTeamScoreFromBackend()
      // when score:updated event is received (centralized in dataManager.js)

      this.uiManager.showToast(`Score adjusted: ${delta > 0 ? '+' : ''}${delta} points`, 'success');
    } catch (error) {
      console.error('Failed to adjust score (networked):', error);
      this.uiManager.showError(`Failed to adjust score: ${error.message}`);
    }
  }

  async deleteTeamTransaction(transactionId) {
    if (!confirm('Delete this transaction? This cannot be undone.')) return;

    const isStandalone = this.sessionModeManager?.isStandalone();

    // Standalone mode: Use UnifiedDataManager (LocalStorage strategy)
    if (isStandalone) {
      try {
        const result = await this.dataManager.removeTransaction(transactionId);
        if (result.success) {
          this.debug.log(`Transaction deleted (standalone): ${transactionId}`);

          // Refresh team details immediately with updated local data
          const teamId = this.currentInterventionTeamId;
          if (teamId) {
            const transactions = this.dataManager.getTeamTransactions(teamId);
            this.uiManager.renderTeamDetails(teamId, transactions);
          }

          this.uiManager.showToast('Transaction deleted', 'success');
        } else {
          this.uiManager.showError('Transaction not found');
        }
      } catch (error) {
        console.error('Failed to delete transaction (standalone):', error);
        this.uiManager.showError(`Failed to delete transaction: ${error.message}`);
      }
      return;
    }

    // Networked mode: Use AdminOps (backend authoritative)
    if (!this.viewController?.adminInstances?.adminOps) {
      alert('Admin functions not available. Ensure you are in networked mode.');
      return;
    }

    try {
      await this.viewController.adminInstances.adminOps.deleteTransaction(transactionId);
      this.debug.log(`Transaction deleted (networked): ${transactionId}`);

      // ✅ Remove local mutations - let broadcast flow handle it
      // Backend sends transaction:deleted broadcast
      // MonitoringDisplay calls DataManager.removeTransaction()
      // DataManager emits event
      // main.js listener re-renders team details if active

      this.uiManager.showToast('Transaction deleted', 'success');
    } catch (error) {
      console.error('Failed to delete transaction (networked):', error);
      this.uiManager.showError(`Failed to delete transaction: ${error.message}`);
    }
  }

  // ========== Admin Display Control (Phase 4.2) ==========

  /**
   * Set display to Idle Loop mode
   * Called by data-action="app.adminSetIdleLoop" from admin panel button
   */
  async adminSetIdleLoop() {
    if (!this.sessionModeManager?.isNetworked()) {
      this.debug.log('Display control only available in networked mode');
      return;
    }

    const displayController = this.viewController?.adminInstances?.displayController;
    if (!displayController) {
      this.debug.log('DisplayController not available - admin modules not initialized');
      this.uiManager.showError('Admin functions not available. Please ensure connection is established.');
      return;
    }

    try {
      const result = await displayController.setIdleLoop();
      this.debug.log(`Display mode set to Idle Loop: ${JSON.stringify(result)}`);
    } catch (error) {
      console.error('Failed to set display mode:', error);
      this.uiManager.showError(`Failed to set display mode: ${error.message}`);
    }
  }

  /**
   * Set display to Scoreboard mode
   * Called by data-action="app.adminSetScoreboard" from admin panel button
   */
  async adminSetScoreboard() {
    if (!this.sessionModeManager?.isNetworked()) {
      this.debug.log('Display control only available in networked mode');
      return;
    }

    const displayController = this.viewController?.adminInstances?.displayController;
    if (!displayController) {
      this.debug.log('DisplayController not available - admin modules not initialized');
      this.uiManager.showError('Admin functions not available. Please ensure connection is established.');
      return;
    }

    try {
      const result = await displayController.setScoreboard();
      this.debug.log(`Display mode set to Scoreboard: ${JSON.stringify(result)}`);
    } catch (error) {
      console.error('Failed to set display mode:', error);
      this.uiManager.showError(`Failed to set display mode: ${error.message}`);
    }
  }

  // ========== Testing Functions ==========

  testTokenMatch() {
    const testId = prompt('Enter a token ID to test:');
    if (testId) {
      const result = this.tokenManager.findToken(testId);
      if (result) {
        alert(`Match found!\nID: ${result.matchedId}\nType: ${result.token.SF_MemoryType}\nGroup: ${result.token.SF_Group}`);
      } else {
        alert(`No match found for: ${testId}`);
      }
    }
  }

  testGroupParsing() {
    const testCases = [
      'Server Logs (x5)',
      'Marcus\' Memories (x1)',
      'Government Files (x3)',
      'No Multiplier Group',
      'Bad Format (x)',
      'Zero Multiplier (x0)',
      'Large Multiplier (x999)'
    ];

    console.log('=== Testing Group Parsing ===');
    testCases.forEach(testCase => {
      const parsed = this.dataManager.parseGroupInfo(testCase);
      const normalized = this.dataManager.normalizeGroupName(parsed.name);
      console.log(`Input: "${testCase}"`);
      console.log(`  Parsed: name="${parsed.name}", multiplier=${parsed.multiplier}`);
      console.log(`  Normalized: "${normalized}"`);
    });

    alert('Check console for test results');
  }

  testGroupInventory() {
    const inventory = this.tokenManager.getGroupInventory();

    console.log('=== Group Inventory Test ===');
    console.log('Total groups:', Object.keys(inventory).length);

    Object.entries(inventory).forEach(([normalizedName, groupData]) => {
      console.log(`\nGroup: "${groupData.displayName}"`);
      console.log(`  Normalized: "${normalizedName}"`);
      console.log(`  Multiplier: ${groupData.multiplier}x`);
      console.log(`  Tokens: ${groupData.tokens.size}`);
    });

    alert('Check console for group inventory details');
  }

  testCompletionDetection() {
    console.log('=== Testing Group Completion Detection ===\n');

    const realTeams = [...new Set(this.dataManager.transactions
      .filter(t => t.mode === 'blackmarket')
      .map(t => t.teamId))];

    if (realTeams.length > 0) {
      console.log('=== Testing with REAL data ===');
      realTeams.forEach(teamId => {
        const completed = this.dataManager.getTeamCompletedGroups(teamId);
        console.log(`Team ${teamId}: ${completed.length} completed groups`);
        completed.forEach(group => {
          console.log(`  ✅ "${group.name}" - ${group.tokenCount} tokens, ${group.multiplier}x`);
        });
      });
    } else {
      console.log('No real data found. Add some transactions first.');
    }

    alert('Check console for completion detection results');
  }

  testBonusCalculations() {
    console.log('=== Testing Bonus Score Calculations ===\n');

    const teamScores = this.dataManager.getTeamScores();

    if (teamScores.length > 0) {
      teamScores.forEach((team, index) => {
        console.log(`${index + 1}. Team ${team.teamId}`);
        console.log(`   Base: $${team.baseScore.toLocaleString()}`);
        console.log(`   Bonus: $${team.bonusScore.toLocaleString()}`);
        console.log(`   Total: $${team.score.toLocaleString()}`);
        console.log(`   Completed Groups: ${team.completedGroups}`);
      });
    } else {
      console.log('No teams found. Add some transactions first.');
    }

    alert('Check console for bonus calculation results');
  }

  testEnhancedUI() {
    console.log('=== Testing Enhanced UI Data Structure ===\n');

    const teamId = prompt('Enter a team ID to test (or leave blank for first team):');
    const testTeamId = teamId || this.dataManager.transactions[0]?.teamId;

    if (!testTeamId) {
      alert('No teams found. Add some transactions first.');
      return;
    }

    const enhancedData = this.dataManager.getEnhancedTeamTransactions(testTeamId);

    console.log(`Team ${testTeamId} Enhanced Data:`);
    console.log(`  Completed Groups: ${enhancedData.completedGroups.length}`);
    console.log(`  In-Progress Groups: ${enhancedData.incompleteGroups.length}`);
    console.log(`  Ungrouped Tokens: ${enhancedData.ungroupedTokens.length}`);
    console.log(`  Unknown Tokens: ${enhancedData.unknownTokens.length}`);

    if (enhancedData.hasCompletedGroups) {
      console.log('\nCompleted Groups:');
      enhancedData.completedGroups.forEach(group => {
        console.log(`  "${group.displayName}": ${group.tokens.length} tokens, +$${group.bonusValue.toLocaleString()} bonus`);
      });
    }

    if (enhancedData.hasIncompleteGroups) {
      console.log('\nIn-Progress Groups:');
      enhancedData.incompleteGroups.forEach(group => {
        console.log(`  "${group.displayName}": ${group.progress} (${group.percentage}%)`);
      });
    }

    alert('Check console for enhanced UI data structure');
  }
}

// Create singleton instance
const appInstance = new App();

// Export both class and instance
export default appInstance;
export { App, appInstance };
