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
 *
 * Phase 3 Changes:
 * - Introduced ScreenUpdateManager for centralized event-to-screen routing
 * - Removed window.__app hack (app context passed via ScreenUpdateManager)
 * - Declarative screen update registration
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
import NFCHandler from './utils/nfcHandler.js';
import CONFIG from './utils/config.js';
import InitializationSteps from './app/initializationSteps.js';

// Import App class
import { App } from './app/app.js';

// Import connection wizard and DOM event bindings
import { ConnectionWizard, QueueStatusManager, setupCleanupHandlers } from './ui/connectionWizard.js';
import { bindDOMEvents } from './utils/domEventBindings.js';

// Import ScreenUpdateManager for centralized event routing (Phase 3)
import { ScreenUpdateManager } from './ui/ScreenUpdateManager.js';

/**
 * Create service instances with proper dependency injection
 *
 * Architecture: Event-Driven Coordination (no direct cross-dependencies)
 * - UnifiedDataManager emits events (transaction:added, data:cleared, etc.)
 * - ScreenUpdateManager routes events to appropriate UI updates
 * - Event wiring happens in main.js (centralized)
 *
 * Phase 2: UnifiedDataManager replaces both DataManager and StandaloneDataManager
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

// Create UIManager with unified DataManager
const UIManager = new UIManagerClass({
  settings: Settings,
  dataManager: DataManager
  // sessionModeManager, app set later by App
});

/**
 * Create ScreenUpdateManager for centralized event-to-screen routing
 * Replaces scattered event handlers with declarative registration
 */
const screenUpdateManager = new ScreenUpdateManager({
  uiManager: UIManager,
  dataManager: DataManager,
  debug: Debug
});

// ============================================================================
// GLOBAL HANDLERS - Always run regardless of active screen
// ============================================================================

// Transaction added: Update badge and stats globally
screenUpdateManager.registerGlobalHandler('transaction:added', () => {
  UIManager.updateHistoryBadge();
  UIManager.updateSessionStats();
});

// Transaction deleted: Update badge and stats globally
screenUpdateManager.registerGlobalHandler('transaction:deleted', () => {
  UIManager.updateHistoryBadge();
  UIManager.updateSessionStats();
});

// Data cleared: Update badge
screenUpdateManager.registerGlobalHandler('data:cleared', () => {
  UIManager.updateHistoryBadge();
});

// Game state updated: Update badge and stats
screenUpdateManager.registerGlobalHandler('game-state:updated', () => {
  UIManager.updateHistoryBadge();
  UIManager.updateSessionStats();
});


// ============================================================================
// SCREEN-SPECIFIC HANDLERS - Only run when that screen is active
// ============================================================================
// NOTE: Screen handlers receive (eventData, app). Use defensive destructuring
// when accessing eventData properties: `const { prop } = eventData || {}`

// History screen: Re-render game activity when data changes
screenUpdateManager.registerScreen('history', {
  'transaction:added': () => {
    Debug.log('[main.js] History screen active - rendering game activity');
    UIManager.updateHistoryStats();
    const historyContainer = document.getElementById('historyContainer');
    if (historyContainer) {
      UIManager.renderGameActivity(historyContainer, { showSummary: true, showFilters: true });
    }
  },
  'transaction:deleted': () => {
    Debug.log('[main.js] History screen active - re-rendering after deletion');
    UIManager.updateHistoryStats();
    const historyContainer = document.getElementById('historyContainer');
    if (historyContainer) {
      UIManager.renderGameActivity(historyContainer, { showSummary: true, showFilters: true });
    }
  },
  'player-scan:added': () => {
    Debug.log('[main.js] History screen active - rendering game activity (player scan)');
    const historyContainer = document.getElementById('historyContainer');
    if (historyContainer) {
      UIManager.renderGameActivity(historyContainer, { showSummary: true, showFilters: true });
    }
  }
});

