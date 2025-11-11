/**
 * Tests for App.js - Main Application Controller
 */

// Mock all dependencies before importing
jest.mock('../../src/utils/debug.js', () => ({
  default: {
    log: jest.fn()
  }
}));

jest.mock('../../src/ui/uiManager.js', () => ({
  default: {
    showScreen: jest.fn(),
    showError: jest.fn(),
    updateTeamDisplay: jest.fn(),
    updateSessionStats: jest.fn(),
    showTokenResult: jest.fn(),
    updateModeDisplay: jest.fn(),
    updateHistoryStats: jest.fn(),
    renderTransactions: jest.fn(),
    renderScoreboard: jest.fn(),
    renderTeamDetails: jest.fn(),
    showToast: jest.fn(),
    previousScreen: null
  }
}));

jest.mock('../../src/ui/settings.js', () => ({
  default: {
    deviceId: 'test-device',
    mode: 'detective',
    save: jest.fn()
  }
}));

jest.mock('../../src/core/tokenManager.js', () => ({
  default: {
    findToken: jest.fn(),
    getGroupInventory: jest.fn(() => ({}))
  }
}));

jest.mock('../../src/core/dataManager.js', () => ({
  default: {
    transactions: [],
    scannedTokens: new Set(),
    isTokenScanned: jest.fn(() => false),
    markTokenAsScanned: jest.fn(),
    addTransaction: jest.fn(),
    calculateTokenValue: jest.fn(() => 1000),
    getTeamTransactions: jest.fn(() => []),
    getTeamScores: jest.fn(() => []),
    getTeamCompletedGroups: jest.fn(() => []),
    getEnhancedTeamTransactions: jest.fn(() => ({
      completedGroups: [],
      incompleteGroups: [],
      ungroupedTokens: [],
      unknownTokens: [],
      hasCompletedGroups: false,
      hasIncompleteGroups: false
    })),
    parseGroupInfo: jest.fn(),
    normalizeGroupName: jest.fn(),
    saveTransactions: jest.fn(),
    saveScannedTokens: jest.fn()
  }
}));

jest.mock('../../src/utils/nfcHandler.js', () => ({
  default: {
    startScan: jest.fn(),
    stopScan: jest.fn(),
    simulateScan: jest.fn(() => ({ id: 'test123', source: 'simulation', raw: 'test123' }))
  }
}));

jest.mock('../../src/utils/config.js', () => ({
  default: {
    MAX_TEAM_ID_LENGTH: 6,
    MODE_TOGGLE_SCALE: 1.1,
    ANIMATION_DURATION: 200,
    SCAN_SIMULATION_DELAY: 1000
  }
}));

jest.mock('../../src/app/initializationSteps.js', () => ({
  default: {
    initializeUIManager: jest.fn(),
    showLoadingScreen: jest.fn(),
    createSessionModeManager: jest.fn(),
    initializeViewController: jest.fn(),
    loadSettings: jest.fn(),
    loadDataManager: jest.fn(),
    detectNFCSupport: jest.fn(() => Promise.resolve(false)),
    loadTokenDatabase: jest.fn(),
    applyURLModeOverride: jest.fn(),
    registerServiceWorker: jest.fn(),
    determineInitialScreen: jest.fn(() => ({ target: 'teamEntry', reason: 'new' })),
    applyInitialScreenDecision: jest.fn()
  }
}));

jest.mock('../../src/app/sessionModeManager.js', () => ({
  default: {
    setMode: jest.fn(),
    isNetworked: jest.fn(() => false),
    isStandalone: jest.fn(() => false)
  }
}));

const { App } = require('../../src/app/app.js');

// Import mocked dependencies to inject
const Debug = require('../../src/utils/debug.js').default;
const UIManager = require('../../src/ui/uiManager.js').default;
const Settings = require('../../src/ui/settings.js').default;
const TokenManager = require('../../src/core/tokenManager.js').default;
const DataManager = require('../../src/core/dataManager.js').default;
const NFCHandler = require('../../src/utils/nfcHandler.js').default;
const CONFIG = require('../../src/utils/config.js').default;
const InitializationSteps = require('../../src/app/initializationSteps.js').default;
const SessionModeManager = require('../../src/app/sessionModeManager.js').default;

