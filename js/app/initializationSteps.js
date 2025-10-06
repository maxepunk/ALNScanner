/**
 * Initialization Steps Module
 * Extracted initialization functions from App.init() for testability
 *
 * Phase 1A: Token Database Loading
 * Phase 1B: URL Parameter Mode Override
 * Phase 1C: Connection Restoration Logic
 * Phase 1D-1I: Module Initialization Functions
 */

/**
 * Initialize UIManager
 * Simple wrapper for UIManager.init()
 *
 * @param {Object} uiManager - UIManager instance
 */
function initializeUIManager(uiManager) {
    uiManager.init();
}

/**
 * Create SessionModeManager and attach to window
 * CRITICAL: Must be called before viewController.init()
 *
 * @param {Function} SessionModeManagerClass - SessionModeManager constructor
 * @param {Object} windowObj - Window object
 */
function createSessionModeManager(SessionModeManagerClass, windowObj) {
    windowObj.sessionModeManager = new SessionModeManagerClass();
    Debug.log('SessionModeManager initialized');
}

/**
 * Initialize view controller
 * Depends on window.sessionModeManager existing
 *
 * @param {Object} viewController - ViewController instance
 */
function initializeViewController(viewController) {
    viewController.init();
}

/**
 * Load settings from localStorage
 *
 * @param {Object} settings - Settings object
 */
function loadSettings(settings) {
    settings.load();
}

/**
 * Load DataManager transaction history and update UI
 *
 * @param {Object} dataManager - DataManager instance
 * @param {Object} uiManager - UIManager instance
 */
function loadDataManager(dataManager, uiManager) {
    dataManager.loadTransactions();
    dataManager.loadScannedTokens();
    uiManager.updateHistoryBadge();
}

/**
 * Detect NFC support
 *
 * @param {Object} nfcHandler - NFCHandler instance
 * @returns {Promise<boolean>} True if NFC is supported
 */
async function detectNFCSupport(nfcHandler) {
    const supported = await nfcHandler.init();
    Debug.log(`NFC support: ${supported}`);
    return supported;
}

/**
 * Register service worker for PWA functionality
 *
 * @param {Object} navigatorObj - Navigator object
 * @param {Object} uiManager - UIManager instance
 * @returns {Promise<boolean>} True if registration succeeded
 */
async function registerServiceWorker(navigatorObj, uiManager) {
    if (!('serviceWorker' in navigatorObj)) {
        return false;
    }

    try {
        const registration = await navigatorObj.serviceWorker.register('./sw.js');
        Debug.log('Service Worker registered successfully');
        console.log('Service Worker registration successful:', registration.scope);
        return true;
    } catch (error) {
        Debug.log('Service Worker registration failed');
        console.error('Service Worker registration failed:', error);
        uiManager.showError('Service Worker registration failed. Offline features may not work.');
        return false;
    }
}

/**
 * Load token database from TokenManager
 *
 * @param {Object} tokenManager - TokenManager instance
 * @param {Object} uiManager - UIManager instance
 * @returns {Promise<boolean>} True if database loaded successfully
 * @throws {Error} If database load fails
 */
async function loadTokenDatabase(tokenManager, uiManager) {
    const dbLoaded = await tokenManager.loadDatabase();

    if (!dbLoaded) {
        const errorMsg = 'CRITICAL: Token database failed to load. Cannot initialize scanner.';
        Debug.error(errorMsg);
        uiManager.showError(errorMsg);
        throw new Error('Token database initialization failed');
    }

    Debug.log('Token database loaded successfully');
    return true;
}

/**
 * Apply URL parameter mode override
 * Checks for ?mode=blackmarket or ?mode=black-market and sets station mode
 *
 * @param {string} locationSearch - window.location.search (query string)
 * @param {Object} settings - Settings object with stationMode and save()
 * @returns {boolean} True if mode was applied, false otherwise
 */
function applyURLModeOverride(locationSearch, settings) {
    const urlParams = new URLSearchParams(locationSearch);
    const modeParam = urlParams.get('mode');

    if (modeParam === 'blackmarket' || modeParam === 'black-market') {
        settings.stationMode = 'blackmarket';
        settings.save();
        Debug.log('Station mode set to blackmarket via URL parameter');
        return true;
    }

    return false;
}

/**
 * Determine initial screen based on connection restoration logic
 * Pure function - no side effects, only decision logic
 *
 * @param {Object} sessionModeManager - SessionModeManager instance
 * @returns {Object} Decision object with {screen, action}
 */
function determineInitialScreen(sessionModeManager) {
    const savedMode = sessionModeManager.restoreMode();

    // Case 1: No saved mode (first-time user)
    if (!savedMode) {
        return { screen: 'gameModeScreen', action: null };
    }

    // Case 2: Has saved mode - check if connection still valid
    if (!sessionModeManager.isConnectionReady()) {
        // Connection lost - need to clear mode and show wizard
        return {
            screen: 'gameModeScreen',
            action: 'clearModeAndShowWizard'
        };
    }

    // Case 3: Saved mode + connection ready - proceed to team entry
    return { screen: 'teamEntry', action: null };
}

/**
 * Apply initial screen decision (executes side effects)
 * Handles UI changes, mode clearing, and wizard display
 *
 * @param {Object} decision - Decision from determineInitialScreen()
 * @param {Object} sessionModeManager - SessionModeManager instance
 * @param {Object} uiManager - UIManager instance
 * @param {Function} showWizardFn - showConnectionWizard function
 */
function applyInitialScreenDecision(decision, sessionModeManager, uiManager, showWizardFn) {
    if (decision.action === 'clearModeAndShowWizard') {
        // Connection was restored but is now lost
        Debug.warn('Networked mode restored but connection lost - showing wizard');
        sessionModeManager.clearMode();
        uiManager.showScreen(decision.screen);
        showWizardFn();
    } else {
        // Simple screen change, no special action needed
        Debug.log(`Showing initial screen: ${decision.screen}`);
        uiManager.showScreen(decision.screen);
    }
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeUIManager,
        createSessionModeManager,
        initializeViewController,
        loadSettings,
        loadDataManager,
        detectNFCSupport,
        registerServiceWorker,
        loadTokenDatabase,
        applyURLModeOverride,
        determineInitialScreen,
        applyInitialScreenDecision
    };
}

// Export for browser
if (typeof window !== 'undefined') {
    window.InitializationSteps = {
        initializeUIManager,
        createSessionModeManager,
        initializeViewController,
        loadSettings,
        loadDataManager,
        detectNFCSupport,
        registerServiceWorker,
        loadTokenDatabase,
        applyURLModeOverride,
        determineInitialScreen,
        applyInitialScreenDecision
    };
}
