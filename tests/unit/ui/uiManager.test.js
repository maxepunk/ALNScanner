/**
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { UIManager } from '../../../src/ui/uiManager.js';

describe('UIManager - ES6 Module (Pure Rendering Layer)', () => {
  let uiManager;
  let mockSettings;
  let mockDataManager;
  let mockStandaloneDataManager;
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
        BASE_VALUES: { 1: 10000, 2: 25000, 3: 50000, 4: 75000, 5: 150000 },
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
      isNetworked: jest.fn(() => false),
      isStandalone: jest.fn(() => false)
    };

    // Mock StandaloneDataManager
    mockStandaloneDataManager = {
      getSessionStats: jest.fn(() => ({ count: 1, totalScore: 5000, totalValue: '⭐⭐⭐' })),
      getGlobalStats: jest.fn(() => ({ total: 1, teams: 1, totalValue: '5000', avgValue: '5000' })),
      getAllTeamScores: jest.fn(() => [{ teamId: '001', score: 5000, tokenCount: 1 }]),
      getTeamTransactions: jest.fn(() => [{ rfid: 'token1', memoryType: 'Technical', valueRating: 3, group: 'Server Logs (x5)', isUnknown: false, id: 't1' }]),
      calculateTeamScoreWithBonuses: jest.fn(() => ({ baseScore: 5000, bonusScore: 0, totalScore: 5000 }))
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
      standaloneDataManager: mockStandaloneDataManager,
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

  describe('Game Activity Rendering', () => {
    beforeEach(() => {
      uiManager.init();
      // Add container for game activity
      const gameActivityContainer = document.createElement('div');
      gameActivityContainer.id = 'admin-game-activity';
      document.body.appendChild(gameActivityContainer);
    });

    afterEach(() => {
      const container = document.getElementById('admin-game-activity');
      if (container) container.remove();
    });

    it('should render empty state when no game activity', () => {
      mockDataManager.getGameActivity = jest.fn(() => ({
        tokens: [],
        stats: {
          totalTokens: 0,
          available: 0,
          claimed: 0,
          claimedWithoutDiscovery: 0,
          totalPlayerScans: 0
        }
      }));

      const container = document.getElementById('admin-game-activity');
      uiManager.renderGameActivity(container);

      expect(container.innerHTML).toContain('No token activity yet');
    });

    it('should render activity summary with stats', () => {
      mockDataManager.getGameActivity = jest.fn(() => ({
        tokens: [
          {
            tokenId: 'token1',
            tokenData: { SF_MemoryType: 'Technical', SF_ValueRating: 3 },
            events: [{ type: 'discovery', timestamp: '2025-11-11T10:00:00Z', deviceId: 'player-001' }],
            status: 'available',
            discoveredByPlayers: true
          }
        ],
        stats: {
          totalTokens: 1,
          available: 1,
          claimed: 0,
          claimedWithoutDiscovery: 0,
          totalPlayerScans: 1
        }
      }));

      const container = document.getElementById('admin-game-activity');
      uiManager.renderGameActivity(container, { showSummary: true });

      expect(container.innerHTML).toContain('activity-summary');
      expect(container.innerHTML).toContain('1 tokens');
      expect(container.innerHTML).toContain('1 available');
      expect(container.innerHTML).toContain('0 claimed');
    });

    it('should render available token cards with potential value', () => {
      mockDataManager.getGameActivity = jest.fn(() => ({
        tokens: [
          {
            tokenId: 'mem007',
            tokenData: { SF_MemoryType: 'Business', SF_ValueRating: 3 },
            potentialValue: 150000,  // Business 3-star = $50,000 × 3
            events: [
              { type: 'discovery', timestamp: '2025-11-11T09:30:00Z', deviceId: 'player-002' },
              { type: 'scan', timestamp: '2025-11-11T09:45:00Z', deviceId: 'player-001' }
            ],
            status: 'available',
            discoveredByPlayers: true
          }
        ],
        stats: { totalTokens: 1, available: 1, claimed: 0, claimedWithoutDiscovery: 0, totalPlayerScans: 2 }
      }));

      const container = document.getElementById('admin-game-activity');
      uiManager.renderGameActivity(container);

      expect(container.innerHTML).toContain('mem007');
      expect(container.innerHTML).toContain('AVAILABLE');
      expect(container.innerHTML).toContain('Worth:');
      expect(container.innerHTML).toContain('$150,000');
      expect(container.innerHTML).toContain('Business');
      expect(container.innerHTML).toContain('Discovered');
    });

    it('should render Black Market claims with SOLD text and earned value', () => {
      mockDataManager.getGameActivity = jest.fn(() => ({
        tokens: [
          {
            tokenId: 'jaw001',
            tokenData: { SF_MemoryType: 'Personal', SF_ValueRating: 4 },
            potentialValue: 75000,  // Personal 4-star = $75,000 × 1
            events: [
              { type: 'discovery', timestamp: '2025-11-11T10:15:00Z', deviceId: 'player-001' },
              { type: 'claim', timestamp: '2025-11-11T10:25:00Z', mode: 'blackmarket', teamId: 'Alpha', points: 75000, groupProgress: { name: 'Server Logs', found: 2, total: 5 } }
            ],
            status: 'claimed',
            discoveredByPlayers: true
          }
        ],
        stats: { totalTokens: 1, available: 0, claimed: 1, claimedWithoutDiscovery: 0, totalPlayerScans: 1 }
      }));

      const container = document.getElementById('admin-game-activity');
      uiManager.renderGameActivity(container);

      expect(container.innerHTML).toContain('jaw001');
      expect(container.innerHTML).toContain('SOLD to');
      expect(container.innerHTML).toContain('Alpha');
      expect(container.innerHTML).toContain('$75,000');
      expect(container.innerHTML).toContain('Black Market');
      expect(container.innerHTML).toContain('blackmarket');  // CSS class
    });

    it('should show warning for GM-only claims (no player discovery)', () => {
      mockDataManager.getGameActivity = jest.fn(() => ({
        tokens: [
          {
            tokenId: 'sec042',
            tokenData: { SF_MemoryType: 'Technical', SF_ValueRating: 5 },
            potentialValue: 750000,  // Technical 5-star = $150,000 × 5
            events: [
              { type: 'claim', timestamp: '2025-11-11T10:45:00Z', mode: 'blackmarket', teamId: 'Beta', points: 750000, groupProgress: null }
            ],
            status: 'claimed',
            discoveredByPlayers: false
          }
        ],
        stats: { totalTokens: 1, available: 0, claimed: 1, claimedWithoutDiscovery: 1, totalPlayerScans: 0 }
      }));

      const container = document.getElementById('admin-game-activity');
      uiManager.renderGameActivity(container, { showSummary: true });

      expect(container.innerHTML).toContain('Not discovered by players');
      expect(container.innerHTML).toContain('1 GM-only');
    });

    it('should render Detective claims with EXPOSED text and potential value', () => {
      mockDataManager.getGameActivity = jest.fn(() => ({
        tokens: [
          {
            tokenId: 'doc019',
            tokenData: { SF_MemoryType: 'Personal', SF_ValueRating: 2, summary: 'Token summary text' },
            potentialValue: 25000,  // Personal 2-star = $25,000 × 1
            events: [
              { type: 'discovery', timestamp: '2025-11-11T11:00:00Z', deviceId: 'player-003' },
              { type: 'claim', timestamp: '2025-11-11T11:15:00Z', mode: 'detective', teamId: 'Gamma', points: 25000, groupProgress: null, summary: 'Encrypted server logs revealing unauthorized access' }
            ],
            status: 'claimed',
            discoveredByPlayers: true
          }
        ],
        stats: { totalTokens: 1, available: 0, claimed: 1, claimedWithoutDiscovery: 0, totalPlayerScans: 1 }
      }));

      const container = document.getElementById('admin-game-activity');
      uiManager.renderGameActivity(container);

      expect(container.innerHTML).toContain('EXPOSED by');
      expect(container.innerHTML).toContain('Gamma');
      expect(container.innerHTML).toContain('Worth:');
      expect(container.innerHTML).toContain('$25,000');
      expect(container.innerHTML).toContain('Detective');
      expect(container.innerHTML).toContain('detective');  // CSS class
      expect(container.innerHTML).toContain('Encrypted server logs');
    });

    it('should render filter controls when showFilters is true', () => {
      mockDataManager.getGameActivity = jest.fn(() => ({
        tokens: [],
        stats: { totalTokens: 0, available: 0, claimed: 0, claimedWithoutDiscovery: 0, totalPlayerScans: 0 }
      }));

      const container = document.getElementById('admin-game-activity');
      uiManager.renderGameActivity(container, { showFilters: true });

      expect(container.innerHTML).toContain('activitySearch');
      expect(container.innerHTML).toContain('activityFilter');
    });

    it('should not render summary when showSummary is false', () => {
      mockDataManager.getGameActivity = jest.fn(() => ({
        tokens: [],
        stats: { totalTokens: 0, available: 0, claimed: 0, claimedWithoutDiscovery: 0, totalPlayerScans: 0 }
      }));

      const container = document.getElementById('admin-game-activity');
      uiManager.renderGameActivity(container, { showSummary: false });

      expect(container.innerHTML).not.toContain('activity-summary');
    });

    it('should handle missing container gracefully', () => {
      expect(() => uiManager.renderGameActivity(null)).not.toThrow();
    });

    it('should handle missing getGameActivity method gracefully', () => {
      delete mockDataManager.getGameActivity;

      const container = document.getElementById('admin-game-activity');
      expect(() => uiManager.renderGameActivity(container)).not.toThrow();
    });

    it('should render group progress info on claims', () => {
      mockDataManager.getGameActivity = jest.fn(() => ({
        tokens: [
          {
            tokenId: 'grp001',
            tokenData: { SF_MemoryType: 'Technical', SF_ValueRating: 4 },
            potentialValue: 375000,  // Technical 4-star = $75,000 × 5
            events: [
              { type: 'discovery', timestamp: '2025-11-11T10:00:00Z', deviceId: 'player-001' },
              { type: 'claim', timestamp: '2025-11-11T10:30:00Z', mode: 'blackmarket', teamId: 'Delta', points: 375000, groupProgress: { name: 'Server Logs', found: 3, total: 5 } }
            ],
            status: 'claimed',
            discoveredByPlayers: true
          }
        ],
        stats: { totalTokens: 1, available: 0, claimed: 1, claimedWithoutDiscovery: 0, totalPlayerScans: 1 }
      }));

      const container = document.getElementById('admin-game-activity');
      uiManager.renderGameActivity(container);

      expect(container.innerHTML).toContain('Server Logs');
      expect(container.innerHTML).toContain('3/5');
    });

    it('should render Intel toggle for tokens with summary', () => {
      mockDataManager.getGameActivity = jest.fn(() => ({
        tokens: [
          {
            tokenId: 'tok004',
            tokenData: { SF_MemoryType: 'Personal', SF_ValueRating: 2, summary: 'Secret details about the case' },
            potentialValue: 25000,
            events: [{ type: 'discovery', deviceId: 'dev1', timestamp: '2025-12-16T10:00:00Z' }],
            status: 'available',
            discoveredByPlayers: true
          }
        ],
        stats: { totalTokens: 1, available: 1, claimed: 0, claimedWithoutDiscovery: 0, totalPlayerScans: 1 }
      }));

      const container = document.getElementById('admin-game-activity');
      uiManager.renderGameActivity(container);

      expect(container.innerHTML).toContain('Intel');
      expect(container.innerHTML).toContain('summary-toggle');
      expect(container.innerHTML).toContain('summary-content');
      expect(container.innerHTML).toContain('Secret details about the case');
    });

    it('should not render Intel toggle for tokens without summary', () => {
      mockDataManager.getGameActivity = jest.fn(() => ({
        tokens: [
          {
            tokenId: 'tok005',
            tokenData: { SF_MemoryType: 'Technical', SF_ValueRating: 3 },  // No summary
            potentialValue: 250000,
            events: [{ type: 'discovery', deviceId: 'dev1', timestamp: '2025-12-16T10:00:00Z' }],
            status: 'available',
            discoveredByPlayers: true
          }
        ],
        stats: { totalTokens: 1, available: 1, claimed: 0, claimedWithoutDiscovery: 0, totalPlayerScans: 1 }
      }));

      const container = document.getElementById('admin-game-activity');
      uiManager.renderGameActivity(container);

      expect(container.innerHTML).not.toContain('Intel');
      expect(container.innerHTML).not.toContain('summary-toggle');
    });
  });

  describe('showTokenResult - summary display', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="resultStatus" class="status-message"></div>
        <div id="resultRfid"></div>
        <div id="resultType"></div>
        <div id="resultGroup"></div>
        <div id="resultValue"></div>
        <div id="resultSummaryContainer" style="display: none;"></div>
        <p id="resultSummary"></p>
        <div id="resultScreen" class="screen"></div>
      `;
      uiManager.init();
    });

    it('should show summary in blackmarket mode when token has summary', () => {
      uiManager.settings = { mode: 'blackmarket' };

      const mockDataSource = {
        calculateTokenValue: jest.fn(() => 50000)
      };
      jest.spyOn(uiManager, '_getDataSource').mockReturnValue(mockDataSource);

      const token = {
        SF_MemoryType: 'Technical',
        SF_ValueRating: 3,
        SF_Group: 'Server Logs',
        summary: 'Encrypted server logs revealing unauthorized access'
      };

      uiManager.showTokenResult(token, 'token123', false);

      const summaryContainer = document.getElementById('resultSummaryContainer');
      const summaryEl = document.getElementById('resultSummary');

      expect(summaryContainer.style.display).toBe('flex');
      expect(summaryEl.textContent).toBe('Encrypted server logs revealing unauthorized access');
    });

    it('should hide summary when token has no summary', () => {
      uiManager.settings = { mode: 'blackmarket' };

      const mockDataSource = {
        calculateTokenValue: jest.fn(() => 50000)
      };
      jest.spyOn(uiManager, '_getDataSource').mockReturnValue(mockDataSource);

      const token = {
        SF_MemoryType: 'Technical',
        SF_ValueRating: 3,
        SF_Group: 'Server Logs'
        // No summary field
      };

      uiManager.showTokenResult(token, 'token123', false);

      const summaryContainer = document.getElementById('resultSummaryContainer');
      expect(summaryContainer.style.display).toBe('none');
    });
  });

  describe('Utility Methods - escapeHtml', () => {
    beforeEach(() => {
      uiManager.init();
    });

    it('should escape HTML special characters', () => {
      const result = uiManager.escapeHtml('<script>alert("xss")</script>');
      // DOM-based escaping
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).not.toContain('<script');
    });

    it('should escape ampersands', () => {
      const result = uiManager.escapeHtml('foo & bar');
      expect(result).toBe('foo &amp; bar');
    });

    it('should handle null/undefined', () => {
      expect(uiManager.escapeHtml(null)).toBe('');
      expect(uiManager.escapeHtml(undefined)).toBe('');
    });

    it('should handle empty string', () => {
      expect(uiManager.escapeHtml('')).toBe('');
    });

    it('should handle plain text without escaping', () => {
      const result = uiManager.escapeHtml('Hello World');
      expect(result).toBe('Hello World');
    });
  });

  describe('Utility Methods - _formatTime', () => {
    beforeEach(() => {
      uiManager.init();
    });

    it('should format ISO timestamp to time string', () => {
      // Note: actual time depends on local timezone and locale
      const result = uiManager._formatTime('2025-11-11T10:30:00Z');
      // Should return a time string with hours and minutes (format varies by locale)
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle invalid timestamp', () => {
      const result = uiManager._formatTime('invalid');
      // Returns "Invalid Date" from toLocaleTimeString
      expect(result).toContain('Invalid');
    });

    it('should handle null timestamp', () => {
      const result = uiManager._formatTime(null);
      expect(result).toBe('');
    });

    it('should handle undefined timestamp', () => {
      const result = uiManager._formatTime(undefined);
      expect(result).toBe('');
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
