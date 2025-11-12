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

// Import core dependencies (singleton instances)
import Debug from './utils/debug.js';
import UIManager from './ui/uiManager.js';
import Settings from './ui/settings.js';
import TokenManager from './core/tokenManager.js';
import DataManager from './core/dataManager.js';
import NFCHandler from './utils/nfcHandler.js';
import CONFIG from './utils/config.js';
import InitializationSteps from './app/initializationSteps.js';

// Import App class
import { App } from './app/app.js';

// Import connection wizard and DOM event bindings
import { ConnectionWizard, QueueStatusManager, setupCleanupHandlers } from './ui/connectionWizard.js';
import { bindDOMEvents } from './utils/domEventBindings.js';

/**
 * Create App instance with dependency injection
 * All dependencies are singleton instances imported from modules
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
