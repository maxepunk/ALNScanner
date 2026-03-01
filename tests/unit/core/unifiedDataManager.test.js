import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UnifiedDataManager } from '../../../src/core/unifiedDataManager.js';

describe('UnifiedDataManager', () => {
  let manager;
  let mockTokenManager;
  let mockSessionModeManager;

  beforeEach(() => {
    mockTokenManager = {
      getAllTokens: jest.fn(() => []),
      findToken: jest.fn(() => null),
      getGroupInventory: jest.fn(() => ({}))
    };
    mockSessionModeManager = {
      isStandalone: jest.fn(() => true),
      isNetworked: jest.fn(() => false)
    };
  });

  describe('instantiation', () => {
    it('should create instance with dependencies', () => {
      manager = new UnifiedDataManager({
        tokenManager: mockTokenManager,
        sessionModeManager: mockSessionModeManager
      });

      expect(manager).toBeDefined();
      expect(manager.tokenManager).toBe(mockTokenManager);
    });
  });

  describe('strategy initialization', () => {
    it('should initialize standalone mode with LocalStorage', async () => {
      mockSessionModeManager.isStandalone.mockReturnValue(true);
      manager = new UnifiedDataManager({
        tokenManager: mockTokenManager,
        sessionModeManager: mockSessionModeManager
      });

      await manager.initializeStandaloneMode();

      expect(manager.isReady()).toBe(true);
      expect(manager.getActiveStrategyType()).toBe('local');
    });

    it('should initialize networked mode with NetworkedStorage', async () => {
      mockSessionModeManager.isNetworked.mockReturnValue(true);
      mockSessionModeManager.isStandalone.mockReturnValue(false);

      // Mock socket.io client
      const mockSocket = {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
        connected: true
      };

      manager = new UnifiedDataManager({
        tokenManager: mockTokenManager,
        sessionModeManager: mockSessionModeManager
      });

      await manager.initializeNetworkedMode(mockSocket);

      expect(manager.isReady()).toBe(true);
      expect(manager.getActiveStrategyType()).toBe('networked');
    });

    it('should not be ready before initialization', () => {
      manager = new UnifiedDataManager({
        tokenManager: mockTokenManager,
        sessionModeManager: mockSessionModeManager
      });

      expect(manager.isReady()).toBe(false);
      expect(manager.getActiveStrategyType()).toBeNull();
    });
  });

  describe('delegated operations', () => {
    beforeEach(async () => {
      mockSessionModeManager.isStandalone.mockReturnValue(true);
      manager = new UnifiedDataManager({
        tokenManager: mockTokenManager,
        sessionModeManager: mockSessionModeManager
      });
      await manager.initializeStandaloneMode();
    });

    it('should delegate addTransaction to strategy', async () => {
      const transaction = {
        id: 'tx-1',
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 50000,
        valueRating: 3,
        memoryType: 'Personal',
        timestamp: new Date().toISOString()
      };

      const result = await manager.addTransaction(transaction);

      expect(result.success).toBe(true);
      expect(manager.getTransactions()).toHaveLength(1);
    });

    it('should delegate getTeamScores to strategy', async () => {
      await manager.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: 'Alpha',
        mode: 'blackmarket', points: 50000,
        valueRating: 3, memoryType: 'Personal',
        timestamp: new Date().toISOString()
      });

      const scores = manager.getTeamScores();

      expect(scores).toHaveLength(1);
      expect(scores[0].teamId).toBe('Alpha');
      expect(scores[0].score).toBe(50000);
    });

    it('should delegate removeTransaction to strategy', async () => {
      await manager.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 50000,
        valueRating: 3, memoryType: 'Personal',
        timestamp: new Date().toISOString()
      });

      const result = await manager.removeTransaction('tx-1');

      expect(result.success).toBe(true);
      expect(manager.getTransactions()).toHaveLength(0);
    });

    it('should throw if operation called before initialization', async () => {
      const uninitializedManager = new UnifiedDataManager({
        tokenManager: mockTokenManager,
        sessionModeManager: mockSessionModeManager
      });

      expect(() => uninitializedManager.getTransactions()).toThrow(
        'UnifiedDataManager: No active strategy'
      );
    });
  });

  describe('dispose', () => {
    it('should clean up resources when disposed', async () => {
      mockSessionModeManager.isStandalone.mockReturnValue(true);
      manager = new UnifiedDataManager({
        tokenManager: mockTokenManager,
        sessionModeManager: mockSessionModeManager
      });
      await manager.initializeStandaloneMode();

      // Verify initialized
      expect(manager.isReady()).toBe(true);
      expect(manager.getActiveStrategyType()).toBe('local');

      // Dispose
      manager.dispose();

      // Should be reset
      expect(manager.isReady()).toBe(false);
      expect(manager.getActiveStrategyType()).toBeNull();
    });

    it('should allow dispose before initialization', () => {
      manager = new UnifiedDataManager({
        tokenManager: mockTokenManager,
        sessionModeManager: mockSessionModeManager
      });

      // Should not throw
      expect(() => manager.dispose()).not.toThrow();
    });

    it('should clean up event listeners on dispose', async () => {
      mockSessionModeManager.isStandalone.mockReturnValue(true);
      manager = new UnifiedDataManager({
        tokenManager: mockTokenManager,
        sessionModeManager: mockSessionModeManager
      });
      await manager.initializeStandaloneMode();

      // Get strategy listener count before dispose
      const listenerMapSize = manager._strategyListeners.size;
      expect(listenerMapSize).toBe(1); // One strategy

      // Dispose
      manager.dispose();

      // Listeners should be cleared
      expect(manager._strategyListeners.size).toBe(0);
    });
  });

  describe('utility methods (backward compatibility)', () => {
    beforeEach(async () => {
      mockSessionModeManager.isStandalone.mockReturnValue(true);
      manager = new UnifiedDataManager({
        tokenManager: mockTokenManager,
        sessionModeManager: mockSessionModeManager
      });
      await manager.initializeStandaloneMode();
    });

    it('should track scanned tokens with isTokenScanned/markTokenAsScanned', () => {
      expect(manager.isTokenScanned('token1')).toBe(false);

      manager.markTokenAsScanned('token1');

      expect(manager.isTokenScanned('token1')).toBe(true);
    });

    it('should unmark scanned tokens', () => {
      manager.markTokenAsScanned('token1');
      expect(manager.isTokenScanned('token1')).toBe(true);

      manager.unmarkTokenAsScanned('token1');

      expect(manager.isTokenScanned('token1')).toBe(false);
    });

    it('should calculate token value', () => {
      const transaction = {
        valueRating: 3,
        memoryType: 'Personal'
      };

      const value = manager.calculateTokenValue(transaction);

      expect(value).toBe(50000); // 3-star Personal = $50,000
    });

    it('should get team transactions', async () => {
      await manager.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: 'Alpha',
        mode: 'blackmarket', points: 50000,
        valueRating: 3, memoryType: 'Personal',
        timestamp: new Date().toISOString()
      });
      await manager.addTransaction({
        id: 'tx-2', tokenId: 'token2', teamId: 'Beta',
        mode: 'blackmarket', points: 25000,
        valueRating: 2, memoryType: 'Personal',
        timestamp: new Date().toISOString()
      });

      const alphaTransactions = manager.getTeamTransactions('Alpha');

      expect(alphaTransactions).toHaveLength(1);
      expect(alphaTransactions[0].teamId).toBe('Alpha');
    });
  });

  describe('event forwarding', () => {
    beforeEach(async () => {
      mockSessionModeManager.isStandalone.mockReturnValue(true);
      manager = new UnifiedDataManager({
        tokenManager: mockTokenManager,
        sessionModeManager: mockSessionModeManager
      });
      await manager.initializeStandaloneMode();
    });

    it('should forward session:updated events from strategy', (done) => {
      // Register listener BEFORE triggering action
      manager.addEventListener('session:updated', (event) => {
        expect(event.detail).toBeDefined();
        expect(event.detail.session).toBeDefined();
        expect(event.detail.session.status).toBe('paused');
        done();
      });

      // Create a session first, then pause it to trigger session:updated
      manager.createSession('Test Session', []).then(() => {
        manager.pauseSession();
      });
    });

    it('should include session:updated in wired events list', () => {
      // Verify the events array includes session:updated by checking listeners
      const strategy = manager._localStrategy;
      const listeners = manager._strategyListeners.get(strategy);

      const eventNames = listeners.map(l => l.eventName);
      expect(eventNames).toContain('session:updated');
    });
  });

  describe('advanced methods', () => {
    beforeEach(async () => {
      mockSessionModeManager.isStandalone.mockReturnValue(true);
      manager = new UnifiedDataManager({
        tokenManager: mockTokenManager,
        sessionModeManager: mockSessionModeManager
      });
      await manager.initializeStandaloneMode();
    });

    it('should parse group info from group string', () => {
      const result = manager.parseGroupInfo('Server Logs (x5)');

      expect(result.name).toBe('Server Logs');
      expect(result.multiplier).toBe(5);
    });

    it('should normalize group names', () => {
      const normalized = manager.normalizeGroupName('Server Logs');

      // scoring.js preserves single spaces, just lowercases
      expect(normalized).toBe('server logs');
    });

    it('should reset for new session', async () => {
      manager.markTokenAsScanned('token1');
      await manager.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 50000,
        valueRating: 3, memoryType: 'Personal',
        timestamp: new Date().toISOString()
      });
      expect(manager.isTokenScanned('token1')).toBe(true);

      manager.resetForNewSession();

      expect(manager.isTokenScanned('token1')).toBe(false);
    });

    it('should clear all data via resetForNewSession', () => {
      manager.markTokenAsScanned('token1');

      manager.resetForNewSession();

      expect(manager.isTokenScanned('token1')).toBe(false);
    });

    it('should get enhanced team transactions', async () => {
      await manager.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: 'Alpha',
        mode: 'blackmarket', points: 50000,
        valueRating: 3, memoryType: 'Personal',
        timestamp: new Date().toISOString()
      });

      const enhanced = manager.getEnhancedTeamTransactions('Alpha');

      // Method returns organization data, not summary fields
      expect(enhanced.hasCompletedGroups).toBe(false);
      expect(enhanced.hasIncompleteGroups).toBe(false);
      expect(enhanced.hasUngroupedTokens).toBe(true);  // No group = ungrouped
      expect(enhanced.ungroupedTokens).toHaveLength(1);
      expect(enhanced.ungroupedTokens[0].tokenId).toBe('token1');
    });
  });

  describe('getSessionStats', () => {
    beforeEach(async () => {
      mockSessionModeManager.isStandalone.mockReturnValue(true);
      manager = new UnifiedDataManager({
        tokenManager: mockTokenManager,
        sessionModeManager: mockSessionModeManager
      });
      await manager.initializeStandaloneMode();
    });

    it('should return stats for current team when app is wired', async () => {
      const tx = {
        tokenId: 'test001', teamId: 'TeamA', mode: 'blackmarket',
        valueRating: 3, memoryType: 'Personal', points: 50000,
        timestamp: new Date().toISOString()
      };
      await manager.addTransaction(tx);

      // Wire app reference with currentTeamId
      manager.app = { currentTeamId: 'TeamA' };

      const stats = manager.getSessionStats();
      expect(stats.count).toBe(1);
      expect(stats.totalScore).toBeGreaterThanOrEqual(0);
    });

    it('should return zeros when no app is wired', () => {
      manager.app = null;
      const stats = manager.getSessionStats();
      expect(stats).toEqual({ count: 0, totalValue: 0, totalScore: 0 });
    });

    it('should return zeros when no team is selected', () => {
      manager.app = { currentTeamId: '' };
      const stats = manager.getSessionStats();
      expect(stats).toEqual({ count: 0, totalValue: 0, totalScore: 0 });
    });
  });
});
