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
 *     'transaction:added': () => uiManager.renderGameActivity(container)
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

    // Container handlers: containerId -> { eventType: handler, ... }
    // Always run if container element exists in DOM (regardless of active screen)
    this.containerHandlers = {};

    // Track connected data sources for cleanup (hot-reload, unmount)
    // Map<dataSource, Map<eventType, boundHandler>>
    this.connectedSources = new Map();
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
   *
   * NOTE: Global handlers run in registration order. If handlers have
   * dependencies on each other, register them in the correct sequence.
   *
   * @param {string} eventType - Event name (e.g., 'transaction:added')
   * @param {Function} handler - Handler function(eventData)
   *   - eventData may be undefined; use defensive destructuring if needed
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
   *   Handler signature: (eventData, appContext) => void
   *   - eventData may be undefined; use defensive destructuring: `const { prop } = eventData || {}`
   *   - appContext is the App instance (set via setAppContext)
   * @throws {TypeError} If handlers is not a plain object
   */
  registerScreen(screenId, handlers) {
    // Type safety: validate handlers is an object
    if (!handlers || typeof handlers !== 'object' || Array.isArray(handlers)) {
      throw new TypeError(
        `[ScreenUpdateManager] registerScreen('${screenId}'): handlers must be an object, got ${typeof handlers}`
      );
    }
    this.screenHandlers.set(screenId, handlers);
    const eventTypes = Object.keys(handlers).join(', ');
    this.debug?.log(`[ScreenUpdateManager] Registered screen '${screenId}' for events: ${eventTypes}`);
  }

  /**
   * Register container-specific handlers
   * Container handlers run for ANY container that exists in DOM, regardless of active screen.
   * Use for UI elements that should update globally (scoreboards, transaction logs, etc.)
   *
   * @param {string} containerId - DOM element ID (e.g., 'scoreboardContainer', 'admin-score-board')
   * @param {Object} handlers - Map of eventType -> handler function
   *   Handler signature: (eventData, containerElement) => void
   */
  registerContainer(containerId, handlers) {
    this.containerHandlers[containerId] = handlers;
    const eventTypes = Object.keys(handlers).join(', ');
    this.debug?.log(`[ScreenUpdateManager] Registered container '${containerId}' for events: ${eventTypes}`);
  }

  /**
   * Get the currently active screen ID
   * @returns {string|null} Screen ID without 'Screen' suffix, or null
   */
  getActiveScreenId() {
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) return null;

    const screenId = activeScreen.id;

    // Validate expected pattern: screen IDs should end with 'Screen' suffix
    if (!screenId.endsWith('Screen')) {
      console.warn(
        `[ScreenUpdateManager] Unexpected screen ID pattern: '${screenId}' ` +
        `(expected 'xxxScreen' format). Screen handlers may not work correctly.`
      );
      return screenId; // Return as-is for best-effort handling
    }

    // Convert 'historyScreen' -> 'history'
    return screenId.replace('Screen', '');
  }

  /**
   * Handle a data update event
   * 1. Run all global handlers for this event type
   * 2. Run container handlers for any container that exists in DOM
   * 3. If active screen has a handler for this event, run it
   *
   * @param {string} eventType - Event name (e.g., 'transaction:added')
   * @param {*} eventData - Event payload (from CustomEvent.detail)
   */
  onDataUpdate(eventType, eventData) {
    this.debug?.log(`[ScreenUpdateManager] ${eventType} event received`);

    // Step 1: Run global handlers (always, in registration order)
    const globals = this.globalHandlers[eventType] || [];
    for (const handler of globals) {
      try {
        handler(eventData);
      } catch (error) {
        console.error(`[ScreenUpdateManager] Global handler error for ${eventType}:`, error);
      }
    }

    // Step 2: Run container handlers (for any container that exists in DOM)
    for (const [containerId, handlers] of Object.entries(this.containerHandlers)) {
      const container = document.getElementById(containerId);
      if (container && handlers[eventType]) {
        try {
          handlers[eventType](eventData, container);
        } catch (error) {
          console.error(`[ScreenUpdateManager] Container handler error for ${containerId}/${eventType}:`, error);
        }
      }
    }

    // Step 3: Run screen-specific handler (if active)
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
    // Initialize listener map for this source if not present
    if (!this.connectedSources.has(dataSource)) {
      this.connectedSources.set(dataSource, new Map());
    }
    const sourceListeners = this.connectedSources.get(dataSource);

    for (const eventType of eventTypes) {
      // Create and store bound handler for cleanup
      const boundHandler = (event) => {
        this.onDataUpdate(eventType, event.detail);
      };
      sourceListeners.set(eventType, boundHandler);
      dataSource.addEventListener(eventType, boundHandler);
    }
    this.debug?.log(`[ScreenUpdateManager] Connected to data source for events: ${eventTypes.join(', ')}`);
  }

  /**
   * Disconnect from a data source - removes all event listeners
   * Use for cleanup in hot-reloading scenarios or component unmount
   * @param {EventTarget} dataSource - DataManager or StandaloneDataManager to disconnect
   */
  disconnectFromDataSource(dataSource) {
    const sourceListeners = this.connectedSources.get(dataSource);
    if (!sourceListeners) {
      this.debug?.log('[ScreenUpdateManager] No listeners found for data source, skipping disconnect');
      return;
    }

    for (const [eventType, handler] of sourceListeners) {
      dataSource.removeEventListener(eventType, handler);
    }

    this.connectedSources.delete(dataSource);
    this.debug?.log(`[ScreenUpdateManager] Disconnected from data source (${sourceListeners.size} listeners removed)`);
  }

  /**
   * Disconnect from all data sources - full cleanup
   * Use when tearing down the entire ScreenUpdateManager
   */
  disconnectAll() {
    for (const dataSource of this.connectedSources.keys()) {
      this.disconnectFromDataSource(dataSource);
    }
    this.debug?.log('[ScreenUpdateManager] Disconnected from all data sources');
  }
}

export default ScreenUpdateManager;
