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
  renderPackInfo,
  applyPackStringsToDom,
  applyURLModeOverride,
  determineInitialScreen,
  applyInitialScreenDecision,
  showLoadingScreen,
  validateSettingsMode,
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
    it('should initialize UI with empty state (sync:full will populate data)', () => {
      // Production code no longer loads data locally - sync:full event populates everything
      loadDataManager(mockDataManager, mockUIManager);

      // Only updates UI badge - no data loading calls
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

    it('should NOT show an error toast for non-SSL errors (logs to Debug instead)', async () => {
      const genericError = new Error('Generic error');
      mockNavigator.serviceWorker.register.mockRejectedValue(genericError);

      const initialCount = Debug.messages.length;
      const result = await registerServiceWorker(mockNavigator, mockUIManager);

      expect(result).toBe(false);
      // A failed (non-critical) SW registration must never alarm the operator mid-show
      expect(mockUIManager.showError).not.toHaveBeenCalled();
      // ...but it must still be logged for diagnosis
      expect(Debug.messages.length).toBeGreaterThan(initialCount);
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

  describe('applyPackStringsToDom() (slice 3a — pack rewording of the static shell)', () => {
    const { applyPackStrings } = require('../../../src/core/strings.js');

    beforeEach(() => {
      document.body.innerHTML = `
        <h2 id="scanPrompt">Tap Memory Token</h2>
        <div id="teamValueLabel">Total Value</div>
        <div id="historyValueLabel">Total Value</div>
        <p id="scoreboard-evidence-hint">Awaiting evidence...</p>
      `;
    });

    afterEach(() => {
      applyPackStrings(null);
      document.body.innerHTML = '';
    });

    it('rewrites title, scan prompt, stat label, and evidence hint from the applied sidecar', () => {
      applyPackStrings({
        kind: 'strings',
        schemaVersion: 2,
        scanner: {
          appTitle: 'Fence Terminal',
          scanPrompt: 'Tap Loot Tag',
          statLabels: { totalValue: 'Total Haul' },
        },
        scoreboard: { emptyEvidence: 'Awaiting tips...' },
      });

      applyPackStringsToDom();

      expect(document.title).toBe('Fence Terminal');
      expect(document.getElementById('scanPrompt').textContent).toBe('Tap Loot Tag');
      expect(document.getElementById('teamValueLabel').textContent).toBe('Total Haul');
      expect(document.getElementById('historyValueLabel').textContent).toBe('Total Haul');
      expect(document.getElementById('scoreboard-evidence-hint').textContent).toBe('Awaiting tips...');
    });

    it('with no sidecar applied, rewrites the shell with the baked wording (no-op for ALN)', () => {
      applyPackStringsToDom();

      expect(document.title).toBe('Memory Transaction Station');
      expect(document.getElementById('scanPrompt').textContent).toBe('Tap Memory Token');
      expect(document.getElementById('teamValueLabel').textContent).toBe('Total Value');
      expect(document.getElementById('scoreboard-evidence-hint').textContent).toBe('Awaiting evidence...');
    });

    it('re-renders the static money seeds under the pack money spec (slice 3b)', () => {
      const { applyPackMoneyFormat } = require('../../../src/utils/formatCurrency.js');
      document.body.innerHTML += `
        <span id="teamBaseScore">$0</span>
        <span id="teamBonusScore">$0</span>
        <span id="teamTotalScore">$0</span>
      `;
      applyPackMoneyFormat('#,### cr');

      try {
        applyPackStringsToDom();
        expect(document.getElementById('teamBaseScore').textContent).toBe('0 cr');
        expect(document.getElementById('teamBonusScore').textContent).toBe('0 cr');
        expect(document.getElementById('teamTotalScore').textContent).toBe('0 cr');
      } finally {
        applyPackMoneyFormat(null);
      }
    });

    it('tolerates a partial DOM (elements absent) and a null document', () => {
      document.body.innerHTML = '';
      expect(() => applyPackStringsToDom()).not.toThrow();
      expect(() => applyPackStringsToDom(null)).not.toThrow();
    });

    it('Q1: rewrites the entity-noun statics from the declared entities.label (ALN: Team → Account)', () => {
      const { applyPackEntities, _resetForTesting } = require('../../../src/core/modeSemantics.js');
      document.body.innerHTML += `
        <h2 id="teamEntryTitle">Select Team</h2>
        <span id="currentTeamNoun">Team</span>
        <div id="uniqueTeamsLabel">Teams</div>
        <p id="scoreboardSubtitle">Team Rankings</p>
        <h3 id="adminScoreboardTitle">Team Scores</h3>
        <h2 id="teamDetailsTitle">Team Details</h2>
        <input id="teamNameInput" placeholder="Enter team name...">
        <button data-action="app.finishTeam">Finish Team</button>
        <button data-action="app.finishTeam">Finish Team</button>
      `;

      try {
        applyPackEntities({ entities: { label: { singular: 'Account', plural: 'Accounts' } } });
        applyPackStringsToDom();

        expect(document.getElementById('teamEntryTitle').textContent).toBe('Select Account');
        expect(document.getElementById('currentTeamNoun').textContent).toBe('Account');
        expect(document.getElementById('uniqueTeamsLabel').textContent).toBe('Accounts');
        expect(document.getElementById('scoreboardSubtitle').textContent).toBe('Account Rankings');
        expect(document.getElementById('adminScoreboardTitle').textContent).toBe('Account Scores');
        expect(document.getElementById('teamDetailsTitle').textContent).toBe('Account Details');
        expect(document.getElementById('teamNameInput').placeholder).toBe('Enter account name...');
        document.querySelectorAll('button[data-action="app.finishTeam"]').forEach((btn) => {
          expect(btn.textContent).toBe('Finish Account');
        });
        // CSS-rendered empty state reads the custom property (quoted CSS string)
        expect(document.documentElement.style.getPropertyValue('--entity-empty-team-list'))
          .toBe('"No accounts yet"');
      } finally {
        _resetForTesting();
        document.documentElement.style.removeProperty('--entity-empty-team-list');
      }
    });

    it('Q1: with no declared entities, the statics keep the baked Team wording byte-identical', () => {
      document.body.innerHTML += `
        <h2 id="teamEntryTitle">Select Team</h2>
        <input id="teamNameInput" placeholder="Enter team name...">
      `;

      applyPackStringsToDom();

      expect(document.getElementById('teamEntryTitle').textContent).toBe('Select Team');
      expect(document.getElementById('teamNameInput').placeholder).toBe('Enter team name...');
      expect(document.documentElement.style.getPropertyValue('--entity-empty-team-list'))
        .toBe('"No teams yet"');
      document.documentElement.style.removeProperty('--entity-empty-team-list');
    });

    it('loadTokenDatabase applies the pack wording to the DOM after a successful load', async () => {
      applyPackStrings({
        kind: 'strings', schemaVersion: 2, scanner: { scanPrompt: 'Tap Loot Tag' },
      });
      mockTokenManager.loadDatabase.mockResolvedValue(true);

      await loadTokenDatabase(mockTokenManager, mockUIManager);

      expect(document.getElementById('scanPrompt').textContent).toBe('Tap Loot Tag');
    });
  });

  describe('default-export completeness (structural — the L2 boot-failure class)', () => {
    it('every named function export is present on the default export object', async () => {
      // app.js consumes the DEFAULT export object; a named export missing
      // from it is invisible to jsdom unit tests (they mock the module)
      // and boots-fails the real app ("...is not a function" at init —
      // caught by L2 when validateSettingsMode was first left off).
      const mod = await import('../../../src/app/initializationSteps.js');
      const named = Object.keys(mod).filter(
        (k) => k !== 'default' && typeof mod[k] === 'function'
      );
      const missing = named.filter((k) => typeof mod.default[k] !== 'function');
      expect(missing).toEqual([]);
    });
  });

  describe('validateSettingsMode() (slice 1 — stale saved mode resets to the pack default)', () => {
    let mockSettings;

    beforeEach(() => {
      mockSettings = { mode: 'detective', save: jest.fn() };
    });

    it('keeps a persisted mode the active pack declares (no reset, no save)', () => {
      const reset = validateSettingsMode(mockSettings);

      expect(reset).toBe(false);
      expect(mockSettings.mode).toBe('detective');
      expect(mockSettings.save).not.toHaveBeenCalled();
    });

    it('RESETS a stale persisted id to the pack FIRST declared mode with a loud log', () => {
      mockSettings.mode = 'constellation'; // pack switched under a saved setting
      const initialCount = Debug.messages.length;

      const reset = validateSettingsMode(mockSettings);

      expect(reset).toBe(true);
      expect(mockSettings.mode).toBe('blackmarket'); // ALN table modes[0]
      expect(mockSettings.save).toHaveBeenCalled();
      expect(Debug.messages.length).toBeGreaterThan(initialCount);
      expect(Debug.messages.some((m) => String(m).includes('STALE MODE RESET'))).toBe(true);
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

    it('applies ?mode=detective too (slice 1: any pack-declared id is a valid override)', () => {
      const result = applyURLModeOverride('?mode=detective', mockSettings);

      expect(result).toBe(true);
      expect(mockSettings.mode).toBe('detective');
      expect(mockSettings.save).toHaveBeenCalled();
    });

    it('REFUSES an id the active pack does not declare (loud, never applied blind)', () => {
      const result = applyURLModeOverride('?mode=constellation', mockSettings);

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

    it('should run the FULL standalone initializer when action is initStandalone (F-GMS-01)', async () => {
      // A standalone restore after page reload must do everything fresh
      // selection does (strategy init, registry wiring, body class) — not just
      // setMode + showScreen. The full initializer is injected by App.init().
      const decision = { screen: 'teamEntry', action: 'initStandalone', savedMode: 'standalone' };
      const mockInitStandaloneMode = jest.fn().mockResolvedValue(undefined);

      await applyInitialScreenDecision(
        decision, mockSessionModeManager, mockUIManager, mockShowWizard,
        null, mockInitStandaloneMode
      );

      // Full initializer invoked, preserving the persisted session
      expect(mockInitStandaloneMode).toHaveBeenCalledTimes(1);
      expect(mockInitStandaloneMode).toHaveBeenCalledWith({ preserveSession: true });
      // The initializer owns setMode + showScreen — no duplicate calls here
      expect(mockSessionModeManager.setMode).not.toHaveBeenCalled();
      expect(mockShowWizard).not.toHaveBeenCalled();
    });

    it('should fall back to setMode + showScreen when no standalone initializer is provided', async () => {
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

      // Phase 1H: Load DataManager (sync:full will populate data)
      loadDataManager(mockDataManager, mockUIManager);
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

describe('renderPackInfo (Phase 3 A2 staleness visibility)', () => {
  const PACK_DOM = `
    <div class="device-id" id="packInfoLine" style="display: none;">Pack:
      <span id="packInfoDisplay"></span>
      <span id="packBundledBadge" style="display: none;">⚠ bundled</span>
    </div>`;

  function stubLoader(info) {
    return { getActivePack: jest.fn(() => info) };
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders `<version> (<hash-prefix>) · <source>` and reveals the line', () => {
    document.body.innerHTML = PACK_DOM;
    renderPackInfo(stubLoader({
      packId: 'about-last-night',
      version: '1.2.0',
      contentHash: `sha256:${'a'.repeat(64)}`,
      source: 'network',
    }), 'pack');

    expect(document.getElementById('packInfoDisplay').textContent)
      .toBe('1.2.0 (aaaaaaaa) · network');
    expect(document.getElementById('packInfoLine').style.display).toBe('');
    expect(document.getElementById('packBundledBadge').style.display).toBe('none');
  });

  it('shows the warning badge for the bundled source, with null-identity fallbacks', () => {
    document.body.innerHTML = PACK_DOM;
    renderPackInfo(stubLoader({
      packId: null, version: null, contentHash: null, source: 'bundled',
    }), 'baked');

    expect(document.getElementById('packInfoDisplay').textContent)
      .toBe('unknown (no-hash) · bundled · scoring: baked');
    expect(document.getElementById('packBundledBadge').style.display).toBe('');
  });

  it('flags baked scoring even when the pack itself came from the network (PR #12 review)', () => {
    // A network-sourced pack that ships no game.json still runs the L2
    // scoring shim — the operator must see that on the pack line, not
    // only in the console warn.
    document.body.innerHTML = PACK_DOM;
    renderPackInfo(stubLoader({
      packId: 'about-last-night',
      version: '1.2.0',
      contentHash: `sha256:${'b'.repeat(64)}`,
      source: 'network',
    }), 'baked');

    expect(document.getElementById('packInfoDisplay').textContent)
      .toBe('1.2.0 (bbbbbbbb) · network · scoring: baked');
  });

  it('is a no-op before any pack load (null info)', () => {
    document.body.innerHTML = PACK_DOM;
    renderPackInfo(stubLoader(null));
    expect(document.getElementById('packInfoLine').style.display).toBe('none');
  });

  it('is a no-op when the settings DOM is absent (headless harnesses)', () => {
    document.body.innerHTML = '';
    expect(() => renderPackInfo(stubLoader({
      packId: 'x', version: '1', contentHash: null, source: 'cache',
    }))).not.toThrow();
  });
});