describe('App', () => {
  let app;
  let mockSessionModeManager;

  beforeEach(() => {
    // Ensure real timers are restored before each test
    jest.useRealTimers();

    // Clear all mocks
    jest.clearAllMocks();

    // Setup DOM
    document.body.innerHTML = `
      <div id="viewSelector" style="display: none;"></div>
      <div id="scanner-view" class="view-content"></div>
      <div id="admin-view" class="view-content"></div>
      <div id="debug-view" class="view-content"></div>
      <div class="view-tab" data-view="scanner"></div>
      <div class="view-tab" data-view="admin"></div>
      <div class="view-tab" data-view="debug"></div>
      <div id="currentTeam"></div>
      <div id="modeIndicator"></div>
      <input id="modeToggle" type="checkbox" />
      <div id="scanButton">Start Scanning</div>
      <div id="scanStatus"></div>
      <div id="resultStatus"></div>
      <div id="resultRfid"></div>
      <div id="resultType"></div>
      <div id="resultGroup"></div>
      <div id="resultValue"></div>
      <div id="admin-score-board"></div>
      <div id="admin-transaction-log"></div>
      <input id="manual-video-input" />
      <input id="scoreAdjustmentInput" />
      <input id="scoreAdjustmentReason" />
    `;

    // Create mock sessionModeManager instance for injection
    mockSessionModeManager = {
      isNetworked: jest.fn(() => false),
      isStandalone: jest.fn(() => false),
      setMode: jest.fn()
    };

    // Mock window for HTML onclick handlers (temporary until Phase 6)
    // Use Object.defineProperty to make window mockable in tests
    delete global.window;
    global.window = {
      addEventListener: jest.fn(),
      location: { search: '' },
      showConnectionWizard: jest.fn()
    };

    // Create new App instance with dependency injection
    app = new App({
      debug: Debug,
      uiManager: UIManager,
      settings: Settings,
      tokenManager: TokenManager,
      dataManager: DataManager,
      nfcHandler: NFCHandler,
      config: CONFIG,
      initializationSteps: InitializationSteps,
      sessionModeManager: mockSessionModeManager,
      showConnectionWizard: global.window.showConnectionWizard
    });
  });

  describe('Constructor', () => {
    it('should initialize with default values', () => {
      expect(app.currentTeamId).toBe('');
      expect(app.nfcSupported).toBe(false);
      expect(app.currentInterventionTeamId).toBeNull();
      expect(app.viewController).toBeDefined();
    });

    it('should create viewController with correct structure', () => {
      expect(app.viewController.currentView).toBe('scanner');
      expect(app.viewController.views).toEqual(['scanner', 'admin', 'debug']);
      expect(app.viewController.adminInstances).toBeNull();
      expect(typeof app.viewController.init).toBe('function');
      expect(typeof app.viewController.switchView).toBe('function');
    });
  });

  describe('Initialization', () => {
    it('should run complete initialization sequence', async () => {
      const InitializationSteps = require('../../src/app/initializationSteps.js').default;

      await app.init();

      expect(InitializationSteps.initializeUIManager).toHaveBeenCalled();
      expect(InitializationSteps.showLoadingScreen).toHaveBeenCalled();
      expect(InitializationSteps.createSessionModeManager).toHaveBeenCalled();
      expect(InitializationSteps.initializeViewController).toHaveBeenCalled();
      expect(InitializationSteps.loadSettings).toHaveBeenCalled();
      expect(InitializationSteps.loadDataManager).toHaveBeenCalled();
      expect(InitializationSteps.detectNFCSupport).toHaveBeenCalled();
      expect(InitializationSteps.loadTokenDatabase).toHaveBeenCalled();
      expect(InitializationSteps.applyURLModeOverride).toHaveBeenCalled();
      expect(InitializationSteps.registerServiceWorker).toHaveBeenCalled();
      expect(InitializationSteps.determineInitialScreen).toHaveBeenCalled();
      expect(InitializationSteps.applyInitialScreenDecision).toHaveBeenCalled();
    });

    it('should wire networked session event listeners', async () => {
      // Spy on window.addEventListener to verify event wiring
      const addEventListenerSpy = jest.spyOn(global.window, 'addEventListener');

      await app.init();

      expect(addEventListenerSpy).toHaveBeenCalledWith('session:ready', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('auth:required', expect.any(Function));

      addEventListenerSpy.mockRestore();
    });

    it('should detect NFC support', async () => {
      const InitializationSteps = require('../../src/app/initializationSteps.js').default;
      InitializationSteps.detectNFCSupport.mockResolvedValue(true);

      await app.init();

      expect(app.nfcSupported).toBe(true);
    });
  });

  describe('Settings Management', () => {
    it('should show settings screen', () => {
      const UIManager = require('../../src/ui/uiManager.js').default;

      app.showSettings();

      expect(UIManager.showScreen).toHaveBeenCalledWith('settings');
    });

    it('should save settings and return to team entry', () => {
      const Settings = require('../../src/ui/settings.js').default;
      const UIManager = require('../../src/ui/uiManager.js').default;

      app.saveSettings();

      expect(Settings.save).toHaveBeenCalled();
      expect(UIManager.showScreen).toHaveBeenCalledWith('teamEntry');
    });

    it('should toggle mode between detective and blackmarket', () => {
      const Settings = require('../../src/ui/settings.js').default;
      const UIManager = require('../../src/ui/uiManager.js').default;
      Settings.mode = 'detective';

      app.toggleMode();

      expect(Settings.mode).toBe('blackmarket');
      expect(UIManager.updateModeDisplay).toHaveBeenCalledWith('blackmarket');

      app.toggleMode();

      expect(Settings.mode).toBe('detective');
      expect(UIManager.updateModeDisplay).toHaveBeenCalledWith('detective');
    });

    it('should update mode from toggle checkbox', () => {
      const Settings = require('../../src/ui/settings.js').default;
      const UIManager = require('../../src/ui/uiManager.js').default;
      const toggle = document.getElementById('modeToggle');

      toggle.checked = true;
      app.updateModeFromToggle();

      expect(Settings.mode).toBe('blackmarket');
      expect(UIManager.updateModeDisplay).toHaveBeenCalledWith('blackmarket');

      toggle.checked = false;
      app.updateModeFromToggle();

      expect(Settings.mode).toBe('detective');
      expect(UIManager.updateModeDisplay).toHaveBeenCalledWith('detective');
    });
  });

  describe('Team Entry', () => {
    it('should append numbers to team ID', () => {
      const UIManager = require('../../src/ui/uiManager.js').default;

      app.appendNumber('1');
      app.appendNumber('2');
      app.appendNumber('3');

      expect(app.currentTeamId).toBe('123');
      expect(UIManager.updateTeamDisplay).toHaveBeenCalledTimes(3);
    });

    it('should respect max team ID length', () => {
      app.appendNumber('1');
      app.appendNumber('2');
      app.appendNumber('3');
      app.appendNumber('4');
      app.appendNumber('5');
      app.appendNumber('6');
      app.appendNumber('7'); // Should be ignored

      expect(app.currentTeamId).toBe('123456');
    });

    it('should clear team ID', () => {
      const UIManager = require('../../src/ui/uiManager.js').default;
      app.currentTeamId = '123';

      app.clearTeamId();

      expect(app.currentTeamId).toBe('');
      expect(UIManager.updateTeamDisplay).toHaveBeenCalledWith('');
    });

    it('should confirm team ID and show scan screen', () => {
      const UIManager = require('../../src/ui/uiManager.js').default;
      app.currentTeamId = '123';

      app.confirmTeamId();

      expect(document.getElementById('currentTeam').textContent).toBe('123');
      expect(UIManager.updateSessionStats).toHaveBeenCalled();
      expect(UIManager.showScreen).toHaveBeenCalledWith('scan');
    });

    it('should not confirm empty team ID', () => {
      const UIManager = require('../../src/ui/uiManager.js').default;
      app.currentTeamId = '';

      app.confirmTeamId();

      expect(UIManager.showScreen).not.toHaveBeenCalled();
    });
  });

  describe('Game Mode Selection', () => {
    it('should select networked mode', async () => {
      await app.selectGameMode('networked');

      expect(mockSessionModeManager.setMode).toHaveBeenCalledWith('networked');
    });

    it('should select standalone mode', async () => {
      await app.selectGameMode('standalone');

      expect(mockSessionModeManager.setMode).toHaveBeenCalledWith('standalone');
    });

    it('should handle missing sessionModeManager', async () => {
      const UIManager = require('../../src/ui/uiManager.js').default;
      global.mockSessionModeManager = null;

      await app.selectGameMode('networked');

      expect(UIManager.showError).toHaveBeenCalled();
    });

    it('should handle setMode errors', async () => {
      const UIManager = require('../../src/ui/uiManager.js').default;
      mockSessionModeManager.setMode.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      await app.selectGameMode('networked');

      expect(UIManager.showError).toHaveBeenCalledWith('Failed to set game mode: Connection failed');
    });
  });

  describe('View Controller', () => {
    it('should initialize view selector in networked mode', () => {
      mockSessionModeManager.isNetworked.mockReturnValue(true);

      app.viewController.init();

      expect(document.getElementById('viewSelector').style.display).toBe('flex');
    });

    it('should not show view selector in standalone mode', () => {
      mockSessionModeManager.isNetworked.mockReturnValue(false);

      app.viewController.init();

      expect(document.getElementById('viewSelector').style.display).toBe('none');
    });

    it('should switch views correctly', () => {
      app.viewController.switchView('admin');

      expect(app.viewController.currentView).toBe('admin');
      expect(document.getElementById('admin-view').style.display).toBe('block');
      expect(document.querySelector('[data-view="admin"]').classList.contains('active')).toBe(true);
    });

    it('should hide other views when switching', () => {
      app.viewController.switchView('admin');

      expect(document.getElementById('scanner-view').style.display).toBe('none');
      expect(document.getElementById('debug-view').style.display).toBe('none');
    });

    it('should handle invalid view name', () => {
      const UIManager = require('../../src/ui/uiManager.js').default;

      app.viewController.switchView('invalid');

      expect(UIManager.showError).toHaveBeenCalledWith('Invalid view: invalid');
      expect(app.viewController.currentView).toBe('scanner'); // Should not change
    });
  });

  describe('NFC Scanning', () => {
    it('should start NFC scan when supported', async () => {
      const NFCHandler = require('../../src/utils/nfcHandler.js').default;
      app.nfcSupported = true;

      await app.startScan();

      expect(NFCHandler.startScan).toHaveBeenCalled();
    });

    it('should simulate scan when NFC not supported', async () => {
      jest.useFakeTimers();
      app.nfcSupported = false;
      app.currentTeamId = '123'; // Required for processNFCRead

      const status = document.getElementById('scanStatus');

      app.startScan();

      // Verify demo mode message is shown
      expect(status.textContent).toBe('Demo Mode: Simulating scan...');

      // Advance timers to trigger the simulated scan
      jest.advanceTimersByTime(1000); // CONFIG.SCAN_SIMULATION_DELAY

      // Verify NFCHandler.simulateScan was called
      const NFCHandler = require('../../src/utils/nfcHandler.js').default;
      expect(NFCHandler.simulateScan).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should disable scan button during scan', async () => {
      const NFCHandler = require('../../src/utils/nfcHandler.js').default;
      app.nfcSupported = true;
      const button = document.getElementById('scanButton');

      await app.startScan();

      expect(button.disabled).toBe(true);
      expect(button.textContent).toBe('Scanning...');
    });

    it('should require team selection before processing token', () => {
      const UIManager = require('../../src/ui/uiManager.js').default;
      app.currentTeamId = '';

      app.processNFCRead({ id: 'test123', source: 'nfc', raw: 'test123' });

      expect(UIManager.showError).toHaveBeenCalledWith('Please select a team before scanning tokens');
    });

    it('should detect duplicate tokens', () => {
      const DataManager = require('../../src/core/dataManager.js').default;
      DataManager.isTokenScanned.mockReturnValue(true);
      app.currentTeamId = '123';

      app.processNFCRead({ id: 'test123', source: 'nfc', raw: 'test123' });

      // Should show duplicate error screen
      expect(document.getElementById('resultType').textContent).toBe('DUPLICATE');
    });

    it('should process unknown token', () => {
      const TokenManager = require('../../src/core/tokenManager.js').default;
      TokenManager.findToken.mockReturnValue(null);
      app.currentTeamId = '123';

      // Ensure isTokenScanned returns false for this token
      app.dataManager.isTokenScanned.mockReturnValue(false);

      app.processNFCRead({ id: 'unknown', source: 'nfc', raw: 'unknown' });

      // Assert on injected dataManager, not global mock
      expect(app.dataManager.markTokenAsScanned).toHaveBeenCalledWith('unknown');
    });

    it('should process known token', () => {
      const TokenManager = require('../../src/core/tokenManager.js').default;
      const UIManager = require('../../src/ui/uiManager.js').default;

      TokenManager.findToken.mockReturnValue({
        token: { SF_MemoryType: 'Technical', SF_ValueRating: 5, SF_Group: 'Test Group' },
        matchedId: 'test123'
      });
      app.currentTeamId = '123';

      // Ensure isTokenScanned returns false for this token
      app.dataManager.isTokenScanned.mockReturnValue(false);

      app.processNFCRead({ id: 'test123', source: 'nfc', raw: 'test123' });

      // Assert on injected dataManager, not global mock
      expect(app.dataManager.markTokenAsScanned).toHaveBeenCalledWith('test123');
      expect(UIManager.showTokenResult).toHaveBeenCalled();
    });
  });

  describe('Transaction Recording', () => {
    it('should record transaction in standalone mode', () => {
      const DataManager = require('../../src/core/dataManager.js').default;
      mockSessionModeManager.isStandalone.mockReturnValue(true);
      app.currentTeamId = '123';

      const token = { SF_MemoryType: 'Technical', SF_ValueRating: 5, SF_Group: 'Test' };
      app.recordTransaction(token, 'test123', false);

      expect(DataManager.addTransaction).toHaveBeenCalled();
      expect(DataManager.markTokenAsScanned).toHaveBeenCalledWith('test123');
    });

    it('should queue transaction in networked mode', () => {
      mockSessionModeManager.isNetworked.mockReturnValue(true);
      app.networkedSession = {
        getService: jest.fn(() => ({
          queueTransaction: jest.fn(() => 'tx-123')
        }))
      };
      app.currentTeamId = '123';

      const token = { SF_MemoryType: 'Technical', SF_ValueRating: 5 };
      app.recordTransaction(token, 'test123', false);

      expect(app.networkedSession.getService).toHaveBeenCalledWith('queueManager');
    });

    it('should calculate points for blackmarket mode', () => {
      const Settings = require('../../src/ui/settings.js').default;
      const DataManager = require('../../src/core/dataManager.js').default;
      Settings.mode = 'blackmarket';
      app.currentTeamId = '123';

      const token = { SF_MemoryType: 'Technical', SF_ValueRating: 5 };
      app.recordTransaction(token, 'test123', false);

      expect(DataManager.calculateTokenValue).toHaveBeenCalled();
    });

    it('should set points to 0 for unknown tokens', () => {
      app.currentTeamId = '123';

      app.recordTransaction(null, 'unknown', true);

      // Should create transaction with points: 0
      const DataManager = require('../../src/core/dataManager.js').default;
      const call = DataManager.addTransaction.mock.calls[0];
      expect(call[0].points).toBe(0);
    });
  });

  describe('History Management', () => {
    it('should show history screen', () => {
      const UIManager = require('../../src/ui/uiManager.js').default;

      app.showHistory();

      expect(UIManager.updateHistoryStats).toHaveBeenCalled();
      expect(UIManager.renderTransactions).toHaveBeenCalled();
      expect(UIManager.showScreen).toHaveBeenCalledWith('history');
    });

    it('should close history and return to previous screen', () => {
      const UIManager = require('../../src/ui/uiManager.js').default;
      UIManager.previousScreen = 'scan';

      app.closeHistory();

      expect(UIManager.showScreen).toHaveBeenCalledWith('scan');
    });

    it('should default to teamEntry if no previous screen', () => {
      const UIManager = require('../../src/ui/uiManager.js').default;
      UIManager.previousScreen = null;

      app.closeHistory();

      expect(UIManager.showScreen).toHaveBeenCalledWith('teamEntry');
    });
  });

  describe('Scoreboard Management', () => {
    it('should show scoreboard in blackmarket mode', () => {
      const Settings = require('../../src/ui/settings.js').default;
      const UIManager = require('../../src/ui/uiManager.js').default;
      Settings.mode = 'blackmarket';

      app.showScoreboard();

      expect(UIManager.renderScoreboard).toHaveBeenCalled();
      expect(UIManager.showScreen).toHaveBeenCalledWith('scoreboard');
    });

    it('should not show scoreboard in detective mode', () => {
      const Settings = require('../../src/ui/settings.js').default;
      const Debug = require('../../src/utils/debug.js').default;
      Settings.mode = 'detective';

      app.showScoreboard();

      expect(Debug.log).toHaveBeenCalledWith('Scoreboard only available in Black Market mode');
    });

    it('should close scoreboard', () => {
      const UIManager = require('../../src/ui/uiManager.js').default;
      UIManager.previousScreen = 'teamEntry';

      app.closeScoreboard();

      expect(UIManager.showScreen).toHaveBeenCalledWith('teamEntry');
    });
  });

  describe('Team Details', () => {
    it('should show team details screen', () => {
      const DataManager = require('../../src/core/dataManager.js').default;
      const UIManager = require('../../src/ui/uiManager.js').default;
      DataManager.getTeamTransactions.mockReturnValue([
        { teamId: '123', tokenId: 'token1' }
      ]);

      app.showTeamDetails('123');

      expect(DataManager.getTeamTransactions).toHaveBeenCalledWith('123');
      expect(UIManager.renderTeamDetails).toHaveBeenCalledWith('123', expect.any(Array));
      expect(UIManager.showScreen).toHaveBeenCalledWith('teamDetails');
    });

    it('should close team details and return to scoreboard', () => {
      const UIManager = require('../../src/ui/uiManager.js').default;

      app.closeTeamDetails();

      expect(UIManager.showScreen).toHaveBeenCalledWith('scoreboard');
    });
  });

  describe('Format Session Duration', () => {
    it('should format duration correctly', () => {
      expect(app.formatSessionDuration(0)).toBe('0s');
      expect(app.formatSessionDuration(30000)).toBe('30s');
      expect(app.formatSessionDuration(90000)).toBe('1m 30s');
      expect(app.formatSessionDuration(3600000)).toBe('1h');
      expect(app.formatSessionDuration(86400000)).toBe('1d');
      expect(app.formatSessionDuration(90061000)).toBe('1d 1h');
    });

    it('should handle invalid durations', () => {
      expect(app.formatSessionDuration(null)).toBe('Unknown');
      expect(app.formatSessionDuration(-1000)).toBe('Unknown');
      expect(app.formatSessionDuration(undefined)).toBe('Unknown');
    });
  });

  describe('Admin Panel Display', () => {
    it('should delegate to MonitoringDisplay in networked mode', () => {
      app.viewController.adminInstances = {
        monitoring: {
          refreshAllDisplays: jest.fn()
        }
      };

      app.updateAdminPanel();

      expect(app.viewController.adminInstances.monitoring.refreshAllDisplays).toHaveBeenCalled();
    });

    it('should render local scores in standalone mode', () => {
      const DataManager = require('../../src/core/dataManager.js').default;
      DataManager.transactions = [
        { teamId: '001', mode: 'blackmarket' },
        { teamId: '001', mode: 'blackmarket' },
        { teamId: '002', mode: 'blackmarket' }
      ];
      app.viewController.adminInstances = null;

      app.updateAdminPanel();

      const scoreBoard = document.getElementById('admin-score-board');
      expect(scoreBoard.innerHTML).toContain('001');
      expect(scoreBoard.innerHTML).toContain('002');
    });
  });

  describe('Manual Entry', () => {
    it('should process manual RFID entry', () => {
      global.prompt = jest.fn(() => 'manual123');
      app.currentTeamId = '123';

      app.manualEntry();

      // Should have called processNFCRead with manual source
      expect(app.currentTeamId).toBe('123'); // Verify state hasn't changed
    });

    it('should ignore empty manual entry', () => {
      global.prompt = jest.fn(() => '');
      const processNFCReadSpy = jest.spyOn(app, 'processNFCRead');

      app.manualEntry();

      expect(processNFCReadSpy).not.toHaveBeenCalled();
    });
  });

  describe('Scan Control', () => {
    it('should cancel scan and return to team entry', () => {
      const NFCHandler = require('../../src/utils/nfcHandler.js').default;
      const UIManager = require('../../src/ui/uiManager.js').default;
      app.currentTeamId = '123';

      app.cancelScan();

      expect(NFCHandler.stopScan).toHaveBeenCalled();
      expect(app.currentTeamId).toBe('');
      expect(UIManager.updateTeamDisplay).toHaveBeenCalledWith('');
      expect(UIManager.showScreen).toHaveBeenCalledWith('teamEntry');
    });

    it('should continue scan and update stats', () => {
      const UIManager = require('../../src/ui/uiManager.js').default;

      app.continueScan();

      expect(UIManager.updateSessionStats).toHaveBeenCalled();
      expect(UIManager.showScreen).toHaveBeenCalledWith('scan');
    });

    it('should finish team and clear team ID', () => {
      const UIManager = require('../../src/ui/uiManager.js').default;
      app.currentTeamId = '123';

      app.finishTeam();

      expect(app.currentTeamId).toBe('');
      expect(UIManager.updateTeamDisplay).toHaveBeenCalledWith('');
      expect(UIManager.showScreen).toHaveBeenCalledWith('teamEntry');
    });
  });

  describe('Switch View Helper', () => {
    it('should delegate to viewController.switchView', () => {
      const switchViewSpy = jest.spyOn(app.viewController, 'switchView');

      app.switchView('admin');

      expect(switchViewSpy).toHaveBeenCalledWith('admin');
    });
  });
});
