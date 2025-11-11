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
        // Use dynamic base path to support orchestrator subdirectory serving
        // If served from https://IP:3000/gm-scanner/, this resolves to /gm-scanner/sw.js
        // If served locally, resolves to /sw.js or ./sw.js
        const swPath = new URL('sw.js', window.location.href).pathname;

        const registration = await navigatorObj.serviceWorker.register(swPath);
        Debug.log('Service Worker registered successfully');
        console.log('Service Worker registration successful:', registration.scope);
        return true;
    } catch (error) {
        // Check if this is an SSL certificate error (expected with self-signed certs)
        const isSSLError = error.name === 'SecurityError' &&
                          error.message.includes('SSL certificate error');

        if (isSSLError) {
            // SSL errors are expected when using self-signed certificates
            // Service Worker provides offline PWA functionality, not critical for networked mode
            Debug.log('Service Worker registration skipped due to SSL certificate (self-signed cert)');
            console.warn('Service Worker not available due to self-signed certificate. Offline features disabled.');
            return false;
        } else {
            // Other errors should still be reported
            Debug.log('Service Worker registration failed');
            console.error('Service Worker registration failed:', error);
            uiManager.showError('Service Worker registration failed. Offline features may not work.');
            return false;
        }
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
 * @param {Object} settings - Settings object with mode and save()
 * @returns {boolean} True if mode was applied, false otherwise
 */
function applyURLModeOverride(locationSearch, settings) {
    const urlParams = new URLSearchParams(locationSearch);
    const modeParam = urlParams.get('mode');

    if (modeParam === 'blackmarket' || modeParam === 'black-market') {
        settings.mode = 'blackmarket';
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
 * @returns {Object} Decision object with {screen, action, savedMode}
 */
function determineInitialScreen(sessionModeManager) {
    const savedMode = sessionModeManager.restoreMode();

    // Case 1: No saved mode (first-time user)
    if (!savedMode) {
        return { screen: 'gameModeScreen', action: null, savedMode: null };
    }

    // Case 2: Standalone mode - initialize and go to team entry
    if (savedMode === 'standalone') {
        return { screen: 'teamEntry', action: 'initStandalone', savedMode };
    }

    // Case 3: Networked mode - check if we have valid token for auto-connect
    if (savedMode === 'networked') {
        const token = localStorage.getItem('aln_auth_token');

        if (token && isTokenValid(token)) {
            // Valid token - try auto-connect
            return { screen: 'loading', action: 'autoConnect', savedMode };
        } else {
            // No valid token - need to show wizard
            return { screen: 'gameModeScreen', action: 'clearModeAndShowWizard', savedMode };
        }
    }

    // Fallback
    return { screen: 'gameModeScreen', action: null, savedMode: null };
}

/**
 * Check if JWT token is valid (not expired, with 1-minute buffer)
 * @param {string} token - JWT token string
 * @returns {boolean} True if valid
 * @private
 */
function isTokenValid(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return false;

        // Use atob for browser, Buffer for Node.js
        const decode = typeof atob !== 'undefined'
            ? (str) => atob(str)
            : (str) => Buffer.from(str, 'base64').toString();

        const payload = JSON.parse(decode(parts[1]));
        const expiry = payload.exp;
        if (!expiry) return false;

        const now = Math.floor(Date.now() / 1000);
        const buffer = 60; // 1-minute safety buffer
        return (expiry - buffer) > now;
    } catch (error) {
        return false;
    }
}

/**
 * Apply initial screen decision (executes side effects)
 * Handles UI changes, mode clearing, wizard display, and auto-connect
 *
 * @param {Object} decision - Decision from determineInitialScreen()
 * @param {Object} sessionModeManager - SessionModeManager instance
 * @param {Object} uiManager - UIManager instance
 * @param {Function} showWizardFn - showConnectionWizard function
 */
async function applyInitialScreenDecision(decision, sessionModeManager, uiManager, showWizardFn) {
    Debug.log(`Applying screen decision: screen=${decision.screen}, action=${decision.action}`);

    if (decision.action === 'clearModeAndShowWizard') {
        // Networked mode restored but no valid token - clear and show wizard
        Debug.warn('Networked mode restored but no valid token - showing wizard');
        sessionModeManager.clearMode();
        uiManager.showScreen(decision.screen);
        showWizardFn();

    } else if (decision.action === 'initStandalone') {
        // Standalone mode - initialize and show team entry
        Debug.log('Initializing standalone mode');
        sessionModeManager.initStandaloneMode();
        uiManager.showScreen(decision.screen);

    } else if (decision.action === 'autoConnect') {
        // Networked mode with valid token - attempt auto-connect
        Debug.log('Valid token found - attempting auto-connect');
        uiManager.showScreen(decision.screen); // Show loading screen

        try {
            // Initialize networked mode without showing wizard
            await sessionModeManager.initNetworkedMode();
            Debug.log('Auto-connect successful - showing team entry');
            uiManager.showScreen('teamEntry');
        } catch (error) {
            Debug.log('Auto-connect failed - showing wizard');
            console.error('Auto-connect error:', error);
            sessionModeManager.clearMode();
            uiManager.showScreen('gameModeScreen');
            showWizardFn();
        }

    } else {
        // Simple screen change, no special action needed
        Debug.log(`Showing initial screen: ${decision.screen}`);
        uiManager.showScreen(decision.screen);
    }
}

/**
 * Show loading screen with paint delay
 * Ensures loading screen is visible before JavaScript continues executing
 *
 * @param {Object} uiManager - UIManager instance
 * @returns {Promise<void>}
 */
async function showLoadingScreen(uiManager) {
    uiManager.showScreen('loading');
    // Ensure browser paints the loading screen before continuing
    await new Promise(resolve => setTimeout(resolve, 100));
    Debug.log('Loading screen displayed');
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
        applyInitialScreenDecision,
        showLoadingScreen
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
        applyInitialScreenDecision,
        showLoadingScreen
    };
}