// Team details screen: Re-render team data when transactions change
screenUpdateManager.registerScreen('teamDetails', {
  'transaction:added': (_eventData, app) => {
    // _eventData unused - we fetch fresh data for current team
    const currentTeamId = app?.currentInterventionTeamId;
    if (currentTeamId) {
      Debug.log(`[main.js] Team details active - re-rendering for team ${currentTeamId}`);
      const transactions = DataManager.getTeamTransactions(currentTeamId);
      UIManager.renderTeamDetails(currentTeamId, transactions);
    }
  },
  'transaction:deleted': (_eventData, app) => {
    // _eventData unused - we fetch fresh data for current team
    const currentTeamId = app?.currentInterventionTeamId;
    if (currentTeamId) {
      Debug.log(`[main.js] Team details active - re-rendering after deletion for team ${currentTeamId}`);
      const transactions = DataManager.getTeamTransactions(currentTeamId);
      UIManager.renderTeamDetails(currentTeamId, transactions);
    }
  },
  'team-score:updated': (eventData, app) => {
    // Defensive destructuring for eventData
    const { teamId, transactions } = eventData || {};
    const currentTeamId = app?.currentInterventionTeamId;
    if (currentTeamId && currentTeamId === teamId) {
      Debug.log(`[main.js] Team details active - score update for team ${teamId}`);
      UIManager.renderTeamDetails(teamId, transactions);
    }
  }
});

// ============================================================================
// CONTAINER HANDLERS (run for ANY container present in DOM, regardless of screen)
// ============================================================================

// Scoreboard containers - both use UIManager.renderScoreboard() for consistent rendering
// scoreboardContainer: Full scoreboard screen (scanner-view)
// admin-score-board: Admin panel inline scoreboard (admin-view)
screenUpdateManager.registerContainer('scoreboardContainer', {
  'team-score:updated': (eventData, container) => {
    Debug.log('[main.js] Updating scoreboardContainer');
    UIManager.renderScoreboard(container);
  },
  'scores:cleared': (eventData, container) => {
    Debug.log('[main.js] Clearing scoreboardContainer');
    container.innerHTML = '';
  },
  'data:cleared': (eventData, container) => {
    Debug.log('[main.js] Session reset - clearing scoreboardContainer');
    container.innerHTML = '';
  }
});

screenUpdateManager.registerContainer('admin-score-board', {
  'team-score:updated': (eventData, container) => {
    Debug.log('[main.js] Updating admin-score-board');
    UIManager.renderScoreboard(container);
  },
  'scores:cleared': (eventData, container) => {
    Debug.log('[main.js] Clearing admin-score-board');
    container.innerHTML = '';
  },
  'data:cleared': (eventData, container) => {
    Debug.log('[main.js] Session reset - clearing admin-score-board');
    container.innerHTML = '';
  }
});

// Game Activity container (admin panel) - unified token lifecycle display
screenUpdateManager.registerContainer('admin-game-activity', {
  'transaction:added': (eventData, container) => {
    Debug.log('[main.js] Updating admin-game-activity (transaction added)');
    UIManager.renderGameActivity(container, { showSummary: true, showFilters: true });
  },
  'transaction:deleted': (eventData, container) => {
    Debug.log('[main.js] Updating admin-game-activity (transaction deleted)');
    UIManager.renderGameActivity(container, { showSummary: true, showFilters: true });
  },
  'player-scan:added': (eventData, container) => {
    Debug.log('[main.js] Updating admin-game-activity (player scan)');
    UIManager.renderGameActivity(container, { showSummary: true, showFilters: true });
  },
  'data:cleared': (eventData, container) => {
    Debug.log('[main.js] Session reset - clearing admin-game-activity');
    container.innerHTML = '';
  }
});

// Session Status container (admin panel) - Phase 3: Session lifecycle display
screenUpdateManager.registerContainer('session-status-container', {
  'session:updated': (eventData, container) => {
    Debug.log('[main.js] Updating session-status-container (session updated)');
    UIManager.renderSessionStatus(container);
  },
  'data:cleared': (eventData, container) => {
    Debug.log('[main.js] Session reset - re-rendering session-status-container');
    UIManager.renderSessionStatus(container);
  }
});

// ============================================================================
// CONNECT TO DATA SOURCES
// ============================================================================

// Connect ScreenUpdateManager to UnifiedDataManager events
// Phase 2: Single connection - UnifiedDataManager emits all events
screenUpdateManager.connectToDataSource(DataManager, [
  'transaction:added',
  'transaction:deleted',
  'scores:cleared',
  'data:cleared',
  'game-state:updated',
  'team-score:updated',
  'player-scan:added',  // Game Activity: token lifecycle tracking
  'session:updated'     // Phase 3: Session lifecycle events for admin panel
]);

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
  nfcHandler: NFCHandler,
  config: CONFIG,
  initializationSteps: InitializationSteps
  // Note: sessionModeManager and networkedSession are set internally by App
  // during mode selection (see App.selectGameMode)
});

// Set app context for screen handlers that need it (replaces window.__app hack)
screenUpdateManager.setAppContext(app);

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
