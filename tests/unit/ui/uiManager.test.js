/**
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { UIManager } from '../../../src/ui/uiManager.js';

describe('UIManager - ES6 Module (Pure Rendering Layer)', () => {
  let uiManager;
  let mockSettings;
  let mockDataManager;
  let mockSessionModeManager;
  let mockApp;

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Mock Settings
    mockSettings = {
      mode: 'blackmarket',
      deviceId: '001'
    };

    // Mock DataManager
    mockDataManager = {
      transactions: [
        { id: '1', tokenId: 'token1', teamId: '001', timestamp: '2025-11-11T10:00:00Z', mode: 'blackmarket', valueRating: 3, memoryType: 'Technical', rfid: 'token1', group: 'Server Logs (x5)', isUnknown: false, points: 5000 }
      ],
      backendScores: new Map(),
      SCORING_CONFIG: {
        BASE_VALUES: { 1: 100, 2: 500, 3: 1000, 4: 5000, 5: 10000 },
        TYPE_MULTIPLIERS: { 'Personal': 1, 'Business': 3, 'Technical': 5, 'UNKNOWN': 0 }
      },
      getSessionStats: jest.fn(() => ({ count: 1, totalScore: 5000, totalValue: '⭐⭐⭐' })),
      getGlobalStats: jest.fn(() => ({ total: 1, teams: 1, totalValue: '5000', avgValue: '5000' })),
      getTeamScores: jest.fn(() => [{ teamId: '001', score: 5000, tokenCount: 1, isFromBackend: false }]),
      getEnhancedTeamTransactions: jest.fn(() => ({
        hasCompletedGroups: false,
        hasIncompleteGroups: false,
        hasUngroupedTokens: true,
        hasUnknownTokens: false,
        ungroupedTokens: [{ rfid: 'token1', memoryType: 'Technical', valueRating: 3, group: 'Server Logs (x5)', isUnknown: false, id: 't1' }]
      })),
      calculateTeamScoreWithBonuses: jest.fn(() => ({ baseScore: 5000, bonusScore: 0, totalScore: 5000 })),
      calculateTokenValue: jest.fn(() => 5000),
      parseGroupInfo: jest.fn((group) => ({ groupId: 'Server Logs', multiplier: 5 }))
    };

    // Mock SessionModeManager
    mockSessionModeManager = {
      isNetworked: jest.fn(() => false)
    };

    // Mock App
    mockApp = {
      currentInterventionTeamId: null,
      showTeamDetails: jest.fn(),
      deleteTeamTransaction: jest.fn()
    };

    // Setup DOM
    document.body.innerHTML = `
      <div id="loadingScreen" class="screen"></div>
      <div id="settingsScreen" class="screen"></div>
      <div id="gameModeScreen" class="screen"></div>
      <div id="teamEntryScreen" class="screen"></div>
      <div id="scanScreen" class="screen"></div>
      <div id="resultScreen" class="screen"></div>
      <div id="historyScreen" class="screen"></div>
      <div id="scoreboardScreen" class="screen"></div>
      <div id="teamDetailsScreen" class="screen"></div>

      <div id="modeIndicator"></div>
      <span id="modeText"></span>
      <input id="modeToggle" type="checkbox" />
      <button id="scoreboardButton"></button>
      <span id="teamDisplay"></span>
      <span id="teamTokenCount"></span>
      <span id="teamTotalValue"></span>
      <label id="teamValueLabel"></label>
      <span id="historyBadge"></span>
      <span id="totalScans"></span>
      <span id="uniqueTeams"></span>
      <span id="totalValue"></span>
      <span id="avgValue"></span>

      <div id="scoreboardContainer"></div>
      <div id="historyContainer"></div>

      <div id="teamDetailsTitle"></div>
      <div id="teamDetailsSummary"></div>
      <div id="teamDetailsContainer"></div>
      <div id="teamBaseScore"></div>
      <div id="teamBonusScore"></div>
      <div id="teamTotalScore"></div>
      <div id="teamAdminAdjustmentsSection"></div>
      <div id="teamInterventionControls"></div>

      <div id="resultStatus"></div>
      <span id="resultRfid"></span>
      <span id="resultType"></span>
      <span id="resultGroup"></span>
      <span id="resultValue"></span>
      <div id="resultSummaryContainer"></div>
      <p id="resultSummary"></p>

      <input id="searchFilter" value="" />
      <select id="modeFilter">
        <option value="">All</option>
        <option value="blackmarket">Black Market</option>
        <option value="detective">Detective</option>
      </select>
    `;

    // Create instance
    uiManager = new UIManager({
      settings: mockSettings,
      dataManager: mockDataManager,
      sessionModeManager: mockSessionModeManager,
      app: mockApp
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor & Initialization', () => {
    it('should create UIManager instance with injected dependencies', () => {
      expect(uiManager.settings).toBe(mockSettings);
      expect(uiManager.dataManager).toBe(mockDataManager);
      expect(uiManager.sessionModeManager).toBe(mockSessionModeManager);
      expect(uiManager.app).toBe(mockApp);
    });

    it('should initialize with empty screen cache', () => {
      expect(uiManager.screens).toEqual({});
      expect(uiManager.previousScreen).toBeNull();
      expect(uiManager.errorContainer).toBeNull();
    });

    it('should NOT extend EventTarget (pure rendering layer)', () => {
      expect(uiManager instanceof EventTarget).toBe(false);
    });

    it('should cache screen references on init()', () => {
      uiManager.init();

      expect(uiManager.screens.loading).toBe(document.getElementById('loadingScreen'));
      expect(uiManager.screens.scan).toBe(document.getElementById('scanScreen'));
      expect(Object.keys(uiManager.screens).length).toBe(9);
    });

    it('should create error container on init()', () => {
      uiManager.init();

      expect(document.getElementById('error-container')).toBeDefined();
      expect(uiManager.errorContainer).toBe(document.getElementById('error-container'));
    });

    it('should handle init() with missing DOM elements gracefully', () => {
      document.body.innerHTML = ''; // Remove all elements

      expect(() => uiManager.init()).not.toThrow();
    });
  });

  describe('Screen Navigation', () => {
    beforeEach(() => {
      uiManager.init();
    });

    it('should show specified screen and hide others', () => {
      uiManager.showScreen('scan');

      expect(uiManager.screens.scan.classList.contains('active')).toBe(true);
      expect(uiManager.screens.loading.classList.contains('active')).toBe(false);
      expect(uiManager.screens.teamEntry.classList.contains('active')).toBe(false);
    });

    it('should track previous screen for back navigation', () => {
      uiManager.showScreen('teamEntry');
      uiManager.screens.teamEntry.classList.add('active'); // Simulate active

      uiManager.showScreen('scan');

      expect(uiManager.previousScreen).toBe('teamEntry');
    });

    it('should NOT track overlay screens as previous', () => {
      uiManager.showScreen('scan');
      uiManager.screens.scan.classList.add('active');

      uiManager.showScreen('history'); // Overlay screen

      expect(uiManager.previousScreen).not.toBe('scan'); // Should not update
    });

    it('should handle missing screen gracefully', () => {
      expect(() => uiManager.showScreen('nonexistent')).not.toThrow();
    });

    it('should handle missing screen elements in screens cache', () => {
      uiManager.screens.scan = null;

      expect(() => uiManager.showScreen('scan')).not.toThrow();
    });
  });

  describe('Mode Display', () => {
    beforeEach(() => {
      uiManager.init();
    });

    it('should update mode display for blackmarket', () => {
      uiManager.updateModeDisplay('blackmarket');

      const indicator = document.getElementById('modeIndicator');
      expect(indicator.className).toBe('mode-indicator mode-blackmarket');
      expect(indicator.textContent).toBe('Black Market Mode');
      expect(document.getElementById('modeToggle').checked).toBe(true);
    });

    it('should update mode display for detective', () => {
      uiManager.updateModeDisplay('detective');

      const indicator = document.getElementById('modeIndicator');
      expect(indicator.className).toBe('mode-indicator mode-detective');
      expect(indicator.textContent).toBe('Detective Mode');
      expect(document.getElementById('modeToggle').checked).toBe(false);
    });

    it('should show scoreboard button in blackmarket mode', () => {
      mockSettings.mode = 'blackmarket';
      uiManager.updateModeDisplay('blackmarket');

      expect(document.getElementById('scoreboardButton').style.display).toBe('block');
    });

    it('should hide scoreboard button in detective mode', () => {
      mockSettings.mode = 'detective';
      uiManager.updateModeDisplay('detective');

      expect(document.getElementById('scoreboardButton').style.display).toBe('none');
    });

    it('should handle missing mode indicator gracefully', () => {
      document.getElementById('modeIndicator').remove();

      expect(() => uiManager.updateModeDisplay('blackmarket')).not.toThrow();
    });
  });

  describe('Error & Toast Notifications', () => {
    beforeEach(() => {
      uiManager.init();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should show error message', () => {
      uiManager.showError('Test error');

      const errorDiv = document.querySelector('.error-message');
      expect(errorDiv).toBeDefined();
      expect(errorDiv.textContent).toBe('Test error');
    });

    it('should auto-dismiss error after duration', () => {
      uiManager.showError('Test error', 5000);

      jest.advanceTimersByTime(5300);

      const errorDiv = document.querySelector('.error-message');
      expect(errorDiv).toBeNull();
    });

    it('should show toast notification', () => {
      uiManager.showToast('Test toast', 'success');

      const toast = document.querySelector('.toast-success');
      expect(toast).toBeDefined();
      expect(toast.textContent).toBe('Test toast');
    });

    it('should support different toast types', () => {
      uiManager.showToast('Info', 'info');
      uiManager.showToast('Error', 'error');
      uiManager.showToast('Warning', 'warning');

      expect(document.querySelector('.toast-info')).toBeDefined();
      expect(document.querySelector('.toast-error')).toBeDefined();
      expect(document.querySelector('.toast-warning')).toBeDefined();
    });

    it('should auto-create error container if missing', () => {
      uiManager.errorContainer = null;
      document.getElementById('error-container')?.remove();

      uiManager.showError('Test');

      expect(document.getElementById('error-container')).toBeDefined();
    });
  });

  describe('Stats Rendering', () => {
    beforeEach(() => {
      uiManager.init();
    });

    it('should update session stats in blackmarket mode', () => {
      mockSettings.mode = 'blackmarket';
      uiManager.updateSessionStats();

      expect(document.getElementById('teamTokenCount').textContent).toBe('1');
      expect(document.getElementById('teamTotalValue').textContent).toBe('$5,000');
      expect(document.getElementById('teamValueLabel').textContent).toBe('Score');
    });

    it('should update session stats in detective mode', () => {
      mockSettings.mode = 'detective';
      uiManager.updateSessionStats();

      expect(document.getElementById('teamTotalValue').textContent).toBe('⭐⭐⭐');
      expect(document.getElementById('teamValueLabel').textContent).toBe('Total Value');
    });

    it('should update history badge with count', () => {
      mockDataManager.transactions = [{ id: '1' }, { id: '2' }, { id: '3' }];
      uiManager.updateHistoryBadge();

      const badge = document.getElementById('historyBadge');
      expect(badge.textContent).toBe('3');
      expect(badge.style.display).toBe('inline');
    });

    it('should hide history badge when empty', () => {
      mockDataManager.transactions = [];
      uiManager.updateHistoryBadge();

      expect(document.getElementById('historyBadge').style.display).toBe('none');
    });

    it('should update global history stats', () => {
      uiManager.updateHistoryStats();

      expect(document.getElementById('totalScans').textContent).toBe('1');
      expect(document.getElementById('uniqueTeams').textContent).toBe('1');
      expect(document.getElementById('totalValue').textContent).toBe('5000');
    });

    it('should handle missing DOM elements gracefully', () => {
      document.getElementById('teamTokenCount').remove();

      expect(() => uiManager.updateSessionStats()).not.toThrow();
    });
  });

  describe('Scoreboard Rendering', () => {
    beforeEach(() => {
      uiManager.init();
    });

    it('should render empty state when no teams', () => {
      mockDataManager.getTeamScores.mockReturnValue([]);
      uiManager.renderScoreboard();

      const container = document.getElementById('scoreboardContainer');
      expect(container.innerHTML).toContain('No Teams Yet');
    });

    it('should render team scores', () => {
      uiManager.renderScoreboard();

      const container = document.getElementById('scoreboardContainer');
      expect(container.innerHTML).toContain('Team 001');
      expect(container.innerHTML).toContain('$5,000');
    });

    it('should show backend indicator when scores from orchestrator', () => {
      mockDataManager.getTeamScores.mockReturnValue([
        { teamId: '001', score: 5000, tokenCount: 1, isFromBackend: true }
      ]);
      uiManager.renderScoreboard();

      expect(document.getElementById('scoreboardContainer').innerHTML).toContain('Live from Orchestrator');
    });

    it('should show local indicator for offline scores', () => {
      uiManager.renderScoreboard();

      expect(document.getElementById('scoreboardContainer').innerHTML).toContain('Local Calculation');
    });

    it('should handle missing container gracefully', () => {
      document.getElementById('scoreboardContainer').remove();

      expect(() => uiManager.renderScoreboard()).not.toThrow();
    });
  });

  describe('Team Details Rendering', () => {
    beforeEach(() => {
      uiManager.init();
    });

    it('should render team header', () => {
      uiManager.renderTeamDetails('001', mockDataManager.transactions);

      expect(document.getElementById('teamDetailsTitle').textContent).toBe('Team 001');
      expect(document.getElementById('teamDetailsSummary').textContent).toBe('1 token collected');
    });

    it('should render team score breakdown', () => {
      uiManager.renderTeamDetails('001', mockDataManager.transactions);

      expect(document.getElementById('teamBaseScore').textContent).toBe('$5,000');
      expect(document.getElementById('teamBonusScore').textContent).toBe('$0');
      expect(document.getElementById('teamTotalScore').textContent).toBe('$5,000');
    });

    it('should use backend scores when available in networked mode', () => {
      mockSessionModeManager.isNetworked.mockReturnValue(true);
      mockDataManager.backendScores.set('001', {
        baseScore: 10000,
        bonusPoints: 5000,
        currentScore: 15000
      });

      uiManager.renderTeamDetails('001', mockDataManager.transactions);

      expect(document.getElementById('teamBaseScore').textContent).toBe('$10,000');
      expect(document.getElementById('teamBonusScore').textContent).toBe('$5,000');
      expect(document.getElementById('teamTotalScore').textContent).toBe('$15,000');
    });

    it('should show intervention controls in networked mode', () => {
      mockSessionModeManager.isNetworked.mockReturnValue(true);
      uiManager.renderTeamDetails('001', mockDataManager.transactions);

      expect(document.getElementById('teamInterventionControls').style.display).toBe('block');
    });

    it('should hide intervention controls in standalone mode', () => {
      mockSessionModeManager.isNetworked.mockReturnValue(false);
      uiManager.renderTeamDetails('001', mockDataManager.transactions);

      expect(document.getElementById('teamInterventionControls').style.display).toBe('none');
    });

    it('should store team ID in app for intervention handlers', () => {
      uiManager.renderTeamDetails('001', mockDataManager.transactions);

      expect(mockApp.currentInterventionTeamId).toBe('001');
    });

    it('should render empty state when no transactions', () => {
      mockDataManager.getEnhancedTeamTransactions.mockReturnValue({
        hasCompletedGroups: false,
        hasIncompleteGroups: false,
        hasUngroupedTokens: false,
        hasUnknownTokens: false
      });

      uiManager.renderTeamDetails('001', []);

      expect(document.getElementById('teamDetailsContainer').innerHTML).toContain('No Tokens');
    });
  });

  describe('Transaction History', () => {
    beforeEach(() => {
      uiManager.init();
    });

    it('should render transaction list', () => {
      uiManager.renderTransactions();

      const container = document.getElementById('historyContainer');
      expect(container.innerHTML).toContain('Team 001');
      expect(container.innerHTML).toContain('token1');
    });

    it('should render empty state when no transactions', () => {
      uiManager.renderTransactions([]);

      expect(document.getElementById('historyContainer').innerHTML).toContain('No Transactions Yet');
    });

    it('should filter transactions by search term', () => {
      mockDataManager.transactions = [
        { rfid: 'token1', teamId: '001', memoryType: 'Technical', group: 'Group A', timestamp: '2025-11-11T10:00:00Z', mode: 'blackmarket', valueRating: 3, isUnknown: false },
        { rfid: 'token2', teamId: '002', memoryType: 'Personal', group: 'Group B', timestamp: '2025-11-11T10:01:00Z', mode: 'detective', valueRating: 2, isUnknown: false }
      ];

      document.getElementById('searchFilter').value = '002';
      uiManager.filterTransactions();

      const container = document.getElementById('historyContainer');
      expect(container.innerHTML).toContain('Team 002');
      expect(container.innerHTML).not.toContain('Team 001');
    });

    it('should filter transactions by mode', () => {
      mockDataManager.transactions = [
        { rfid: 'token1', teamId: '001', mode: 'blackmarket', timestamp: '2025-11-11T10:00:00Z', valueRating: 3, memoryType: 'Technical', group: 'Group A', isUnknown: false },
        { rfid: 'token2', teamId: '002', mode: 'detective', timestamp: '2025-11-11T10:01:00Z', valueRating: 2, memoryType: 'Personal', group: 'Group B', isUnknown: false }
      ];

      document.getElementById('modeFilter').value = 'detective';
      uiManager.filterTransactions();

      const container = document.getElementById('historyContainer');
      expect(container.innerHTML).toContain('Team 002');
      expect(container.innerHTML).not.toContain('Team 001');
    });
  });

  describe('Token Result Display', () => {
    beforeEach(() => {
      uiManager.init();
    });

    it('should show successful token result', () => {
      const token = {
        SF_RFID: 'token1',
        SF_MemoryType: 'Technical',
        SF_ValueRating: 3,
        SF_Group: 'Server Logs (x5)',
        summary: 'Test summary'
      };

      uiManager.showTokenResult(token, 'token1', false);

      expect(document.getElementById('resultStatus').innerHTML).toContain('Transaction Complete');
      expect(document.getElementById('resultRfid').textContent).toBe('token1');
      expect(document.getElementById('resultType').textContent).toBe('Technical');
    });

    it('should show unknown token result', () => {
      uiManager.showTokenResult(null, 'unknown-id', true);

      expect(document.getElementById('resultStatus').innerHTML).toContain('Unknown Token');
      expect(document.getElementById('resultType').textContent).toBe('UNKNOWN');
      expect(document.getElementById('resultValue').textContent).toBe('$0');
    });

    it('should display token value in blackmarket mode', () => {
      mockSettings.mode = 'blackmarket';
      mockDataManager.calculateTokenValue.mockReturnValue(5000);

      const token = { SF_MemoryType: 'Technical', SF_ValueRating: 3 };
      uiManager.showTokenResult(token, 'token1', false);

      expect(document.getElementById('resultValue').textContent).toBe('$5,000');
    });

    it('should display stars in detective mode', () => {
      mockSettings.mode = 'detective';

      const token = { SF_MemoryType: 'Technical', SF_ValueRating: 3, SF_Group: 'Group' };
      uiManager.showTokenResult(token, 'token1', false);

      expect(document.getElementById('resultValue').textContent).toBe('⭐⭐⭐');
    });

    it('should navigate to result screen', () => {
      const token = { SF_MemoryType: 'Technical', SF_ValueRating: 3, SF_Group: 'Group' };

      uiManager.showTokenResult(token, 'token1', false);

      expect(uiManager.screens.result.classList.contains('active')).toBe(true);
    });
  });

  describe('Utility Methods', () => {
    beforeEach(() => {
      uiManager.init();
    });

    it('should update team display', () => {
      uiManager.updateTeamDisplay('042');

      expect(document.getElementById('teamDisplay').textContent).toBe('042');
    });

    it('should show underscore when no team ID', () => {
      uiManager.updateTeamDisplay(null);

      expect(document.getElementById('teamDisplay').textContent).toBe('_');
    });

    it('should show group completion notification', () => {
      const data = {
        teamId: '001',
        groupId: 'Server Logs',
        bonus: 120000,
        multiplier: 5
      };

      uiManager.showGroupCompletionNotification(data);

      const notifications = document.querySelectorAll('[style*="position: fixed"]');
      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0].innerHTML).toContain('Group Completed');
      expect(notifications[0].innerHTML).toContain('Team 001');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing dependencies gracefully', () => {
      const managerNoDeps = new UIManager();

      expect(() => managerNoDeps.init()).not.toThrow();
      expect(() => managerNoDeps.updateSessionStats()).not.toThrow();
      expect(() => managerNoDeps.renderScoreboard()).not.toThrow();
    });

    it('should handle missing DataManager methods', () => {
      const managerBadDeps = new UIManager({ dataManager: {} });

      expect(() => managerBadDeps.updateSessionStats()).not.toThrow();
      expect(() => managerBadDeps.renderScoreboard()).not.toThrow();
    });

    it('should handle missing Settings', () => {
      const managerNoSettings = new UIManager({ dataManager: mockDataManager });

      expect(() => managerNoSettings.updateSessionStats()).not.toThrow();
    });

    it('should handle missing DOM elements in renderTeamDetails', () => {
      document.getElementById('teamDetailsTitle').remove();
      document.getElementById('teamDetailsContainer').remove();

      expect(() => uiManager.renderTeamDetails('001', [])).not.toThrow();
    });

    it('should handle missing DOM elements in showTokenResult', () => {
      document.getElementById('resultStatus').remove();

      expect(() => uiManager.showTokenResult({}, 'token1', false)).not.toThrow();
    });
  });
});
