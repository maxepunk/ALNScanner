/**
 * ScreenUpdateManager - Centralized Event-to-Screen Update Routing
 *
 * Phase 3: Event Architecture Standardization
 *
 * Problem Solved:
 * - Eliminates repetitive screen visibility checks scattered in main.js
 * - Removes window.__app hack by providing proper app context injection
 * - Creates consistent, declarative pattern for screen updates
 * - Makes it easy to add new screens or events
 *
 * Architecture:
 * - Global handlers: Run on EVERY event regardless of active screen
 * - Screen handlers: Run ONLY when that screen is active
 * - App context: Injected reference to App instance (replaces window.__app)
 *
 * Usage:
 *   const manager = new ScreenUpdateManager({ uiManager, dataManager, debug });
 *   manager.setAppContext(app);
 *
 *   manager.registerGlobalHandler('transaction:added', () => {
 *     uiManager.updateHistoryBadge();
 *   });
 *
 *   manager.registerScreen('history', {
 *     'transaction:added': () => uiManager.renderTransactions()
 *   });
 *
 *   // Wire to DataManager
 *   DataManager.addEventListener('transaction:added', (e) =>
 *     manager.onDataUpdate('transaction:added', e.detail)
 *   );
 */

export class ScreenUpdateManager {
  /**
   * Create ScreenUpdateManager instance
   * @param {Object} options - Dependency injection
   * @param {Object} options.uiManager - UIManager instance for rendering
   * @param {Object} options.dataManager - DataManager instance for data queries
   * @param {Object} options.debug - Debug instance for logging
   */
  constructor({ uiManager, dataManager, debug } = {}) {
    this.uiManager = uiManager;
    this.dataManager = dataManager;
    this.debug = debug;

    // App context - set via setAppContext() after App is created
    this.appContext = null;

    // Global handlers: eventType -> [handler, handler, ...]
    this.globalHandlers = {};

    // Screen handlers: screenId -> { eventType: handler, ... }
    this.screenHandlers = new Map();
  }

  /**
   * Set the App context for handlers that need app state
   * Replaces the window.__app hack
   * @param {Object} app - App instance
   */
  setAppContext(app) {
    this.appContext = app;
    this.debug?.log('[ScreenUpdateManager] App context set');
  }

  /**
   * Register a global handler that runs on every event
   * regardless of which screen is active
   * @param {string} eventType - Event name (e.g., 'transaction:added')
   * @param {Function} handler - Handler function(eventData)
   */
  registerGlobalHandler(eventType, handler) {
    if (!this.globalHandlers[eventType]) {
      this.globalHandlers[eventType] = [];
    }
    this.globalHandlers[eventType].push(handler);
    this.debug?.log(`[ScreenUpdateManager] Registered global handler for ${eventType}`);
  }

  /**
   * Register screen-specific handlers
   * @param {string} screenId - Screen identifier (without 'Screen' suffix, e.g., 'history')
   * @param {Object} handlers - Map of eventType -> handler function
   */
  registerScreen(screenId, handlers) {
    this.screenHandlers.set(screenId, handlers);
    const eventTypes = Object.keys(handlers).join(', ');
    this.debug?.log(`[ScreenUpdateManager] Registered screen '${screenId}' for events: ${eventTypes}`);
  }

  /**
   * Get the currently active screen ID
   * @returns {string|null} Screen ID without 'Screen' suffix, or null
   */
  getActiveScreenId() {
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) return null;

    // Convert 'historyScreen' -> 'history'
    return activeScreen.id.replace('Screen', '');
  }

  /**
   * Handle a data update event
   * 1. Run all global handlers for this event type
   * 2. If active screen has a handler for this event, run it
   *
   * @param {string} eventType - Event name (e.g., 'transaction:added')
   * @param {*} eventData - Event payload (from CustomEvent.detail)
   */
  onDataUpdate(eventType, eventData) {
    this.debug?.log(`[ScreenUpdateManager] ${eventType} event received`);

    // Step 1: Run global handlers (always)
    const globals = this.globalHandlers[eventType] || [];
    for (const handler of globals) {
      try {
        handler(eventData);
      } catch (error) {
        console.error(`[ScreenUpdateManager] Global handler error for ${eventType}:`, error);
      }
    }

    // Step 2: Run screen-specific handler (if active)
    const activeScreenId = this.getActiveScreenId();
    if (!activeScreenId) {
      this.debug?.log('[ScreenUpdateManager] No active screen, skipping screen handler');
      return;
    }

    const screenHandlers = this.screenHandlers.get(activeScreenId);
    const screenHandler = screenHandlers?.[eventType];

    if (screenHandler) {
      this.debug?.log(`[ScreenUpdateManager] Running ${eventType} handler for screen '${activeScreenId}'`);
      try {
        // Pass both eventData and appContext to handler
        screenHandler(eventData, this.appContext);
      } catch (error) {
        console.error(`[ScreenUpdateManager] Screen handler error for ${activeScreenId}/${eventType}:`, error);
      }
    }
  }

  /**
   * Connect this manager to a DataManager (or StandaloneDataManager)
   * Convenience method to wire all events at once
   * @param {EventTarget} dataSource - DataManager or StandaloneDataManager
   * @param {string[]} eventTypes - Array of event types to listen for
   */
  connectToDataSource(dataSource, eventTypes) {
    for (const eventType of eventTypes) {
      dataSource.addEventListener(eventType, (event) => {
        this.onDataUpdate(eventType, event.detail);
      });
    }
    this.debug?.log(`[ScreenUpdateManager] Connected to data source for events: ${eventTypes.join(', ')}`);
  }
}

export default ScreenUpdateManager;
