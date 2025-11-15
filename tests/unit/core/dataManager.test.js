/**
 * DataManager Tests - Batch 1: Core Structure
 * Testing: Transaction storage, scanned tokens, basic methods
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('DataManager - Batch 1: Core Structure', () => {
  let DataManager;
  let dataManager;
  let mockTokenManager;
  let mockSettings;
  let mockDebug;
  let mockUIManager;
  let mockApp;
  let mockSessionModeManager;
  let mockNetworkedSession;

  beforeEach(async () => {
    // Clear localStorage before each test
    localStorage.clear();

    // Import the ES6 module
    const module = await import('../../../src/core/dataManager.js');
    DataManager = module.DataManager;

    // Create mocks for dependencies
    mockTokenManager = {
      findToken: jest.fn(),
    };

    mockSettings = {
      deviceId: 'test-device',
      mode: 'detective',
    };

    mockDebug = {
      log: jest.fn(),
    };

    mockUIManager = {
      updateHistoryBadge: jest.fn(),
      updateSessionStats: jest.fn(),
    };

    mockApp = {
      currentTeamId: '001',
    };

    mockSessionModeManager = {
      mode: 'standalone',  // Default to standalone
    };

    mockNetworkedSession = {
      state: 'disconnected',  // Default to disconnected
    };

    // Instantiate DataManager with mocks
    dataManager = new DataManager({
      tokenManager: mockTokenManager,
      settings: mockSettings,
      debug: mockDebug,
      app: mockApp,
      sessionModeManager: mockSessionModeManager,
      networkedSession: mockNetworkedSession,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('constructor', () => {
    it('should create instance with injected dependencies', () => {
      expect(dataManager.tokenManager).toBe(mockTokenManager);
      expect(dataManager.settings).toBe(mockSettings);
      expect(dataManager.debug).toBe(mockDebug);
      expect(dataManager.app).toBe(mockApp);
      expect(dataManager.sessionModeManager).toBe(mockSessionModeManager);
      expect(dataManager.networkedSession).toBe(mockNetworkedSession);
      expect(dataManager).toBeInstanceOf(EventTarget); // DataManager is event-driven
    });

    it('should initialize empty state', () => {
      expect(dataManager.transactions).toEqual([]);
      expect(dataManager.currentSession).toEqual([]);
      expect(dataManager.scannedTokens).toBeInstanceOf(Set);
      expect(dataManager.scannedTokens.size).toBe(0);
      expect(dataManager.backendScores).toBeInstanceOf(Map);
      expect(dataManager.currentSessionId).toBeNull();
    });

    it('should have scoring configuration', () => {
      expect(dataManager.SCORING_CONFIG).toBeDefined();
      expect(dataManager.SCORING_CONFIG.BASE_VALUES[5]).toBe(10000);
      expect(dataManager.SCORING_CONFIG.TYPE_MULTIPLIERS['Technical']).toBe(5);
    });
  });

  describe('mode-specific storage keys', () => {
    it('should use standalone key when no session mode manager', () => {
      // Create instance without sessionModeManager
      const dmWithoutMode = new DataManager({});
      const key = dmWithoutMode.getScannedTokensKey();
      expect(key).toBe('standalone_scannedTokens');
    });

    it('should use networked key when in networked mode', () => {
      // Update mock to networked mode
      mockSessionModeManager.mode = 'networked';

      const key = dataManager.getScannedTokensKey();
      expect(key).toBe('networked_scannedTokens');

      // Reset to standalone
      mockSessionModeManager.mode = 'standalone';
    });

    it('should use standalone key when in standalone mode', () => {
      // Already in standalone mode by default
      mockSessionModeManager.mode = 'standalone';

      const key = dataManager.getScannedTokensKey();
      expect(key).toBe('standalone_scannedTokens');
    });
  });

  describe('transaction storage', () => {
    it('should load transactions from localStorage', () => {
      const testTransactions = [
        { id: '1', tokenId: 'token1', teamId: '001', timestamp: '2025-11-11T10:00:00Z' },
        { id: '2', tokenId: 'token2', teamId: '002', timestamp: '2025-11-11T10:01:00Z' },
      ];

      localStorage.setItem('transactions', JSON.stringify(testTransactions));

      dataManager.loadTransactions();

      expect(dataManager.transactions).toEqual(testTransactions);
      expect(mockDebug.log).toHaveBeenCalledWith('Loaded 2 transactions');
    });

    it('should handle missing transactions in localStorage', () => {
      dataManager.loadTransactions();

      expect(dataManager.transactions).toEqual([]);
    });

    it('should handle corrupted transactions data', () => {
      localStorage.setItem('transactions', 'invalid-json');

      dataManager.loadTransactions();

      expect(dataManager.transactions).toEqual([]);
      expect(mockDebug.log).toHaveBeenCalledWith('Error loading transactions', true);
    });

    it('should save transactions to localStorage', () => {
      dataManager.transactions = [
        { id: '1', tokenId: 'token1' },
      ];

      dataManager.saveTransactions();

      const saved = JSON.parse(localStorage.getItem('transactions'));
      expect(saved).toEqual(dataManager.transactions);
    });
  });

  describe('scanned tokens tracking', () => {
    it('should load scanned tokens from mode-specific key', () => {
      const testTokens = ['token1', 'token2', 'token3'];
      localStorage.setItem('standalone_scannedTokens', JSON.stringify(testTokens));

      dataManager.loadScannedTokens();

      expect(dataManager.scannedTokens.size).toBe(3);
      expect(dataManager.scannedTokens.has('token1')).toBe(true);
      expect(dataManager.scannedTokens.has('token2')).toBe(true);
      expect(dataManager.scannedTokens.has('token3')).toBe(true);
    });

    it('should save scanned tokens to mode-specific key', () => {
      dataManager.scannedTokens.add('token1');
      dataManager.scannedTokens.add('token2');

      dataManager.saveScannedTokens();

      const saved = JSON.parse(localStorage.getItem('standalone_scannedTokens'));
      expect(saved).toContain('token1');
      expect(saved).toContain('token2');
      expect(saved).toHaveLength(2);
    });

    it('should check if token is scanned', () => {
      dataManager.scannedTokens.add('token1');

      expect(dataManager.isTokenScanned('token1')).toBe(true);
      expect(dataManager.isTokenScanned('token2')).toBe(false);
    });

    it('should mark token as scanned and persist', () => {
      dataManager.markTokenAsScanned('token1');

      expect(dataManager.scannedTokens.has('token1')).toBe(true);

      // Verify it was saved to localStorage
      const saved = JSON.parse(localStorage.getItem('standalone_scannedTokens'));
      expect(saved).toContain('token1');
    });
  });

  describe('addTransaction', () => {
    it('should add simple transaction', () => {
      // Listen for event that DataManager emits
      const eventListener = jest.fn();
      dataManager.addEventListener('transaction:added', eventListener);

      const transaction = {
        tokenId: 'token1',
        teamId: '001',
        memoryType: 'Personal',
        valueRating: 3,
        status: 'accepted',
      };

      dataManager.addTransaction(transaction);

      expect(dataManager.transactions).toHaveLength(1);
      expect(dataManager.currentSession).toHaveLength(1);
      expect(dataManager.transactions[0].tokenId).toBe('token1');
      expect(dataManager.transactions[0].teamId).toBe('001');
      expect(eventListener).toHaveBeenCalled(); // DataManager emits events, doesn't call UI directly
    });

    it('should normalize backend transaction format', () => {
      // Backend sends tokenId instead of rfid
      const backendTx = {
        id: 'backend-1',
        tokenId: 'token1',
        teamId: '001',
        timestamp: '2025-11-11T10:00:00Z',
        deviceId: 'scanner-1',
      };

      mockTokenManager.findToken.mockReturnValue({
        SF_RFID: 'token1',
        SF_MemoryType: 'Technical',
        SF_ValueRating: 5,
        SF_Group: 'Server Logs (x5)',
      });

      dataManager.addTransaction(backendTx);

      const added = dataManager.transactions[0];
      expect(added.tokenId).toBe('token1');
      expect(added.rfid).toBe('token1');
      expect(added.memoryType).toBe('Technical');
      expect(added.valueRating).toBe(5);
      expect(added.group).toBe('Server Logs (x5)');
    });

    it('should prevent duplicate transactions', () => {
      const transaction = {
        tokenId: 'token1',
        teamId: '001',
        timestamp: '2025-11-11T10:00:00Z',
      };

      dataManager.addTransaction(transaction);
      dataManager.addTransaction(transaction);

      expect(dataManager.transactions).toHaveLength(1);
      expect(mockDebug.log).toHaveBeenCalledWith('Skipping duplicate transaction', 'token1');
    });

    it('should handle unknown tokens', () => {
      mockTokenManager.findToken.mockReturnValue(null);

      const transaction = {
        tokenId: 'unknown-token',
        teamId: '001',
      };

      dataManager.addTransaction(transaction);

      const added = dataManager.transactions[0];
      expect(added.isUnknown).toBe(true);
      expect(added.memoryType).toBe('UNKNOWN');
      expect(added.valueRating).toBe(0);
    });

    it('should save after adding transaction', () => {
      const saveSpy = jest.spyOn(dataManager, 'saveTransactions');

      dataManager.addTransaction({
        tokenId: 'token1',
        teamId: '001',
      });

      expect(saveSpy).toHaveBeenCalled();
    });
  });

  describe('session management', () => {
    it('should reset for new session', () => {
      dataManager.transactions = [{ id: '1' }];
      dataManager.currentSession = [{ id: '1' }];
      dataManager.scannedTokens.add('token1');
      dataManager.currentSessionId = 'old-session';

      dataManager.resetForNewSession('new-session');

      expect(dataManager.currentSession).toEqual([]);
      expect(dataManager.scannedTokens.size).toBe(0);
      expect(dataManager.currentSessionId).toBe('new-session');
      expect(dataManager.transactions).toHaveLength(1); // History preserved
    });

    it('should clear all scanned tokens keys on reset', () => {
      localStorage.setItem('scannedTokens', '["token1"]');
      localStorage.setItem('standalone_scannedTokens', '["token2"]');
      localStorage.setItem('networked_scannedTokens', '["token3"]');

      dataManager.resetForNewSession();

      expect(localStorage.getItem('scannedTokens')).toBeNull();
      expect(localStorage.getItem('standalone_scannedTokens')).toBeNull();
      expect(localStorage.getItem('networked_scannedTokens')).toBeNull();
    });

    it('should save session ID when provided', () => {
      dataManager.resetForNewSession('session-123');

      expect(localStorage.getItem('currentSessionId')).toBe('session-123');
    });

    it('should clear session ID when not provided', () => {
      localStorage.setItem('currentSessionId', 'old-session');

      dataManager.resetForNewSession();

      expect(localStorage.getItem('currentSessionId')).toBeNull();
    });

    it('should alias clearSession to resetForNewSession', () => {
      const resetSpy = jest.spyOn(dataManager, 'resetForNewSession');

      dataManager.clearSession();

      expect(resetSpy).toHaveBeenCalled();
    });
  });

  describe('helper methods', () => {
    it('should parse group info with multiplier', () => {
      const result = dataManager.parseGroupInfo('Server Logs (x5)');

      expect(result.name).toBe('Server Logs');
      expect(result.multiplier).toBe(5);
    });

    it('should parse group info without multiplier', () => {
      const result = dataManager.parseGroupInfo('Simple Group');

      expect(result.name).toBe('Simple Group');
      expect(result.multiplier).toBe(1);
    });

    it('should handle empty group name', () => {
      const result = dataManager.parseGroupInfo('');

      expect(result.name).toBe('Unknown');
      expect(result.multiplier).toBe(1);
    });

    it('should handle null group name', () => {
      const result = dataManager.parseGroupInfo(null);

      expect(result.name).toBe('Unknown');
      expect(result.multiplier).toBe(1);
    });

    it('should normalize group names', () => {
      expect(dataManager.normalizeGroupName('  Server   Logs  ')).toBe('server logs');
      expect(dataManager.normalizeGroupName("John's Files")).toBe("john's files");
      expect(dataManager.normalizeGroupName('Test\u2019s Data')).toBe("test's data");
    });

    it('should handle empty string in normalize', () => {
      expect(dataManager.normalizeGroupName('')).toBe('');
    });
  });

  describe('getSessionStats', () => {
    it('should calculate session statistics', () => {
      dataManager.currentSession = [
        { tokenId: 'token1', valueRating: 3, isUnknown: false },
        { tokenId: 'token2', valueRating: 5, isUnknown: false },
        { tokenId: 'token3', valueRating: 0, isUnknown: true },
      ];

      const stats = dataManager.getSessionStats();

      expect(stats.count).toBe(3);
      expect(stats.totalValue).toBe(8); // 3 + 5
    });

    it('should exclude unknown tokens from totalValue', () => {
      dataManager.currentSession = [
        { tokenId: 'token1', valueRating: 5, isUnknown: false },
        { tokenId: 'token2', valueRating: 0, isUnknown: true },
      ];

      const stats = dataManager.getSessionStats();

      expect(stats.totalValue).toBe(5);
    });

    it('should return zero for empty session', () => {
      const stats = dataManager.getSessionStats();

      expect(stats.count).toBe(0);
      expect(stats.totalValue).toBe(0);
    });
  });
});

describe('DataManager - Batch 2: Scoring & Group Completion', () => {
  let DataManager;
  let dataManager;
  let mockTokenManager;
  let mockSettings;
  let mockDebug;

  beforeEach(async () => {
    localStorage.clear();

    const module = await import('../../../src/core/dataManager.js');
    DataManager = module.DataManager;

    mockTokenManager = {
      findToken: jest.fn(),
      getGroupInventory: jest.fn(),
    };

    mockSettings = {
      deviceId: 'test-device',
      mode: 'blackmarket',  // Black Market mode for scoring tests
    };

    mockDebug = {
      log: jest.fn(),
    };

    dataManager = new DataManager({
      tokenManager: mockTokenManager,
      settings: mockSettings,
      debug: mockDebug,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('calculateTeamScoreWithBonuses', () => {
    it('should calculate score with no bonuses for ungrouped tokens', () => {
      // Setup: Team with 2 tokens, no groups completed
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', memoryType: 'Personal', valueRating: 5, isUnknown: false, group: 'No Group' },
        { teamId: '001', mode: 'blackmarket', memoryType: 'Technical', valueRating: 3, isUnknown: false, group: 'No Group' },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({});

      const result = dataManager.calculateTeamScoreWithBonuses('001');

      // 5-star Personal (1x) = 10000 × 1 = 10000
      // 3-star Technical (5x) = 1000 × 5 = 5000
      // Total = 15000
      expect(result.baseScore).toBe(15000);
      expect(result.bonusScore).toBe(0);
      expect(result.totalScore).toBe(15000);
      expect(result.completedGroups).toBe(0);
    });

    it('should apply group completion bonus when team has all tokens', () => {
      // Setup: Team completes "Server Logs (x5)" group with 2 tokens
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', memoryType: 'Technical', valueRating: 5, isUnknown: false, group: 'Server Logs (x5)', rfid: 'token1' },
        { teamId: '001', mode: 'blackmarket', memoryType: 'Technical', valueRating: 4, isUnknown: false, group: 'Server Logs (x5)', rfid: 'token2' },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({
        'server logs': {
          displayName: 'Server Logs',
          multiplier: 5,
          tokens: new Set(['token1', 'token2']),
        },
      });

      const result = dataManager.calculateTeamScoreWithBonuses('001');

      // Base: (5-star Technical 5x = 50000) + (4-star Technical 5x = 25000) = 75000
      // Bonus: Each token gets (multiplier - 1) × base = 4 × base
      // Token1 bonus: 50000 × 4 = 200000
      // Token2 bonus: 25000 × 4 = 100000
      // Total bonus: 300000
      expect(result.baseScore).toBe(75000);
      expect(result.bonusScore).toBe(300000);
      expect(result.totalScore).toBe(375000);
      expect(result.completedGroups).toBe(1);
    });

    it('should not apply bonus for incomplete groups', () => {
      // Setup: Team has 1 of 2 tokens in group
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', memoryType: 'Technical', valueRating: 5, isUnknown: false, group: 'Server Logs (x5)', rfid: 'token1' },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({
        'server logs': {
          displayName: 'Server Logs',
          multiplier: 5,
          tokens: new Set(['token1', 'token2']),  // Needs both
        },
      });

      const result = dataManager.calculateTeamScoreWithBonuses('001');

      expect(result.baseScore).toBe(50000);
      expect(result.bonusScore).toBe(0);  // No bonus - incomplete
      expect(result.completedGroups).toBe(0);
    });

    it('should ignore unknown tokens in calculations', () => {
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', valueRating: 5, isUnknown: true, group: 'Test' },
        { teamId: '001', mode: 'blackmarket', memoryType: 'Personal', valueRating: 3, isUnknown: false, group: 'No Group' },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({});

      const result = dataManager.calculateTeamScoreWithBonuses('001');

      expect(result.baseScore).toBe(1000); // Only 3-star Personal
    });

    it('should filter by team ID', () => {
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', memoryType: 'Personal', valueRating: 5, isUnknown: false },
        { teamId: '002', mode: 'blackmarket', memoryType: 'Personal', valueRating: 5, isUnknown: false },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({});

      const result = dataManager.calculateTeamScoreWithBonuses('001');

      expect(result.baseScore).toBe(10000); // Only team 001's token
    });

    it('should include groupBreakdown for completed groups', () => {
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', memoryType: 'Technical', valueRating: 5, isUnknown: false, group: 'Server Logs (x5)', rfid: 'token1' },
        { teamId: '001', mode: 'blackmarket', memoryType: 'Technical', valueRating: 4, isUnknown: false, group: 'Server Logs (x5)', rfid: 'token2' },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({
        'server logs': {
          displayName: 'Server Logs',
          multiplier: 5,
          tokens: new Set(['token1', 'token2']),
        },
      });

      const result = dataManager.calculateTeamScoreWithBonuses('001');

      expect(result.groupBreakdown['Server Logs']).toBeDefined();
      expect(result.groupBreakdown['Server Logs'].tokens).toBe(2);
      expect(result.groupBreakdown['Server Logs'].multiplier).toBe(5);
      expect(result.groupBreakdown['Server Logs'].baseValue).toBe(75000);
      expect(result.groupBreakdown['Server Logs'].bonusValue).toBe(300000);
    });
  });

  describe('getTeamCompletedGroups', () => {
    it('should return empty array when no groups completed', () => {
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', isUnknown: false, rfid: 'token1' },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({
        'server logs': {
          displayName: 'Server Logs',
          multiplier: 5,
          tokens: new Set(['token1', 'token2']),  // Needs 2, have 1
        },
      });

      const result = dataManager.getTeamCompletedGroups('001');

      expect(result).toEqual([]);
    });

    it('should return completed groups', () => {
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', isUnknown: false, rfid: 'token1' },
        { teamId: '001', mode: 'blackmarket', isUnknown: false, rfid: 'token2' },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({
        'server logs': {
          displayName: 'Server Logs',
          multiplier: 5,
          tokens: new Set(['token1', 'token2']),
        },
      });

      const result = dataManager.getTeamCompletedGroups('001');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Server Logs');
      expect(result[0].multiplier).toBe(5);
      expect(result[0].tokenCount).toBe(2);
    });

    it('should skip single-token groups', () => {
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', isUnknown: false, rfid: 'token1' },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({
        'solo': {
          displayName: 'Solo',
          multiplier: 5,
          tokens: new Set(['token1']),  // Only 1 token
        },
      });

      const result = dataManager.getTeamCompletedGroups('001');

      expect(result).toEqual([]);  // Skipped
    });

    it('should skip groups with multiplier <= 1', () => {
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', isUnknown: false, rfid: 'token1' },
        { teamId: '001', mode: 'blackmarket', isUnknown: false, rfid: 'token2' },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({
        'no bonus': {
          displayName: 'No Bonus',
          multiplier: 1,  // No bonus multiplier
          tokens: new Set(['token1', 'token2']),
        },
      });

      const result = dataManager.getTeamCompletedGroups('001');

      expect(result).toEqual([]);  // Skipped
    });
  });

  describe('getGlobalStats', () => {
    it('should calculate global statistics', () => {
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', memoryType: 'Personal', valueRating: 5, isUnknown: false },
        { teamId: '002', mode: 'detective', valueRating: 3, isUnknown: false },
        { teamId: '001', mode: 'blackmarket', valueRating: 0, isUnknown: true },
      ];

      const result = dataManager.getGlobalStats();

      expect(result.total).toBe(3);
      expect(result.teams).toBe(2);
    });

    it('should calculate black market vs detective scores', () => {
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', memoryType: 'Personal', valueRating: 5, isUnknown: false },
        { teamId: '002', mode: 'detective', valueRating: 3, isUnknown: false },
      ];

      const result = dataManager.getGlobalStats();

      expect(result.blackMarketScore).toBe(10000);  // 5-star Personal 1x
      expect(result.detectiveValue).toBe(3);  // Just star rating
    });
  });

  describe('getTeamTransactions', () => {
    it('should filter by team ID and blackmarket mode', () => {
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', tokenId: 'token1' },
        { teamId: '002', mode: 'blackmarket', tokenId: 'token2' },
        { teamId: '001', mode: 'detective', tokenId: 'token3' },
      ];

      const result = dataManager.getTeamTransactions('001');

      expect(result).toHaveLength(1);
      expect(result[0].tokenId).toBe('token1');
    });

    it('should sort by group, then value, then timestamp', () => {
      const now = new Date().toISOString();
      const later = new Date(Date.now() + 1000).toISOString();

      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', group: 'Group B', valueRating: 3, timestamp: later },
        { teamId: '001', mode: 'blackmarket', group: 'Group A', valueRating: 5, timestamp: now },
        { teamId: '001', mode: 'blackmarket', group: 'Group A', valueRating: 3, timestamp: now },
      ];

      const result = dataManager.getTeamTransactions('001');

      expect(result[0].group).toBe('Group A');
      expect(result[0].valueRating).toBe(5);  // Higher value first
      expect(result[1].group).toBe('Group A');
      expect(result[1].valueRating).toBe(3);
      expect(result[2].group).toBe('Group B');
    });
  });
});

describe('DataManager - Batch 3: Network & Mode-Specific Behavior', () => {
  let DataManager;
  let dataManager;
  let mockTokenManager;
  let mockSettings;
  let mockDebug;
  let mockUIManager;
  let mockApp;
  let mockSessionModeManager;
  let mockNetworkedSession;

  beforeEach(async () => {
    localStorage.clear();

    const module = await import('../../../src/core/dataManager.js');
    DataManager = module.DataManager;

    mockTokenManager = {
      findToken: jest.fn(),
      getGroupInventory: jest.fn(),
    };

    mockSettings = {
      deviceId: 'test-device',
      mode: 'blackmarket',
    };

    mockDebug = {
      log: jest.fn(),
    };

    mockUIManager = {
      renderScoreboard: jest.fn(),
      renderTeamDetails: jest.fn(),
      updateHistoryBadge: jest.fn(),
      updateSessionStats: jest.fn(),
    };

    mockApp = {
      currentInterventionTeamId: '001',
      viewController: {
        currentView: 'scanner',
      },
      updateAdminPanel: jest.fn(),
    };

    mockSessionModeManager = {
      mode: 'networked',  // Default to networked for Batch 3 tests
    };

    mockNetworkedSession = {
      state: 'connected',
    };

    dataManager = new DataManager({
      tokenManager: mockTokenManager,
      settings: mockSettings,
      debug: mockDebug,
      uiManager: mockUIManager,
      app: mockApp,
      sessionModeManager: mockSessionModeManager,
      networkedSession: mockNetworkedSession,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('updateTeamScoreFromBackend', () => {
    beforeEach(() => {
      // Mock DOM elements
      global.document.getElementById = jest.fn();
    });

    it('should store backend score when connected', () => {
      const scoreData = {
        teamId: '001',
        currentScore: 50000,
        baseScore: 30000,
        bonusPoints: 20000,
        tokensScanned: 5,
        completedGroups: 2,
        adminAdjustments: [],
        lastUpdate: '2025-11-11T10:00:00Z',
      };

      dataManager.updateTeamScoreFromBackend(scoreData);

      expect(dataManager.backendScores.has('001')).toBe(true);
      const stored = dataManager.backendScores.get('001');
      expect(stored.currentScore).toBe(50000);
      expect(stored.baseScore).toBe(30000);
      expect(stored.bonusPoints).toBe(20000);
    });

    it('should not update when disconnected', () => {
      mockNetworkedSession.state = 'disconnected';

      const scoreData = {
        teamId: '001',
        currentScore: 50000,
      };

      dataManager.updateTeamScoreFromBackend(scoreData);

      expect(dataManager.backendScores.size).toBe(0);
    });

    it('should emit team-score:updated event', () => {
      // Listen for event that DataManager emits
      const eventListener = jest.fn();
      dataManager.addEventListener('team-score:updated', eventListener);

      // Set connection state so update proceeds
      dataManager.networkedSession.state = 'connected';

      const scoreData = {
        teamId: '001',
        currentScore: 50000,
        baseScore: 30000,
        bonusPoints: 20000,
        tokensScanned: 5,
        completedGroups: 2,
      };

      dataManager.updateTeamScoreFromBackend(scoreData);

      expect(eventListener).toHaveBeenCalled(); // DataManager emits events, doesn't call UI directly
    });

    it('should update admin panel if in admin view', () => {
      mockApp.viewController.currentView = 'admin';

      const scoreData = {
        teamId: '001',
        currentScore: 50000,
        baseScore: 30000,
        bonusPoints: 20000,
        tokensScanned: 5,
        completedGroups: 2,
      };

      dataManager.updateTeamScoreFromBackend(scoreData);

      expect(mockApp.updateAdminPanel).toHaveBeenCalled();
    });

    it('should emit event with transaction data', () => {
      // Listen for event that DataManager emits
      const eventListener = jest.fn();
      dataManager.addEventListener('team-score:updated', eventListener);

      // Set connection state so update proceeds
      dataManager.networkedSession.state = 'connected';

      mockApp.currentInterventionTeamId = '001';
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', tokenId: 'token1' },
      ];

      const scoreData = {
        teamId: '001',
        currentScore: 50000,
        baseScore: 30000,
        bonusPoints: 20000,
        tokensScanned: 5,
        completedGroups: 2,
      };

      dataManager.updateTeamScoreFromBackend(scoreData);

      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            teamId: '001',
            transactions: expect.any(Array)
          })
        })
      );
    });
  });

  describe('getTeamScores', () => {
    it('should return backend scores when connected and available', () => {
      dataManager.backendScores.set('001', {
        currentScore: 50000,
        baseScore: 30000,
        bonusPoints: 20000,
        tokensScanned: 5,
        completedGroups: 2,
      });

      dataManager.backendScores.set('002', {
        currentScore: 30000,
        baseScore: 25000,
        bonusPoints: 5000,
        tokensScanned: 3,
        completedGroups: 1,
      });

      const result = dataManager.getTeamScores();

      expect(result).toHaveLength(2);
      expect(result[0].teamId).toBe('001'); // Higher score first
      expect(result[0].score).toBe(50000);
      expect(result[0].isFromBackend).toBe(true);
      expect(result[1].teamId).toBe('002');
      expect(result[1].score).toBe(30000);
    });

    it('should fall back to local calculation when disconnected', () => {
      mockNetworkedSession.state = 'disconnected';

      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', memoryType: 'Personal', valueRating: 5, isUnknown: false },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({});

      const result = dataManager.getTeamScores();

      expect(result).toHaveLength(1);
      expect(result[0].teamId).toBe('001');
      expect(result[0].isFromBackend).toBeUndefined(); // Local calculation
    });

    it('should fall back to local calculation when no backend scores', () => {
      dataManager.backendScores.clear();

      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', memoryType: 'Personal', valueRating: 5, isUnknown: false },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({});

      const result = dataManager.getTeamScores();

      expect(result).toHaveLength(1);
      expect(result[0].isFromBackend).toBeUndefined();
    });
  });

  describe('calculateLocalTeamScores', () => {
    it('should calculate scores for all teams', () => {
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', memoryType: 'Personal', valueRating: 5, isUnknown: false },
        { teamId: '002', mode: 'blackmarket', memoryType: 'Technical', valueRating: 4, isUnknown: false },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({});

      const result = dataManager.calculateLocalTeamScores();

      expect(result).toHaveLength(2);
      expect(result[0].score).toBe(25000); // 4-star Technical 5x (sorted by score)
      expect(result[1].score).toBe(10000); // 5-star Personal 1x
    });

    it('should include transaction arrays', () => {
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', memoryType: 'Personal', valueRating: 5, isUnknown: false },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({});

      const result = dataManager.calculateLocalTeamScores();

      expect(result[0].transactions).toHaveLength(1);
    });
  });

  describe('getEnhancedTeamTransactions', () => {
    it('should organize transactions by completion status', () => {
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', memoryType: 'Technical', valueRating: 5, isUnknown: false, group: 'Complete Group (x5)', rfid: 'token1' },
        { teamId: '001', mode: 'blackmarket', memoryType: 'Technical', valueRating: 4, isUnknown: false, group: 'Complete Group (x5)', rfid: 'token2' },
        { teamId: '001', mode: 'blackmarket', memoryType: 'Personal', valueRating: 3, isUnknown: false, group: 'Incomplete (x3)', rfid: 'token3' },
        { teamId: '001', mode: 'blackmarket', memoryType: 'Personal', valueRating: 2, isUnknown: false, group: 'No Group', rfid: 'token4' },
        { teamId: '001', mode: 'blackmarket', valueRating: 0, isUnknown: true, group: 'Unknown', rfid: 'token5' },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({
        'complete group': {
          displayName: 'Complete Group',
          multiplier: 5,
          tokens: new Set(['token1', 'token2']),
        },
        'incomplete': {
          displayName: 'Incomplete',
          multiplier: 3,
          tokens: new Set(['token3', 'token6']), // Missing token6
        },
      });

      const result = dataManager.getEnhancedTeamTransactions('001');

      expect(result.hasCompletedGroups).toBe(true);
      expect(result.completedGroups).toHaveLength(1);
      expect(result.completedGroups[0].displayName).toBe('Complete Group');

      expect(result.hasIncompleteGroups).toBe(true);
      expect(result.incompleteGroups).toHaveLength(1);
      expect(result.incompleteGroups[0].displayName).toBe('Incomplete');
      expect(result.incompleteGroups[0].progress).toBe('1/2');

      expect(result.hasUngroupedTokens).toBe(true);
      expect(result.ungroupedTokens).toHaveLength(1);

      expect(result.hasUnknownTokens).toBe(true);
      expect(result.unknownTokens).toHaveLength(1);
    });

    it('should calculate bonus values for completed groups', () => {
      dataManager.transactions = [
        { teamId: '001', mode: 'blackmarket', memoryType: 'Technical', valueRating: 5, isUnknown: false, group: 'Server Logs (x5)', rfid: 'token1' },
        { teamId: '001', mode: 'blackmarket', memoryType: 'Technical', valueRating: 4, isUnknown: false, group: 'Server Logs (x5)', rfid: 'token2' },
      ];

      mockTokenManager.getGroupInventory.mockReturnValue({
        'server logs': {
          displayName: 'Server Logs',
          multiplier: 5,
          tokens: new Set(['token1', 'token2']),
        },
      });

      const result = dataManager.getEnhancedTeamTransactions('001');

      expect(result.completedGroups[0].totalBaseValue).toBe(75000); // 50000 + 25000
      expect(result.completedGroups[0].bonusValue).toBe(300000); // 4x each token's base
    });
  });

  describe('updateGameState', () => {
    it('should update session ID when changed', () => {
      const state = {
        sessionId: 'new-session-123',
      };

      dataManager.updateGameState(state);

      expect(dataManager.currentSessionId).toBe('new-session-123');
      expect(mockDebug.log).toHaveBeenCalledWith('Session updated: new-session-123');
    });

    it('should add new transactions from state', () => {
      const state = {
        transactions: [
          {
            id: 'backend-1',
            tokenId: 'token1',
            teamId: '001',
            timestamp: '2025-11-11T10:00:00Z',
            memoryType: 'Personal',
            group: 'Test',
            rating: 3,
          },
        ],
      };

      dataManager.updateGameState(state);

      expect(dataManager.transactions).toHaveLength(1);
      expect(dataManager.transactions[0].rfid).toBe('token1');
    });

    it('should not add duplicate transactions', () => {
      dataManager.transactions = [
        { id: 'existing-1', rfid: 'token1', timestamp: '2025-11-11T10:00:00Z' },
      ];

      const state = {
        transactions: [
          {
            id: 'existing-1',
            tokenId: 'token1',
            teamId: '001',
            timestamp: '2025-11-11T10:00:00Z',
          },
        ],
      };

      dataManager.updateGameState(state);

      expect(dataManager.transactions).toHaveLength(1);
    });

    it('should emit game-state:updated event after adding transactions', () => {
      // Listen for event that DataManager emits
      const eventListener = jest.fn();
      dataManager.addEventListener('game-state:updated', eventListener);

      const state = {
        transactions: [
          {
            id: 'backend-1',
            tokenId: 'token1',
            teamId: '001',
            timestamp: '2025-11-11T10:00:00Z',
            memoryType: 'Personal',
            group: 'Test',
            rating: 3,
          },
        ],
      };

      dataManager.updateGameState(state);

      expect(eventListener).toHaveBeenCalled(); // DataManager emits events, doesn't call UI directly
    });
  });

  describe('exportData', () => {
    beforeEach(() => {
      // Mock DOM APIs
      global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
      global.URL.revokeObjectURL = jest.fn();
      global.Blob = jest.fn(function(content, options) {
        this.content = content;
        this.options = options;
      });

      // Mock alert
      global.alert = jest.fn();
    });

    it('should alert when no transactions to export', () => {
      dataManager.exportData('json');

      expect(global.alert).toHaveBeenCalledWith('No transactions to export');
    });

    it('should export JSON format', () => {
      dataManager.transactions = [
        { id: '1', tokenId: 'token1', teamId: '001' },
      ];

      // Mock DOM createElement and appendChild
      const mockLink = {
        href: '',
        download: '',
        click: jest.fn(),
      };
      global.document.createElement = jest.fn(() => mockLink);
      global.document.body.appendChild = jest.fn();
      global.document.body.removeChild = jest.fn();

      dataManager.exportData('json');

      expect(global.Blob).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('token1')]),
        { type: 'application/json' }
      );
      expect(mockLink.download).toMatch(/transactions_\d+\.json/);
      expect(mockLink.click).toHaveBeenCalled();
    });

    it('should export CSV format', () => {
      dataManager.transactions = [
        {
          timestamp: '2025-11-11T10:00:00Z',
          deviceId: 'scanner-1',
          mode: 'blackmarket',
          teamId: '001',
          rfid: 'token1',
          memoryType: 'Personal',
          group: 'Test Group',
          valueRating: 5,
        },
      ];

      const mockLink = {
        href: '',
        download: '',
        click: jest.fn(),
      };
      global.document.createElement = jest.fn(() => mockLink);
      global.document.body.appendChild = jest.fn();
      global.document.body.removeChild = jest.fn();

      dataManager.exportData('csv');

      expect(global.Blob).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('timestamp')]),
        { type: 'text/csv' }
      );
      expect(mockLink.download).toMatch(/transactions_\d+\.csv/);
    });
  });

  describe('removeTransaction and duplicate detection', () => {
    it('should remove transaction from array', () => {
      const manager = new DataManager({ debug: mockDebug, sessionModeManager: mockSessionModeManager });

      // Add a transaction
      const transaction = {
        id: 'tx_123',
        tokenId: 'test_token_001',
        teamId: '001',
        timestamp: new Date().toISOString(),
        status: 'accepted'
      };

      manager.transactions.push(transaction);
      expect(manager.transactions.length).toBe(1);

      // Remove it
      const result = manager.removeTransaction('tx_123');

      expect(result).toBe(true);
      expect(manager.transactions.length).toBe(0);
    });

    it('should return false when transaction not found', () => {
      const manager = new DataManager({ debug: mockDebug, sessionModeManager: mockSessionModeManager });

      const result = manager.removeTransaction('nonexistent_tx');

      expect(result).toBe(false);
    });

    it('should emit transaction:deleted event', (done) => {
      const manager = new DataManager({ debug: mockDebug, sessionModeManager: mockSessionModeManager });

      const transaction = {
        id: 'tx_456',
        tokenId: 'test_token_002',
        teamId: '001',
        timestamp: new Date().toISOString()
      };

      manager.transactions.push(transaction);

      // Listen for event BEFORE triggering deletion
      manager.addEventListener('transaction:deleted', (event) => {
        expect(event.detail.transactionId).toBe('tx_456');
        expect(event.detail.transaction.tokenId).toBe('test_token_002');
        done();
      });

      manager.removeTransaction('tx_456');
    });

    it('should unmark token from scannedTokens Set when transaction deleted (BUG FIX)', () => {
      const manager = new DataManager({ debug: mockDebug, sessionModeManager: mockSessionModeManager });

      const tokenId = 'bug_fix_token';
      const transaction = {
        id: 'tx_bugfix',
        tokenId: tokenId,
        teamId: '001',
        timestamp: new Date().toISOString()
      };

      // Simulate scan: mark token as scanned
      manager.markTokenAsScanned(tokenId);
      manager.transactions.push(transaction);

      // Verify token is marked as scanned
      expect(manager.isTokenScanned(tokenId)).toBe(true);
      expect(manager.scannedTokens.has(tokenId)).toBe(true);

      // Delete the transaction
      manager.removeTransaction('tx_bugfix');

      // CRITICAL: Token should be unmarked to allow re-scanning
      expect(manager.isTokenScanned(tokenId)).toBe(false);
      expect(manager.scannedTokens.has(tokenId)).toBe(false);
    });

    it('should persist scannedTokens changes to localStorage after unmarking', () => {
      const manager = new DataManager({ debug: mockDebug, sessionModeManager: mockSessionModeManager });

      const tokenId = 'persistence_test_token';
      const transaction = {
        id: 'tx_persist',
        tokenId: tokenId,
        teamId: '001',
        timestamp: new Date().toISOString()
      };

      // Mark and add
      manager.markTokenAsScanned(tokenId);
      manager.transactions.push(transaction);

      // Verify saved
      const key = manager.getScannedTokensKey();
      let saved = JSON.parse(localStorage.getItem(key) || '[]');
      expect(saved).toContain(tokenId);

      // Delete transaction (should unmark and save)
      manager.removeTransaction('tx_persist');

      // Verify removed from localStorage
      saved = JSON.parse(localStorage.getItem(key) || '[]');
      expect(saved).not.toContain(tokenId);
    });

    it('should allow re-scanning after deletion (end-to-end scenario)', () => {
      const manager = new DataManager({ debug: mockDebug, sessionModeManager: mockSessionModeManager });

      const tokenId = 'rescan_token';
      const transaction1 = {
        id: 'tx_scan1',
        tokenId: tokenId,
        teamId: '001',
        timestamp: new Date().toISOString()
      };

      // First scan
      manager.markTokenAsScanned(tokenId);
      manager.transactions.push(transaction1);
      expect(manager.isTokenScanned(tokenId)).toBe(true);

      // Delete transaction
      manager.removeTransaction('tx_scan1');
      expect(manager.isTokenScanned(tokenId)).toBe(false);

      // Re-scan should work now
      const transaction2 = {
        id: 'tx_scan2',
        tokenId: tokenId,
        teamId: '001',
        timestamp: new Date().toISOString()
      };

      manager.markTokenAsScanned(tokenId);
      manager.transactions.push(transaction2);

      // Should have new transaction
      expect(manager.transactions.length).toBe(1);
      expect(manager.transactions[0].id).toBe('tx_scan2');
      expect(manager.isTokenScanned(tokenId)).toBe(true);
    });
  });
});
