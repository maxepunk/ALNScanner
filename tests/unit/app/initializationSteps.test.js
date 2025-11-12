/**
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
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
} from '../../../src/app/initializationSteps.js';
import Debug from '../../../src/utils/debug.js';

describe('InitializationSteps - ES6 Module', () => {
  let mockUIManager;
  let mockSessionModeManager;
  let mockViewController;
  let mockSettings;
  let mockDataManager;
  let mockNFCHandler;
  let mockTokenManager;
  let mockNavigator;
  let mockWindow;

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();
    jest.clearAllMocks();

    // Clear Debug messages
    Debug.clear();

    // Setup mock objects
    mockUIManager = {
      init: jest.fn(),
      showScreen: jest.fn(),
      showError: jest.fn(),
      updateHistoryBadge: jest.fn()
    };

    mockSessionModeManager = {
      restoreMode: jest.fn(),
      clearMode: jest.fn(),
      setMode: jest.fn(),
      initStandaloneMode: jest.fn(),
      initNetworkedMode: jest.fn()
    };

    mockViewController = {
      init: jest.fn()
    };

    mockSettings = {
      load: jest.fn(),
      save: jest.fn(),
      mode: 'detective'
    };

    mockDataManager = {
      loadTransactions: jest.fn(),
      loadScannedTokens: jest.fn()
    };

    mockNFCHandler = {
      init: jest.fn()
    };

    mockTokenManager = {
      loadDatabase: jest.fn()
    };

    mockNavigator = {
      serviceWorker: {
        register: jest.fn()
      }
    };

    mockWindow = {
      sessionModeManager: null,
      location: {
        href: 'https://localhost:3000/gm-scanner/'
      }
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('initializeUIManager()', () => {
    it('should call uiManager.init()', () => {
      initializeUIManager(mockUIManager);
      expect(mockUIManager.init).toHaveBeenCalledTimes(1);
    });
  });

  describe('createSessionModeManager()', () => {
    it('should create SessionModeManager instance and return it', () => {
      class MockSessionModeManager {
        constructor() {
          this.mode = null;
          this.locked = false;
        }
      }

      const instance = createSessionModeManager(MockSessionModeManager);

      expect(instance).toBeInstanceOf(MockSessionModeManager);
    });

    it('should log initialization message', () => {
      class MockSessionModeManager {}

      createSessionModeManager(MockSessionModeManager);

      // Check that a log message was created (don't test implementation)
      expect(Debug.messages.length).toBeGreaterThan(0);
    });
  });

  describe('initializeViewController()', () => {
    it('should call viewController.init()', () => {
      initializeViewController(mockViewController);
      expect(mockViewController.init).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadSettings()', () => {
    it('should call settings.load()', () => {
      loadSettings(mockSettings);
      expect(mockSettings.load).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadDataManager()', () => {
    it('should load transactions and scanned tokens', () => {
      loadDataManager(mockDataManager, mockUIManager);

      expect(mockDataManager.loadTransactions).toHaveBeenCalledTimes(1);
      expect(mockDataManager.loadScannedTokens).toHaveBeenCalledTimes(1);
    });

    it('should update history badge', () => {
      loadDataManager(mockDataManager, mockUIManager);

      expect(mockUIManager.updateHistoryBadge).toHaveBeenCalledTimes(1);
    });
  });

  describe('detectNFCSupport()', () => {
    it('should return true when NFC is supported', async () => {
      mockNFCHandler.init.mockResolvedValue(true);

      const result = await detectNFCSupport(mockNFCHandler);

      expect(result).toBe(true);
      expect(mockNFCHandler.init).toHaveBeenCalledTimes(1);
    });

    it('should return false when NFC is not supported', async () => {
      mockNFCHandler.init.mockResolvedValue(false);

      const result = await detectNFCSupport(mockNFCHandler);

      expect(result).toBe(false);
      expect(mockNFCHandler.init).toHaveBeenCalledTimes(1);
    });

    it('should log NFC support status', async () => {
      const initialCount = Debug.messages.length;
      mockNFCHandler.init.mockResolvedValue(true);

      await detectNFCSupport(mockNFCHandler);

      expect(Debug.messages.length).toBeGreaterThan(initialCount);
    });
  });

  describe('registerServiceWorker()', () => {
    it('should return false when serviceWorker is not available', async () => {
      const navWithoutSW = {};

      const result = await registerServiceWorker(navWithoutSW, mockUIManager);

      expect(result).toBe(false);
    });

    it('should register service worker successfully', async () => {
      const mockRegistration = { scope: '/sw.js' };
      mockNavigator.serviceWorker.register.mockResolvedValue(mockRegistration);

      const result = await registerServiceWorker(mockNavigator, mockUIManager);

      expect(result).toBe(true);
      // Path will be computed from window.location.href, just verify it was called
      expect(mockNavigator.serviceWorker.register).toHaveBeenCalledTimes(1);
    });

    it('should handle SSL certificate errors gracefully', async () => {
      const sslError = new Error('SSL certificate error in validation');
      sslError.name = 'SecurityError';
      mockNavigator.serviceWorker.register.mockRejectedValue(sslError);

      const result = await registerServiceWorker(mockNavigator, mockUIManager);

      expect(result).toBe(false);
      expect(mockUIManager.showError).not.toHaveBeenCalled();
    });

    it('should show error for non-SSL errors', async () => {
      const genericError = new Error('Generic error');
      mockNavigator.serviceWorker.register.mockRejectedValue(genericError);

      const result = await registerServiceWorker(mockNavigator, mockUIManager);

      expect(result).toBe(false);
      expect(mockUIManager.showError).toHaveBeenCalledWith(
        'Service Worker registration failed. Offline features may not work.'
      );
    });
  });

  describe('loadTokenDatabase()', () => {
    it('should return true when database loads successfully', async () => {
      mockTokenManager.loadDatabase.mockResolvedValue(true);

      const result = await loadTokenDatabase(mockTokenManager, mockUIManager);

      expect(result).toBe(true);
      expect(mockTokenManager.loadDatabase).toHaveBeenCalledTimes(1);
    });

    it('should throw error when database fails to load', async () => {
      mockTokenManager.loadDatabase.mockResolvedValue(false);

      await expect(loadTokenDatabase(mockTokenManager, mockUIManager)).rejects.toThrow(
        'Token database initialization failed'
      );
    });

    it('should show error message when database fails to load', async () => {
      mockTokenManager.loadDatabase.mockResolvedValue(false);

      try {
        await loadTokenDatabase(mockTokenManager, mockUIManager);
      } catch (error) {
        // Expected error
      }

      expect(mockUIManager.showError).toHaveBeenCalledWith(
        'CRITICAL: Token database failed to load. Cannot initialize scanner.'
      );
    });

    it('should log error when database fails to load', async () => {
      const initialCount = Debug.messages.length;
      mockTokenManager.loadDatabase.mockResolvedValue(false);

      try {
        await loadTokenDatabase(mockTokenManager, mockUIManager);
      } catch (error) {
        // Expected error
      }

      // Should have logged an error message
      expect(Debug.messages.length).toBeGreaterThan(initialCount);
    });
  });

  describe('applyURLModeOverride()', () => {
    it('should set blackmarket mode when ?mode=blackmarket is present', () => {
      const result = applyURLModeOverride('?mode=blackmarket', mockSettings);

      expect(result).toBe(true);
      expect(mockSettings.mode).toBe('blackmarket');
      expect(mockSettings.save).toHaveBeenCalledTimes(1);
    });

    it('should set blackmarket mode when ?mode=black-market is present', () => {
      const result = applyURLModeOverride('?mode=black-market', mockSettings);

      expect(result).toBe(true);
      expect(mockSettings.mode).toBe('blackmarket');
      expect(mockSettings.save).toHaveBeenCalledTimes(1);
    });

    it('should return false when no mode parameter is present', () => {
      const result = applyURLModeOverride('', mockSettings);

      expect(result).toBe(false);
      expect(mockSettings.save).not.toHaveBeenCalled();
    });

    it('should return false when mode parameter is different', () => {
      const result = applyURLModeOverride('?mode=detective', mockSettings);

      expect(result).toBe(false);
      expect(mockSettings.save).not.toHaveBeenCalled();
    });

    it('should log when blackmarket mode is set', () => {
      const initialCount = Debug.messages.length;

      applyURLModeOverride('?mode=blackmarket', mockSettings);

      expect(Debug.messages.length).toBeGreaterThan(initialCount);
    });
  });

  describe('determineInitialScreen()', () => {
    it('should return gameModeScreen when no saved mode exists', () => {
      mockSessionModeManager.restoreMode.mockReturnValue(null);

      const decision = determineInitialScreen(mockSessionModeManager);

      expect(decision).toEqual({
        screen: 'gameModeScreen',
        action: null,
        savedMode: null
      });
    });

    it('should return teamEntry with initStandalone action for standalone mode', () => {
      mockSessionModeManager.restoreMode.mockReturnValue('standalone');

      const decision = determineInitialScreen(mockSessionModeManager);

      expect(decision).toEqual({
        screen: 'teamEntry',
        action: 'initStandalone',
        savedMode: 'standalone'
      });
    });

    it('should return loading with autoConnect action when valid token exists', () => {
      mockSessionModeManager.restoreMode.mockReturnValue('networked');

      // Create a valid token (expires in 2 hours)
      const payload = { exp: Math.floor(Date.now() / 1000) + 7200 };
      const encodedPayload = typeof btoa !== 'undefined'
        ? btoa(JSON.stringify(payload))
        : Buffer.from(JSON.stringify(payload)).toString('base64');
      const validToken = `header.${encodedPayload}.signature`;

      localStorage.setItem('aln_auth_token', validToken);

      const decision = determineInitialScreen(mockSessionModeManager);

      expect(decision).toEqual({
        screen: 'loading',
        action: 'autoConnect',
        savedMode: 'networked'
      });
    });

    it('should return gameModeScreen with clearModeAndShowWizard when token is expired', () => {
      mockSessionModeManager.restoreMode.mockReturnValue('networked');

      // Create an expired token
      const payload = { exp: Math.floor(Date.now() / 1000) - 3600 };
      const encodedPayload = typeof btoa !== 'undefined'
        ? btoa(JSON.stringify(payload))
        : Buffer.from(JSON.stringify(payload)).toString('base64');
      const expiredToken = `header.${encodedPayload}.signature`;

      localStorage.setItem('aln_auth_token', expiredToken);

      const decision = determineInitialScreen(mockSessionModeManager);

      expect(decision).toEqual({
        screen: 'gameModeScreen',
        action: 'clearModeAndShowWizard',
        savedMode: 'networked'
      });
    });

    it('should return gameModeScreen with clearModeAndShowWizard when no token exists', () => {
      mockSessionModeManager.restoreMode.mockReturnValue('networked');

      const decision = determineInitialScreen(mockSessionModeManager);

      expect(decision).toEqual({
        screen: 'gameModeScreen',
        action: 'clearModeAndShowWizard',
        savedMode: 'networked'
      });
    });

    it('should return gameModeScreen when token is invalid format', () => {
      mockSessionModeManager.restoreMode.mockReturnValue('networked');
      localStorage.setItem('aln_auth_token', 'invalid-token');

      const decision = determineInitialScreen(mockSessionModeManager);

      expect(decision).toEqual({
        screen: 'gameModeScreen',
        action: 'clearModeAndShowWizard',
        savedMode: 'networked'
      });
    });

    it('should reject token expiring within 1-minute buffer', () => {
      mockSessionModeManager.restoreMode.mockReturnValue('networked');

      // Create a token expiring in 30 seconds (within 1-minute buffer)
      const payload = { exp: Math.floor(Date.now() / 1000) + 30 };
      const encodedPayload = typeof btoa !== 'undefined'
        ? btoa(JSON.stringify(payload))
        : Buffer.from(JSON.stringify(payload)).toString('base64');
      const tokenNearExpiry = `header.${encodedPayload}.signature`;

      localStorage.setItem('aln_auth_token', tokenNearExpiry);

      const decision = determineInitialScreen(mockSessionModeManager);

      expect(decision).toEqual({
        screen: 'gameModeScreen',
        action: 'clearModeAndShowWizard',
        savedMode: 'networked'
      });
    });
  });

  describe('applyInitialScreenDecision()', () => {
    let mockShowWizard;

    beforeEach(() => {
      mockShowWizard = jest.fn();
    });

    it('should show screen without action when action is null', async () => {
      const decision = { screen: 'gameModeScreen', action: null, savedMode: null };

      await applyInitialScreenDecision(decision, mockSessionModeManager, mockUIManager, mockShowWizard);

      expect(mockUIManager.showScreen).toHaveBeenCalledWith('gameModeScreen');
      expect(mockSessionModeManager.clearMode).not.toHaveBeenCalled();
      expect(mockShowWizard).not.toHaveBeenCalled();
    });

    it('should clear mode and show wizard when action is clearModeAndShowWizard', async () => {
      const decision = { screen: 'gameModeScreen', action: 'clearModeAndShowWizard', savedMode: 'networked' };

      await applyInitialScreenDecision(decision, mockSessionModeManager, mockUIManager, mockShowWizard);

      expect(mockSessionModeManager.clearMode).toHaveBeenCalledTimes(1);
      expect(mockUIManager.showScreen).toHaveBeenCalledWith('gameModeScreen');
      expect(mockShowWizard).toHaveBeenCalledTimes(1);
    });

    it('should initialize standalone mode when action is initStandalone', async () => {
      const decision = { screen: 'teamEntry', action: 'initStandalone', savedMode: 'standalone' };

      await applyInitialScreenDecision(decision, mockSessionModeManager, mockUIManager, mockShowWizard);

      expect(mockSessionModeManager.setMode).toHaveBeenCalledWith('standalone');
      expect(mockUIManager.showScreen).toHaveBeenCalledWith('teamEntry');
      expect(mockShowWizard).not.toHaveBeenCalled();
    });

    it('should auto-connect successfully when action is autoConnect', async () => {
      const decision = { screen: 'loading', action: 'autoConnect', savedMode: 'networked' };
      const mockInitNetworkedMode = jest.fn().mockResolvedValue(undefined);

      await applyInitialScreenDecision(decision, mockSessionModeManager, mockUIManager, mockShowWizard, mockInitNetworkedMode);

      expect(mockUIManager.showScreen).toHaveBeenCalledWith('loading');
      expect(mockSessionModeManager.setMode).toHaveBeenCalledWith('networked');
      expect(mockInitNetworkedMode).toHaveBeenCalledTimes(1);
      expect(mockUIManager.showScreen).toHaveBeenCalledWith('teamEntry');
      expect(mockShowWizard).not.toHaveBeenCalled();
    });

    it('should handle auto-connect failure by showing wizard', async () => {
      const decision = { screen: 'loading', action: 'autoConnect', savedMode: 'networked' };
      const mockInitNetworkedMode = jest.fn().mockRejectedValue(new Error('Connection failed'));

      await applyInitialScreenDecision(decision, mockSessionModeManager, mockUIManager, mockShowWizard, mockInitNetworkedMode);

      expect(mockUIManager.showScreen).toHaveBeenCalledWith('loading');
      expect(mockSessionModeManager.clearMode).toHaveBeenCalledTimes(1);
      expect(mockUIManager.showScreen).toHaveBeenCalledWith('gameModeScreen');
      expect(mockShowWizard).toHaveBeenCalledTimes(1);
    });

    it('should log decision being applied', async () => {
      const initialCount = Debug.messages.length;
      const decision = { screen: 'gameModeScreen', action: null, savedMode: null };

      await applyInitialScreenDecision(decision, mockSessionModeManager, mockUIManager, mockShowWizard);

      expect(Debug.messages.length).toBeGreaterThan(initialCount);
    });
  });

  describe('showLoadingScreen()', () => {
    it('should show loading screen', async () => {
      await showLoadingScreen(mockUIManager);

      expect(mockUIManager.showScreen).toHaveBeenCalledWith('loading');
    });

    it('should wait for paint delay', async () => {
      const start = Date.now();
      await showLoadingScreen(mockUIManager);
      const duration = Date.now() - start;

      // Should wait at least 100ms
      expect(duration).toBeGreaterThanOrEqual(90); // Allow small timing variance
    });

    it('should log after loading screen is displayed', async () => {
      const initialCount = Debug.messages.length;

      await showLoadingScreen(mockUIManager);

      expect(Debug.messages.length).toBeGreaterThan(initialCount);
    });
  });

  describe('Integration - Full Initialization Flow', () => {
    it('should handle complete initialization sequence', async () => {
      // Phase 1D: Initialize UIManager
      initializeUIManager(mockUIManager);
      expect(mockUIManager.init).toHaveBeenCalledTimes(1);

      // Phase 0: Show loading screen
      await showLoadingScreen(mockUIManager);
      expect(mockUIManager.showScreen).toHaveBeenCalledWith('loading');

      // Phase 1E: Create SessionModeManager
      class MockSessionModeManager {}
      createSessionModeManager(MockSessionModeManager, mockWindow);
      expect(mockWindow.sessionModeManager).toBeDefined();

      // Phase 1F: Initialize view controller
      initializeViewController(mockViewController);
      expect(mockViewController.init).toHaveBeenCalledTimes(1);

      // Phase 1G: Load settings
      loadSettings(mockSettings);
      expect(mockSettings.load).toHaveBeenCalledTimes(1);

      // Phase 1H: Load DataManager
      loadDataManager(mockDataManager, mockUIManager);
      expect(mockDataManager.loadTransactions).toHaveBeenCalledTimes(1);
      expect(mockDataManager.loadScannedTokens).toHaveBeenCalledTimes(1);
      expect(mockUIManager.updateHistoryBadge).toHaveBeenCalledTimes(1);

      // Phase 1I: Detect NFC support
      mockNFCHandler.init.mockResolvedValue(true);
      const nfcSupported = await detectNFCSupport(mockNFCHandler);
      expect(nfcSupported).toBe(true);

      // Phase 1A: Load token database
      mockTokenManager.loadDatabase.mockResolvedValue(true);
      const dbLoaded = await loadTokenDatabase(mockTokenManager, mockUIManager);
      expect(dbLoaded).toBe(true);

      // Phase 1B: Apply URL mode override
      const modeOverridden = applyURLModeOverride('?mode=blackmarket', mockSettings);
      expect(modeOverridden).toBe(true);
      expect(mockSettings.mode).toBe('blackmarket');

      // Phase 1J: Register service worker
      mockNavigator.serviceWorker.register.mockResolvedValue({ scope: '/' });
      const swRegistered = await registerServiceWorker(mockNavigator, mockUIManager);
      expect(swRegistered).toBe(true);

      // Phase 1C: Determine and apply initial screen
      mockSessionModeManager.restoreMode.mockReturnValue('standalone');
      const decision = determineInitialScreen(mockSessionModeManager);
      expect(decision.screen).toBe('teamEntry');
      expect(decision.action).toBe('initStandalone');
    });

    it('should handle initialization failure gracefully', async () => {
      mockTokenManager.loadDatabase.mockResolvedValue(false);

      await expect(loadTokenDatabase(mockTokenManager, mockUIManager)).rejects.toThrow();
      expect(mockUIManager.showError).toHaveBeenCalled();
    });
  });
});
