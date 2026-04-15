/**
 * ALNScanner - Main Entry Point
 * ES6 Module Architecture
 *
 * This file orchestrates the application initialization in the new
 * ES6 module architecture with Vite build system.
 *
 * Architecture:
 * - Import all modules (singleton instances)
 * - Create App with dependency injection
 * - Wire DataManager event listeners for UI updates
 * - Initialize application
 */

// Import core dependencies
// Note: Debug, Settings, TokenManager, NFCHandler, CONFIG are singletons (pre-created instances)
// Note: UnifiedDataManager, UIManager are classes (instances created below with DI)
import Debug from './utils/debug.js';
import { UIManager as UIManagerClass } from './ui/uiManager.js';
import Settings from './ui/settings.js';
import TokenManager from './core/tokenManager.js';
import { UnifiedDataManager as UnifiedDataManagerClass } from './core/unifiedDataManager.js';
import { TeamRegistry as TeamRegistryClass } from './core/teamRegistry.js';
import { StateStore } from './core/stateStore.js';
import NFCHandler from './utils/nfcHandler.js';
import CONFIG from './utils/config.js';
import InitializationSteps from './app/initializationSteps.js';

// Import App class
import { App } from './app/app.js';

// Import connection wizard and DOM event bindings
import { ConnectionWizard, QueueStatusManager, setupCleanupHandlers } from './ui/connectionWizard.js';
import { bindDOMEvents } from './utils/domEventBindings.js';
import { EvidencePickerRenderer } from './ui/renderers/EvidencePickerRenderer.js';


/**
 * Create service instances with proper dependency injection
 *
 * Architecture: Event-Driven Coordination (no direct cross-dependencies)
 * - UnifiedDataManager emits events (transaction:added, data:cleared, etc.)
 * - DataManager event listeners update UI (badges, screens, scoreboards)
 * - Event wiring happens in main.js (centralized)
 *
 * UnifiedDataManager replaces both DataManager and StandaloneDataManager
 * - Single manager with strategy pattern (LocalStorage/NetworkedStorage)
 * - Mode-specific initialization done by App during selectGameMode()
 */

// Create UnifiedDataManager (strategy selected during App initialization)
const DataManager = new UnifiedDataManagerClass({
  tokenManager: TokenManager,
  sessionModeManager: null, // Set by App during mode selection
  debug: Debug
});

// Create TeamRegistry for unified team management (networked + standalone)
const TeamRegistry = new TeamRegistryClass();

// Create StateStore for service domain state (Networked mode only, populated via service:state)
const stateStore = new StateStore();

// Create UIManager with unified DataManager
const UIManager = new UIManagerClass({
  settings: Settings,
  dataManager: DataManager
  // sessionModeManager, app set later by App
});

// ============================================================================
// DataManager Event Listeners — UI updates on data changes
// No screen/container scoping needed: handlers self-guard with null checks,
// and differential rendering makes updating invisible DOM cheap.
// ============================================================================

// Helper: refresh history screen content
const refreshHistoryScreen = (includeStats = true) => {
  if (includeStats) UIManager.updateHistoryStats();
  const historyContainer = document.getElementById('historyContainer');
  if (historyContainer) {
    UIManager.renderGameActivity(historyContainer, { showSummary: true, showFilters: true });
  }
};

// Helper: refresh team details if viewing a team
const refreshTeamDetails = () => {
  const currentTeamId = app?.currentInterventionTeamId;
  if (currentTeamId) {
    const transactions = DataManager.getTeamTransactions(currentTeamId);
    UIManager.renderTeamDetails(currentTeamId, transactions);
  }
};

// Helper: refresh both scoreboard containers (scanner-view + admin-view)
const refreshScoreboards = () => {
  for (const id of ['scoreboardContainer', 'admin-score-board']) {
    const el = document.getElementById(id);
    if (el) UIManager.renderScoreboard(el);
  }
};

// Helper: clear both scoreboard containers
const clearScoreboards = () => {
  for (const id of ['scoreboardContainer', 'admin-score-board']) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  }
};

// Helper: refresh admin game activity
const refreshAdminGameActivity = () => {
  const container = document.getElementById('admin-game-activity');
  if (container) UIManager.renderGameActivity(container, { showSummary: true, showFilters: true });
};

// Scoreboard Evidence picker (networked mode only — admin section is hidden
// in standalone via `data-requires="networked"`). Constructed lazily on first
// refresh; in standalone mode the short-circuit skips both construction and
// the per-transaction getExposedOwners() pass.
let _evidencePickerRenderer = null;
const refreshEvidencePicker = () => {
  if (document.body.classList.contains('standalone-mode')) return;
  if (!_evidencePickerRenderer) {
    if (!document.getElementById('scoreboard-evidence-section')) return;
    _evidencePickerRenderer = new EvidencePickerRenderer();
  }
  _evidencePickerRenderer.render(DataManager.getExposedOwners());
};

