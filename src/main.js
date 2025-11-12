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
// Note: DataManager, UIManager are classes (instances created below with DI)
import Debug from './utils/debug.js';
import { UIManager as UIManagerClass } from './ui/uiManager.js';
import Settings from './ui/settings.js';
import TokenManager from './core/tokenManager.js';
import { DataManager as DataManagerClass } from './core/dataManager.js';
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

// Create UIManager with DataManager dependency
const UIManager = new UIManagerClass({
  settings: Settings,
  dataManager: DataManager
  // sessionModeManager, app set later by App
});

// Wire event-driven communication: DataManager → UIManager
DataManager.addEventListener('transaction:added', () => {
  UIManager.updateHistoryBadge();
  UIManager.updateSessionStats();
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
