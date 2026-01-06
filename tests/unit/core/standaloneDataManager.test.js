/**
 * @jest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { StandaloneDataManager } from '../../../src/core/standaloneDataManager.js';

describe('StandaloneDataManager - ES6 Module (Event-Driven)', () => {
  let manager;
  let mockTokenManager;
  let mockDebug;

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Mock TokenManager
    mockTokenManager = {
      getAllTokens: jest.fn(() => [
        { SF_RFID: 'token1', SF_Group: 'Server Logs (x5)', SF_ValueRating: 3, SF_MemoryType: 'Technical' },
        { SF_RFID: 'token2', SF_Group: 'Server Logs (x5)', SF_ValueRating: 4, SF_MemoryType: 'Technical' },
        { SF_RFID: 'token3', SF_Group: 'Marcus Sucks (x2)', SF_ValueRating: 2, SF_MemoryType: 'Personal' }
      ])
    };

    // Mock Debug
    mockDebug = {
      log: jest.fn()
    };

    // Create instance
    manager = new StandaloneDataManager({
      tokenManager: mockTokenManager,
      debug: mockDebug
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('Constructor & Initialization', () => {
    it('should create instance with default session data', () => {
      expect(manager.sessionData).toBeDefined();
      expect(manager.sessionData.sessionId).toMatch(/^LOCAL_\d+_[a-z0-9]+$/);
      expect(manager.sessionData.mode).toBe('standalone');
      expect(manager.sessionData.transactions).toEqual([]);
      expect(manager.sessionData.teams).toEqual({});
    });

    it('should inject tokenManager dependency', () => {
      expect(manager.tokenManager).toBe(mockTokenManager);
    });

    it('should inject debug dependency', () => {
      expect(manager.debug).toBe(mockDebug);
    });

    it('should extend EventTarget for event-driven architecture', () => {
      expect(manager).toBeInstanceOf(EventTarget);
      expect(typeof manager.addEventListener).toBe('function');
      expect(typeof manager.dispatchEvent).toBe('function');
    });

    it('should generate unique session IDs', () => {
      const id1 = manager.generateLocalSessionId();
      const id2 = manager.generateLocalSessionId();

      expect(id1).toMatch(/^LOCAL_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^LOCAL_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('addTransaction', () => {
    it('should add transaction to sessionData', () => {
      const transaction = {
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 1000,
        timestamp: new Date().toISOString()
      };

      manager.addTransaction(transaction);

      expect(manager.sessionData.transactions).toContainEqual(transaction);
      expect(manager.sessionData.transactions.length).toBe(1);
    });

    it('should emit transaction:added event', (done) => {
      const transaction = {
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 1000,
        timestamp: new Date().toISOString()
      };

      manager.addEventListener('transaction:added', (event) => {
        expect(event.detail.transaction).toEqual(transaction);
        expect(event.detail.sessionId).toBe(manager.sessionData.sessionId);
        expect(event.detail.totalTransactions).toBe(1);
        done();
      });

      manager.addTransaction(transaction);
    });

    it('should save session to localStorage', () => {
      const transaction = {
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 1000,
        timestamp: new Date().toISOString()
      };

      manager.addTransaction(transaction);

      const saved = localStorage.getItem('standaloneSession');
      expect(saved).toBeDefined();
      const parsed = JSON.parse(saved);
      expect(parsed.transactions).toContainEqual(transaction);
    });
  });

  describe('updateLocalScores - Blackmarket Mode', () => {
    it('should create team if it does not exist', () => {
      const transaction = {
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 1000,
        timestamp: new Date().toISOString()
      };

      manager.updateLocalScores(transaction);

      expect(manager.sessionData.teams['001']).toBeDefined();
      expect(manager.sessionData.teams['001'].teamId).toBe('001');
      expect(manager.sessionData.teams['001'].score).toBe(1000);
      expect(manager.sessionData.teams['001'].tokensScanned).toBe(1);
    });

    it('should update baseScore and total score for blackmarket mode', () => {
      const tx1 = {
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 1000,
        timestamp: new Date().toISOString()
      };

      const tx2 = {
        tokenId: 'token2',
        teamId: '001',
        mode: 'blackmarket',
        points: 5000,
        timestamp: new Date().toISOString()
      };

      manager.updateLocalScores(tx1);
      manager.updateLocalScores(tx2);

      const team = manager.sessionData.teams['001'];
      expect(team.baseScore).toBe(6000);
      expect(team.score).toBe(6000); // No bonuses yet
    });

    it('should NOT update score for detective mode', () => {
      const transaction = {
        tokenId: 'token1',
        teamId: '001',
        mode: 'detective',
        points: 1000,
        timestamp: new Date().toISOString()
      };

      manager.updateLocalScores(transaction);

      const team = manager.sessionData.teams['001'];
      expect(team.score).toBe(0); // No points in detective mode
      expect(team.tokensScanned).toBe(1); // But count is tracked
    });

    it('should increment tokensScanned counter', () => {
      const tx1 = { tokenId: 'token1', teamId: '001', mode: 'blackmarket', points: 100, timestamp: new Date().toISOString() };
      const tx2 = { tokenId: 'token2', teamId: '001', mode: 'blackmarket', points: 200, timestamp: new Date().toISOString() };

      manager.updateLocalScores(tx1);
      manager.updateLocalScores(tx2);

      expect(manager.sessionData.teams['001'].tokensScanned).toBe(2);
    });

    it('should update lastScanTime', () => {
      const timestamp = '2025-11-11T10:30:00Z';
      const transaction = {
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 1000,
        timestamp
      };

      manager.updateLocalScores(transaction);

      expect(manager.sessionData.teams['001'].lastScanTime).toBe(timestamp);
    });

    it('should emit team-score:updated event', (done) => {
      const transaction = {
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 1000,
        timestamp: new Date().toISOString()
      };

      manager.addEventListener('team-score:updated', (event) => {
        expect(event.detail.teamId).toBe('001');
        expect(event.detail.teamScores).toEqual(expect.arrayContaining([
          expect.objectContaining({ teamId: '001', score: 1000 })
        ]));
        done();
      });

      manager.updateLocalScores(transaction);
    });
  });

  describe('checkGroupCompletion', () => {
    it('should parse group name and multiplier correctly', () => {
      // Add first token in group
      const tx1 = {
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 5000,
        group: 'Server Logs (x5)', // Fixed: use 'group' not 'tokenGroup'
        timestamp: new Date().toISOString()
      };

      manager.addTransaction(tx1);

      // Group not completed yet (need token2)
      const team = manager.sessionData.teams['001'];
      expect(team.completedGroups).not.toContain('Server Logs');
    });

    it('should award bonus when all group tokens scanned', (done) => {
      // CRITICAL: Register event listener BEFORE any transactions to avoid race condition
      manager.addEventListener('standalone:group-completed', (event) => {
        expect(event.detail.groupId).toBe('Server Logs');
        expect(event.detail.multiplier).toBe(5);
        expect(event.detail.groupBaseScore).toBe(30000); // 5000 + 25000
        expect(event.detail.bonus).toBe(120000); // (5 - 1) * 30000
        done();
      });

      // Setup: Add token1 (5000 points)
      const tx1 = {
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 5000,
        group: 'Server Logs (x5)', // Fixed: use 'group' not 'tokenGroup' (implementation checks transaction.group)
        timestamp: new Date().toISOString()
      };

      manager.addTransaction(tx1);

      // Add token2 (25000 points) - completes group
      const tx2 = {
        tokenId: 'token2',
        teamId: '001',
        mode: 'blackmarket',
        points: 25000,
        group: 'Server Logs (x5)', // Fixed: use 'group' not 'tokenGroup'
        timestamp: new Date().toISOString()
      };

      manager.addTransaction(tx2);
    });

    it('should update team score with bonus points', () => {
      // Add both tokens in "Server Logs (x5)" group
      manager.addTransaction({
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 5000,
        group: 'Server Logs (x5)', // Fixed: use 'group' not 'tokenGroup'
        timestamp: new Date().toISOString()
      });

      manager.addTransaction({
        tokenId: 'token2',
        teamId: '001',
        mode: 'blackmarket',
        points: 25000,
        group: 'Server Logs (x5)', // Fixed: use 'group' not 'tokenGroup'
        timestamp: new Date().toISOString()
      });

      const team = manager.sessionData.teams['001'];
      expect(team.baseScore).toBe(30000); // 5000 + 25000
      expect(team.bonusPoints).toBe(120000); // (5 - 1) * 30000
      expect(team.score).toBe(150000); // 30000 + 120000
      expect(team.completedGroups).toContain('Server Logs');
    });

    it('should NOT award bonus twice for same group', () => {
      // Complete group
      manager.addTransaction({ tokenId: 'token1', teamId: '001', mode: 'blackmarket', points: 5000, group: 'Server Logs (x5)', timestamp: new Date().toISOString() });
      manager.addTransaction({ tokenId: 'token2', teamId: '001', mode: 'blackmarket', points: 25000, group: 'Server Logs (x5)', timestamp: new Date().toISOString() });

      const team = manager.sessionData.teams['001'];
      const firstBonus = team.bonusPoints;

      // Try to trigger again (should skip due to duplicate prevention at line 236)
      manager.checkGroupCompletion('001', 'Server Logs (x5)');

      expect(team.bonusPoints).toBe(firstBonus); // Unchanged - duplicate prevention works
    });

    it('should handle missing tokenManager gracefully', () => {
      const managerWithoutTokenManager = new StandaloneDataManager();

      const transaction = {
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 1000,
        group: 'Server Logs (x5)', // Fixed: use 'group' not 'tokenGroup'
        timestamp: new Date().toISOString()
      };

      expect(() => managerWithoutTokenManager.addTransaction(transaction)).not.toThrow();
    });

    it('should skip if group name has no multiplier', () => {
      const transaction = {
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 1000,
        group: 'No Multiplier Group', // Fixed: use 'group' not 'tokenGroup'. No (xN) pattern
        timestamp: new Date().toISOString()
      };

      manager.addTransaction(transaction);

      const team = manager.sessionData.teams['001'];
      expect(team.bonusPoints).toBe(0); // No bonus awarded
    });
  });

  describe('localStorage Persistence', () => {
    it('should save session to localStorage', () => {
      manager.addTransaction({
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 1000,
        timestamp: new Date().toISOString()
      });

      const saved = localStorage.getItem('standaloneSession');
      expect(saved).toBeDefined();

      const parsed = JSON.parse(saved);
      expect(parsed.sessionId).toBe(manager.sessionData.sessionId);
      expect(parsed.transactions.length).toBe(1);
    });

    it('should emit standalone:session-saved event', (done) => {
      manager.addEventListener('standalone:session-saved', (event) => {
        expect(event.detail.sessionId).toBe(manager.sessionData.sessionId);
        expect(event.detail.totalTransactions).toBeGreaterThanOrEqual(0);
        done();
      });

      manager.saveLocalSession();
    });

    it('should load session from localStorage if from today', () => {
      const sessionData = {
        sessionId: 'TEST_SESSION',
        startTime: new Date().toISOString(),
        transactions: [{ id: 1 }],
        teams: { '001': { score: 5000 } },
        mode: 'standalone'
      };

      localStorage.setItem('standaloneSession', JSON.stringify(sessionData));

      const newManager = new StandaloneDataManager({ tokenManager: mockTokenManager });

      expect(newManager.sessionData.sessionId).toBe('TEST_SESSION');
      expect(newManager.sessionData.transactions.length).toBe(1);
      expect(newManager.sessionData.teams['001'].score).toBe(5000);
    });

    it('should NOT load session from a different day', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const sessionData = {
        sessionId: 'OLD_SESSION',
        startTime: yesterday.toISOString(),
        transactions: [{ id: 1 }],
        teams: {},
        mode: 'standalone'
      };

      localStorage.setItem('standaloneSession', JSON.stringify(sessionData));

      const newManager = new StandaloneDataManager({ tokenManager: mockTokenManager });

      expect(newManager.sessionData.sessionId).not.toBe('OLD_SESSION');
      expect(newManager.sessionData.transactions.length).toBe(0);
    });

    it('should emit standalone:session-loaded event when loading', (done) => {
      const sessionData = {
        sessionId: 'TEST_SESSION',
        startTime: new Date().toISOString(),
        transactions: [],
        teams: {},
        mode: 'standalone'
      };

      localStorage.setItem('standaloneSession', JSON.stringify(sessionData));

      const newManager = new StandaloneDataManager({ tokenManager: mockTokenManager });

      newManager.addEventListener('standalone:session-loaded', (event) => {
        expect(event.detail.sessionId).toBe('TEST_SESSION');
        done();
      });

      newManager.loadLocalSession();
    });

    it('should handle corrupted localStorage data gracefully', () => {
      localStorage.setItem('standaloneSession', 'INVALID_JSON{{{');

      expect(() => new StandaloneDataManager({ tokenManager: mockTokenManager })).not.toThrow();
    });
  });

  describe('Utility Methods', () => {
    it('should return sorted team scores', () => {
      manager.addTransaction({ tokenId: 'token1', teamId: '001', mode: 'blackmarket', points: 1000, timestamp: new Date().toISOString() });
      manager.addTransaction({ tokenId: 'token2', teamId: '002', mode: 'blackmarket', points: 5000, timestamp: new Date().toISOString() });
      manager.addTransaction({ tokenId: 'token3', teamId: '003', mode: 'blackmarket', points: 2500, timestamp: new Date().toISOString() });

      const scores = manager.getTeamScores();

      expect(scores.length).toBe(3);
      expect(scores[0].teamId).toBe('002'); // Highest: 5000
      expect(scores[1].teamId).toBe('003'); // Middle: 2500
      expect(scores[2].teamId).toBe('001'); // Lowest: 1000
    });

    it('should return session stats', () => {
      // Set app.currentTeamId so getSessionStats returns team-specific stats
      manager.app = { currentTeamId: '001' };

      manager.addTransaction({ tokenId: 'token1', teamId: '001', mode: 'blackmarket', points: 1000, timestamp: new Date().toISOString() });

      const stats = manager.getSessionStats();

      // getSessionStats returns { count, totalValue, totalScore } for UIManager compatibility (line 604-629)
      // It does NOT return sessionId, totalTransactions, totalTeams, or mode
      expect(stats.count).toBe(1); // One transaction for team 001
      expect(stats.totalScore).toBe(1000); // Score for team 001
      expect(stats.totalValue).toBeGreaterThanOrEqual(0); // Value rating sum
    });

    it('should export session as JSON blob', () => {
      global.URL.createObjectURL = jest.fn(() => 'blob:test');
      global.URL.revokeObjectURL = jest.fn();

      const clickSpy = jest.fn();
      document.createElement = jest.fn((tag) => {
        if (tag === 'a') {
          return { click: clickSpy, href: '', download: '' };
        }
        return document.createElement(tag);
      });

      manager.exportSession();

      expect(clickSpy).toHaveBeenCalled();
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    });

    it('should clear session and generate new session ID', () => {
      global.confirm = jest.fn(() => false); // Don't export

      const oldSessionId = manager.sessionData.sessionId;
      manager.addTransaction({ tokenId: 'token1', teamId: '001', mode: 'blackmarket', points: 1000, timestamp: new Date().toISOString() });

      manager.clearSession();

      expect(manager.sessionData.sessionId).not.toBe(oldSessionId);
      expect(manager.sessionData.transactions.length).toBe(0);
      expect(Object.keys(manager.sessionData.teams).length).toBe(0);
      expect(localStorage.getItem('standaloneSession')).toBeNull();
    });
  });

  describe('Event-Driven Integration', () => {
    it('should emit multiple events during transaction processing', () => {
      const events = [];

      manager.addEventListener('transaction:added', () => events.push('transaction-added'));
      manager.addEventListener('team-score:updated', () => events.push('scores-updated'));
      manager.addEventListener('standalone:session-saved', () => events.push('session-saved'));

      manager.addTransaction({
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 1000,
        timestamp: new Date().toISOString()
      });

      expect(events).toContain('transaction-added');
      expect(events).toContain('scores-updated');
      expect(events).toContain('session-saved');
    });

    it('should allow multiple listeners on same event', (done) => {
      let listener1Called = false;
      let listener2Called = false;

      manager.addEventListener('transaction:added', () => {
        listener1Called = true;
      });

      manager.addEventListener('transaction:added', () => {
        listener2Called = true;
        expect(listener1Called).toBe(true);
        done();
      });

      manager.addTransaction({
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 1000,
        timestamp: new Date().toISOString()
      });
    });
  });

  describe('removeTransaction', () => {
    beforeEach(() => {
      // Setup: Add initial transactions
      manager.addTransaction({
        id: 'tx_001',
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 1000,
        rfid: 'token1',
        group: 'Server Logs (x5)',
        valueRating: 3,
        memoryType: 'Technical',
        timestamp: new Date().toISOString()
      });

      manager.addTransaction({
        id: 'tx_002',
        tokenId: 'token2',
        teamId: '001',
        mode: 'blackmarket',
        points: 5000,
        rfid: 'token2',
        group: 'Server Logs (x5)',
        valueRating: 4,
        memoryType: 'Technical',
        timestamp: new Date().toISOString()
      });
    });

    it('should remove transaction from sessionData', () => {
      const result = manager.removeTransaction('tx_001');

      expect(result).toBeDefined();
      expect(result.tokenId).toBe('token1');
      expect(manager.sessionData.transactions).toHaveLength(1);
      expect(manager.sessionData.transactions[0].id).toBe('tx_002');
    });

    it('should remove token from scannedTokens Set to allow re-scanning', () => {
      // Verify token is in scannedTokens before deletion
      expect(manager.scannedTokens.has('token1')).toBe(true);

      manager.removeTransaction('tx_001');

      // Token should be removed from scannedTokens
      expect(manager.scannedTokens.has('token1')).toBe(false);
      // token2 should still be there
      expect(manager.scannedTokens.has('token2')).toBe(true);
    });

    it('should NOT remove token if other transactions use same token', () => {
      // Add another transaction with same token for different team
      manager.addTransaction({
        id: 'tx_003',
        tokenId: 'token1',
        teamId: '002',
        mode: 'blackmarket',
        points: 1000,
        rfid: 'token1',
        timestamp: new Date().toISOString()
      });

      manager.removeTransaction('tx_001');

      // Token should still be in scannedTokens because tx_003 uses it
      expect(manager.scannedTokens.has('token1')).toBe(true);
    });

    it('should recalculate affected team score', () => {
      // Initial score should be 6000 (1000 + 5000)
      const teamBefore = manager.sessionData.teams['001'];
      expect(teamBefore.baseScore).toBe(6000);
      expect(teamBefore.tokensScanned).toBe(2);

      manager.removeTransaction('tx_001');

      // After deletion, score should be recalculated from remaining transactions
      const teamAfter = manager.sessionData.teams['001'];
      expect(teamAfter.baseScore).toBe(5000); // Only tx_002 remains
      expect(teamAfter.tokensScanned).toBe(1);
    });

    it('should emit transaction:deleted event', (done) => {
      manager.addEventListener('transaction:deleted', (event) => {
        expect(event.detail.transaction).toBeDefined();
        expect(event.detail.transaction.id).toBe('tx_001');
        expect(event.detail.teamId).toBe('001');
        done();
      });

      manager.removeTransaction('tx_001');
    });

    it('should update localStorage', () => {
      manager.removeTransaction('tx_001');

      const saved = localStorage.getItem('standaloneSession');
      expect(saved).toBeDefined();
      const parsed = JSON.parse(saved);
      expect(parsed.transactions).toHaveLength(1);
      expect(parsed.transactions[0].id).toBe('tx_002');
    });

    it('should return null if transaction not found', () => {
      const result = manager.removeTransaction('non_existent_tx');
      expect(result).toBeNull();
    });
  });

  describe('adjustTeamScore', () => {
    beforeEach(() => {
      // Setup: Add transaction to create team with initial score
      manager.addTransaction({
        id: 'tx_001',
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 1000,
        rfid: 'token1',
        timestamp: new Date().toISOString()
      });
    });

    it('should add delta to team score', () => {
      const teamBefore = manager.sessionData.teams['001'];
      expect(teamBefore.score).toBe(1000);

      manager.adjustTeamScore('001', 500, 'Bonus points');

      const teamAfter = manager.sessionData.teams['001'];
      expect(teamAfter.score).toBe(1500);
    });

    it('should record adjustment in adminAdjustments array', () => {
      manager.adjustTeamScore('001', 500, 'Bonus points');

      const team = manager.sessionData.teams['001'];
      expect(team.adminAdjustments).toBeDefined();
      expect(team.adminAdjustments).toHaveLength(1);
      expect(team.adminAdjustments[0].delta).toBe(500);
      expect(team.adminAdjustments[0].reason).toBe('Bonus points');
    });

    it('should include delta, reason, timestamp, gmStation in record', () => {
      manager.adjustTeamScore('001', -200, 'Penalty');

      const adjustment = manager.sessionData.teams['001'].adminAdjustments[0];
      expect(adjustment.delta).toBe(-200);
      expect(adjustment.reason).toBe('Penalty');
      expect(adjustment.timestamp).toBeDefined();
      expect(adjustment.gmStation).toBe('standalone');
    });

    it('should emit standalone:score-adjusted event', (done) => {
      manager.addEventListener('standalone:score-adjusted', (event) => {
        expect(event.detail.teamId).toBe('001');
        expect(event.detail.delta).toBe(300);
        expect(event.detail.reason).toBe('Test adjustment');
        expect(event.detail.newScore).toBe(1300);
        done();
      });

      manager.adjustTeamScore('001', 300, 'Test adjustment');
    });

    it('should persist changes to localStorage', () => {
      manager.adjustTeamScore('001', 750, 'Extra points');

      const saved = localStorage.getItem('standaloneSession');
      expect(saved).toBeDefined();
      const parsed = JSON.parse(saved);
      expect(parsed.teams['001'].score).toBe(1750);
      expect(parsed.teams['001'].adminAdjustments).toHaveLength(1);
    });

    it('should throw error if team not found', () => {
      expect(() => {
        manager.adjustTeamScore('999', 100, 'Test');
      }).toThrow('Team 999 not found');
    });

    it('should handle positive and negative deltas correctly', () => {
      manager.adjustTeamScore('001', 500, 'Bonus');
      expect(manager.sessionData.teams['001'].score).toBe(1500);

      manager.adjustTeamScore('001', -300, 'Penalty');
      expect(manager.sessionData.teams['001'].score).toBe(1200);

      // Check both adjustments are recorded
      const adjustments = manager.sessionData.teams['001'].adminAdjustments;
      expect(adjustments).toHaveLength(2);
      expect(adjustments[0].delta).toBe(500);
      expect(adjustments[1].delta).toBe(-300);
    });

    it('should use default reason if not provided', () => {
      manager.adjustTeamScore('001', 100);

      const adjustment = manager.sessionData.teams['001'].adminAdjustments[0];
      expect(adjustment.reason).toBe('Manual GM adjustment');
    });
  });

  describe('getGameActivity (API Parity with DataManager)', () => {
    let manager;

    beforeEach(() => {
      localStorage.clear();
      manager = new StandaloneDataManager({ tokenManager: null });
    });

    it('should return empty activity when no transactions', () => {
      const activity = manager.getGameActivity();

      expect(activity.tokens).toEqual([]);
      expect(activity.stats.totalTokens).toBe(0);
      expect(activity.stats.available).toBe(0);
      expect(activity.stats.claimed).toBe(0);
      expect(activity.stats.claimedWithoutDiscovery).toBe(0);
      expect(activity.stats.totalPlayerScans).toBe(0);
    });

    it('should track GM claims (no player scans in standalone mode)', () => {
      manager.addTransaction({
        id: 'tx_001',
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 50000,
        valueRating: 3,
        memoryType: 'Personal',
        timestamp: '2025-01-05T10:00:00Z'
      });

      const activity = manager.getGameActivity();

      expect(activity.tokens).toHaveLength(1);
      expect(activity.tokens[0].tokenId).toBe('token1');
      expect(activity.tokens[0].status).toBe('claimed');
      expect(activity.tokens[0].discoveredByPlayers).toBe(false); // No player scans in standalone
      expect(activity.tokens[0].events).toHaveLength(1);
      expect(activity.tokens[0].events[0].type).toBe('claim');
      expect(activity.tokens[0].events[0].teamId).toBe('001');
    });

    it('should calculate potentialValue for tokens', () => {
      manager.addTransaction({
        id: 'tx_001',
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 250000,
        valueRating: 3,
        memoryType: 'Technical',
        timestamp: '2025-01-05T10:00:00Z'
      });

      const activity = manager.getGameActivity();

      // 3-star Technical = 50000 * 5 = 250000
      expect(activity.tokens[0].potentialValue).toBe(250000);
    });

    it('should include points in claim events', () => {
      manager.addTransaction({
        id: 'tx_001',
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 150000,
        valueRating: 5,
        memoryType: 'Personal',
        timestamp: '2025-01-05T10:00:00Z'
      });

      const activity = manager.getGameActivity();
      const claim = activity.tokens[0].events[0];

      expect(claim.points).toBe(150000);
      expect(claim.mode).toBe('blackmarket');
    });

    it('should handle multiple tokens with claims', () => {
      manager.addTransaction({
        id: 'tx_001',
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 10000,
        valueRating: 1,
        memoryType: 'Personal',
        timestamp: '2025-01-05T09:00:00Z'
      });
      manager.addTransaction({
        id: 'tx_002',
        tokenId: 'token2',
        teamId: '002',
        mode: 'blackmarket',
        points: 25000,
        valueRating: 2,
        memoryType: 'Personal',
        timestamp: '2025-01-05T10:00:00Z'
      });

      const activity = manager.getGameActivity();

      expect(activity.tokens).toHaveLength(2);
      expect(activity.stats.totalTokens).toBe(2);
      expect(activity.stats.claimed).toBe(2);
      expect(activity.stats.claimedWithoutDiscovery).toBe(2); // All without player discovery in standalone
    });

    it('should sort events by timestamp', () => {
      // Add same token twice (different teams) - edge case
      manager.sessionData.transactions.push({
        id: 'tx_001',
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 10000,
        valueRating: 1,
        memoryType: 'Personal',
        timestamp: '2025-01-05T11:00:00Z'
      });
      manager.sessionData.transactions.push({
        id: 'tx_002',
        tokenId: 'token1',
        teamId: '002',
        mode: 'detective',
        points: 0,
        timestamp: '2025-01-05T09:00:00Z'
      });

      const activity = manager.getGameActivity();
      const events = activity.tokens[0].events;

      // Earlier timestamp should come first
      expect(events[0].timestamp).toBe('2025-01-05T09:00:00Z');
      expect(events[1].timestamp).toBe('2025-01-05T11:00:00Z');
    });

    it('should include summary in claim events', () => {
      manager.addTransaction({
        id: 'tx_001',
        tokenId: 'token1',
        teamId: '001',
        mode: 'detective',
        summary: 'This is a test summary',
        points: 0,
        valueRating: 2,
        memoryType: 'Business',
        timestamp: '2025-01-05T10:00:00Z'
      });

      const activity = manager.getGameActivity();
      const claim = activity.tokens[0].events[0];

      expect(claim.summary).toBe('This is a test summary');
    });
  });
});