DataManager.addEventListener('transaction:added', () => {
  UIManager.updateHistoryBadge();
  UIManager.updateSessionStats();
  refreshHistoryScreen();
  refreshTeamDetails();
  refreshAdminGameActivity();
  refreshEvidencePicker();
});

DataManager.addEventListener('transaction:deleted', () => {
  UIManager.updateHistoryBadge();
  UIManager.updateSessionStats();
  refreshHistoryScreen();
  refreshTeamDetails();
  refreshAdminGameActivity();
  refreshEvidencePicker();
});

DataManager.addEventListener('data:cleared', () => {
  UIManager.updateHistoryBadge();
  clearScoreboards();
  const adminActivity = document.getElementById('admin-game-activity');
  if (adminActivity) adminActivity.innerHTML = '';
  refreshEvidencePicker();
});

DataManager.addEventListener('game-state:updated', () => {
  UIManager.updateHistoryBadge();
  UIManager.updateSessionStats();
  refreshEvidencePicker();
});

DataManager.addEventListener('team-score:updated', (e) => {
  refreshScoreboards();
  const { teamId, transactions } = e.detail || {};
  const currentTeamId = app?.currentInterventionTeamId;
  if (currentTeamId && currentTeamId === teamId) {
    UIManager.renderTeamDetails(teamId, transactions);
  }
});

DataManager.addEventListener('scores:cleared', () => {
  clearScoreboards();
  refreshEvidencePicker();
});

DataManager.addEventListener('player-scan:added', () => {
  refreshHistoryScreen(false); // no stats — player scans don't affect scoring
  refreshAdminGameActivity();
});

/**
 * Create App instance with dependency injection
 * Now using created instances (not pre-created singletons)
 */
const app = new App({
  debug: Debug,
  uiManager: UIManager,
  settings: Settings,
  tokenManager: TokenManager,
  dataManager: DataManager,
  teamRegistry: TeamRegistry,
  stateStore: stateStore,
  nfcHandler: NFCHandler,
  config: CONFIG,
  initializationSteps: InitializationSteps
  // Note: sessionModeManager and networkedSession are set internally by App
  // during mode selection (see App.selectGameMode)
});

// Wire app reference for getSessionStats (same pattern as UIManager at app.js:79)
DataManager.app = app;

// TeamRegistry dependencies (sessionModeManager, orchestratorClient) are wired
// by App.selectGameMode() after mode selection - not here in main.js
// This follows the same pattern as UnifiedDataManager strategy initialization

/**
 * Create connection wizard and queue status manager
 * These handle networked mode connection UI and offline queue indicator
 */
const connectionWizard = new ConnectionWizard(app);
const queueStatusManager = new QueueStatusManager(app);

/**
 * Inject showConnectionWizard method into app
 * Required by App._initializeNetworkedMode() when no valid auth token exists
 */
app.showConnectionWizard = connectionWizard.showConnectionWizard.bind(connectionWizard);

/**
 * Bind DOM event handlers using event delegation
 * Replaces window globals and onclick handlers with data-action attributes
 */
bindDOMEvents(app, DataManager, Settings, Debug, UIManager, connectionWizard, queueStatusManager);

/**
 * Setup cleanup handlers for page unload
 * Ensures graceful disconnect when closing page
 */
setupCleanupHandlers(app);

/**
 * Initialize application
 * Runs 11-phase initialization sequence from InitializationSteps
 */
async function initializeApp() {
  Debug.log('=== ALNScanner ES6 Module Architecture ===');
  Debug.log('Main entry point loaded');
  Debug.log('Initializing application...');

  try {
    await app.init();
    Debug.log('Application initialization complete');

    // Initialize connection wizard (bind form events)
    connectionWizard.init();
    Debug.log('Connection wizard initialized');

    // Initialize queue status manager (event-driven updates)
    queueStatusManager.init();
    Debug.log('Queue status manager initialized');
  } catch (error) {
    Debug.log(`Initialization error: ${error.message}`, true);
    console.error('App initialization failed:', error);

    // Show error to user
    if (UIManager) {
      UIManager.showError(`Failed to initialize: ${error.message}`);
    }
  }
}

/**
 * Start application when DOM is ready
 * Handles both cases: DOM already loaded, or still loading
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOM already loaded (module scripts are deferred by default)
  initializeApp();
}

/**
 * Export app for console debugging
 * Developers can access via: import('./src/main.js').then(m => m.default)
 */
export default app;
