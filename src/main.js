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
import SessionModeManager from './app/sessionModeManager.js';

// Import App class
import { App } from './app/app.js';

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
 * Expose window globals for HTML onclick handlers
 *
 * TEMPORARY: These will be removed in Phase 9 when we convert
 * HTML onclick handlers to proper event listeners.
 *
 * HTML onclick handlers that need these:
 * - App: Most common (showHistory, selectGameMode, switchView, etc.)
 * - DataManager: exportData, clearData
 * - Settings: Referenced in inline script blocks
 * - Debug: For debug panel functionality
 *
 * Note: showConnectionWizard, scanForServers, selectServer, and
 * cancelNetworkedMode are defined in HTML script blocks (not here)
 */
if (typeof window !== 'undefined') {
  window.App = app;
  window.DataManager = DataManager;
  window.Settings = Settings;
  window.Debug = Debug;
  window.UIManager = UIManager;
  window.TokenManager = TokenManager;

  // SessionModeManager is created globally but set by App during mode selection
  // Expose constructor for HTML script blocks that check window.sessionModeManager
  window.SessionModeManager = SessionModeManager;
}

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
