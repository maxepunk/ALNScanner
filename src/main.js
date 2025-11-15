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
 * - Initialize application
 * - Expose minimal window globals for HTML onclick handlers (temporary until Phase 9)
 */

// Import core dependencies
// Note: Debug, Settings, TokenManager, NFCHandler, CONFIG are singletons (pre-created instances)
// Note: DataManager, UIManager, StandaloneDataManager are classes (instances created below with DI)
import Debug from './utils/debug.js';
import { UIManager as UIManagerClass } from './ui/uiManager.js';
import Settings from './ui/settings.js';
import TokenManager from './core/tokenManager.js';
import { DataManager as DataManagerClass } from './core/dataManager.js';
import { StandaloneDataManager as StandaloneDataManagerClass } from './core/standaloneDataManager.js';
import NFCHandler from './utils/nfcHandler.js';
import CONFIG from './utils/config.js';
import InitializationSteps from './app/initializationSteps.js';

// Import App class
import { App } from './app/app.js';

// Import connection wizard and DOM event bindings
import { ConnectionWizard, QueueStatusManager, setupCleanupHandlers } from './ui/connectionWizard.js';
import { bindDOMEvents } from './utils/domEventBindings.js';

/**
 * Create service instances with proper dependency injection
 *
 * Architecture: Event-Driven Coordination (no direct cross-dependencies)
 * - DataManager emits events (transaction:added, data:cleared, etc.)
 * - UIManager listens to DataManager events
 * - Event wiring happens in main.js (centralized)
 */

// Create DataManager first (no UI dependencies)
const DataManager = new DataManagerClass({
  tokenManager: TokenManager,
  settings: Settings,
  debug: Debug
  // app, sessionModeManager, networkedSession set later by App
});

// Create StandaloneDataManager for standalone mode scoring
const StandaloneDataManager = new StandaloneDataManagerClass({
  tokenManager: TokenManager,
  debug: Debug
});

// Create UIManager with both DataManager and StandaloneDataManager
// UIManager will route to appropriate manager based on session mode
const UIManager = new UIManagerClass({
  settings: Settings,
  dataManager: DataManager,
  standaloneDataManager: StandaloneDataManager
  // sessionModeManager, app set later by App
});

// Wire event-driven communication: DataManager → UIManager
DataManager.addEventListener('transaction:added', () => {
  Debug.log('[main.js] transaction:added event received!');
  UIManager.updateHistoryBadge();
  UIManager.updateSessionStats();

  // Auto-update history screen if visible
  const historyScreen = document.getElementById('historyScreen');
  if (historyScreen?.classList.contains('active')) {
    Debug.log('[main.js] History screen is active, calling renderTransactions()');
    UIManager.updateHistoryStats();
    UIManager.renderTransactions();
  }

  // Auto-update team details screen if visible
  const teamDetailsScreen = document.getElementById('teamDetailsScreen');
  if (teamDetailsScreen?.classList.contains('active')) {
    Debug.log('[main.js] Team details screen is active, re-rendering after addition');
    // Get current team from app instance
    const currentTeamId = window.__app?.currentInterventionTeamId;
    if (currentTeamId) {
      const transactions = DataManager.getTeamTransactions(currentTeamId);
      UIManager.renderTeamDetails(currentTeamId, transactions);
      Debug.log('[main.js] Team details re-rendered for team:', currentTeamId);
    }
  }
});

// Listen for transaction deletions (mirrors transaction:added pattern)
DataManager.addEventListener('transaction:deleted', () => {
  Debug.log('[main.js] transaction:deleted event received!');
  UIManager.updateHistoryBadge();
  UIManager.updateSessionStats();

  // Auto-update history screen if visible
  const historyScreen = document.getElementById('historyScreen');
  if (historyScreen?.classList.contains('active')) {
    Debug.log('[main.js] History screen is active, re-rendering after deletion');
    UIManager.updateHistoryStats();
    UIManager.renderTransactions();
  }

  // Auto-update team details screen if visible
  const teamDetailsScreen = document.getElementById('teamDetailsScreen');
  if (teamDetailsScreen?.classList.contains('active')) {
    Debug.log('[main.js] Team details screen is active, re-rendering after deletion');
    // Get current team from app instance
    const currentTeamId = window.__app?.currentInterventionTeamId;
    if (currentTeamId) {
      const transactions = DataManager.getTeamTransactions(currentTeamId);
      UIManager.renderTeamDetails(currentTeamId, transactions);
      Debug.log('[main.js] Team details re-rendered for team:', currentTeamId);
    }
  }
});

// Listen for score resets
DataManager.addEventListener('scores:cleared', () => {
  Debug.log('[main.js] scores:cleared event received!');

  // Auto-update scoreboard if visible
  const scoreboardScreen = document.getElementById('scoreboardScreen');
  if (scoreboardScreen?.classList.contains('active')) {
    Debug.log('[main.js] Scoreboard screen is active, clearing after reset');
    // Scoreboard will be repopulated by sync:full that follows
    const scoreTable = scoreboardScreen.querySelector('#team-scores-table tbody');
    if (scoreTable) {
      scoreTable.innerHTML = '';
    }
  }
});

DataManager.addEventListener('data:cleared', () => {
  UIManager.updateHistoryBadge();
});

DataManager.addEventListener('game-state:updated', () => {
  UIManager.updateHistoryBadge();
  UIManager.updateSessionStats();
});

DataManager.addEventListener('team-score:updated', (event) => {
  const { teamId, transactions } = event.detail;

  // Update scoreboard if visible
  if (document.getElementById('scoreboardContainer')) {
    UIManager.renderScoreboard();
  }

  // Update team details if viewing this team
  const teamDetailsScreen = document.getElementById('teamDetailsScreen');
  const app = window.__app; // Temporary access until App is created
  if (teamDetailsScreen?.classList.contains('active') &&
      app?.currentInterventionTeamId === teamId) {
    UIManager.renderTeamDetails(teamId, transactions);
    Debug.log(`Team details refreshed for team ${teamId} after score update`);
  }
});

// Wire event-driven communication: StandaloneDataManager → UIManager
// (Standalone mode uses different events but triggers same UI updates)
StandaloneDataManager.addEventListener('standalone:transaction-added', () => {
  UIManager.updateHistoryBadge();
  UIManager.updateSessionStats();

  // Auto-update history screen if visible
  const historyScreen = document.getElementById('historyScreen');
  if (historyScreen?.classList.contains('active')) {
    UIManager.updateHistoryStats();
    UIManager.renderTransactions();
  }
});

StandaloneDataManager.addEventListener('standalone:scores-updated', () => {
  // Update scoreboard if visible
  if (document.getElementById('scoreboardContainer')) {
    UIManager.renderScoreboard();
  }
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
  standaloneDataManager: StandaloneDataManager,
  nfcHandler: NFCHandler,
  config: CONFIG,
  initializationSteps: InitializationSteps
  // Note: sessionModeManager and networkedSession are set internally by App
  // during mode selection (see App.selectGameMode)
});

// Make app available for event handler above (temporary until better solution)
window.__app = app;

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
