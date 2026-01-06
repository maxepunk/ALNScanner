// ALNScanner/tests/unit/core/storage/LocalStorage.test.js
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { LocalStorage } from '../../../../src/core/storage/LocalStorage.js';

describe('LocalStorage Strategy', () => {
  let storage;
  let mockTokenManager;
  let mockDebug;

  beforeEach(() => {
    localStorage.clear();

    mockTokenManager = {
      getAllTokens: jest.fn(() => []),
      findToken: jest.fn()
    };

    mockDebug = {
      log: jest.fn()
    };

    storage = new LocalStorage({
      tokenManager: mockTokenManager,
      debug: mockDebug
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('constructor', () => {
    it('should create instance with dependencies', () => {
      expect(storage.tokenManager).toBe(mockTokenManager);
      expect(storage.debug).toBe(mockDebug);
    });

    it('should initialize empty session data', () => {
      expect(storage.sessionData).toBeDefined();
      expect(storage.sessionData.transactions).toEqual([]);
      expect(storage.sessionData.teams).toEqual({});
    });
  });

  describe('isReady', () => {
    it('should return true (localStorage always available)', () => {
      expect(storage.isReady()).toBe(true);
    });
  });

  describe('initialize', () => {
    it('should resolve immediately', async () => {
      await expect(storage.initialize()).resolves.toBeUndefined();
    });
  });

  describe('addTransaction', () => {
    it('should add transaction to session', async () => {
      const tx = {
        id: 'tx-1',
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 10000,
        valueRating: 1,
        memoryType: 'Personal',
        timestamp: new Date().toISOString()
      };

      const result = await storage.addTransaction(tx);

      expect(result.success).toBe(true);
      expect(storage.getTransactions()).toHaveLength(1);
      expect(storage.getTransactions()[0].tokenId).toBe('token1');
    });

    it('should update team score for blackmarket transactions', async () => {
      const tx = {
        id: 'tx-1',
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 50000,
        valueRating: 3,
        memoryType: 'Personal',
        timestamp: new Date().toISOString()
      };

      await storage.addTransaction(tx);

      const scores = storage.getTeamScores();
      expect(scores).toHaveLength(1);
      expect(scores[0].score).toBe(50000);
    });

    it('should mark token as scanned', async () => {
      const tx = {
        id: 'tx-1',
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 10000,
        timestamp: new Date().toISOString()
      };

      await storage.addTransaction(tx);

      expect(storage.scannedTokens.has('token1')).toBe(true);
    });

    it('should persist to localStorage', async () => {
      const tx = {
        id: 'tx-1',
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        points: 10000,
        timestamp: new Date().toISOString()
      };

      await storage.addTransaction(tx);

      const saved = JSON.parse(localStorage.getItem('standaloneSession'));
      expect(saved.transactions).toHaveLength(1);
    });
  });

  describe('removeTransaction', () => {
    it('should remove transaction and recalculate scores', async () => {
      // Add two transactions
      await storage.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 10000, timestamp: new Date().toISOString()
      });
      await storage.addTransaction({
        id: 'tx-2', tokenId: 'token2', teamId: '001',
        mode: 'blackmarket', points: 25000, timestamp: new Date().toISOString()
      });

      expect(storage.getTeamScores()[0].score).toBe(35000);

      // Remove first
      const result = await storage.removeTransaction('tx-1');

      expect(result.success).toBe(true);
      expect(storage.getTransactions()).toHaveLength(1);
      expect(storage.getTeamScores()[0].score).toBe(25000);
    });

    it('should return error for non-existent transaction', async () => {
      const result = await storage.removeTransaction('non-existent');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should allow token re-scanning after removal', async () => {
      await storage.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 10000, timestamp: new Date().toISOString()
      });

      expect(storage.scannedTokens.has('token1')).toBe(true);

      await storage.removeTransaction('tx-1');

      expect(storage.scannedTokens.has('token1')).toBe(false);
    });
  });

  describe('adjustTeamScore', () => {
    it('should adjust existing team score', async () => {
      // Create team via transaction
      await storage.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 10000, timestamp: new Date().toISOString()
      });

      const result = await storage.adjustTeamScore('001', 5000, 'Bonus award');

      expect(result.success).toBe(true);
      expect(storage.getTeamScores()[0].score).toBe(15000);
    });

    it('should track adjustment in audit trail', async () => {
      await storage.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 10000, timestamp: new Date().toISOString()
      });

      await storage.adjustTeamScore('001', -2000, 'Penalty');

      const team = storage.sessionData.teams['001'];
      expect(team.adminAdjustments).toHaveLength(1);
      expect(team.adminAdjustments[0].delta).toBe(-2000);
      expect(team.adminAdjustments[0].reason).toBe('Penalty');
    });

    it('should fail for non-existent team', async () => {
      const result = await storage.adjustTeamScore('non-existent', 100, 'test');
      expect(result.success).toBe(false);
    });
  });

  describe('getGameActivity', () => {
    it('should return empty activity for new session', () => {
      const activity = storage.getGameActivity();

      expect(activity.tokens).toEqual([]);
      expect(activity.stats.totalTokens).toBe(0);
    });

    it('should include GM transactions as claims', async () => {
      await storage.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 50000, valueRating: 3, memoryType: 'Personal',
        timestamp: '2025-01-05T10:00:00Z'
      });

      const activity = storage.getGameActivity();

      expect(activity.tokens).toHaveLength(1);
      expect(activity.tokens[0].tokenId).toBe('token1');
      expect(activity.tokens[0].status).toBe('claimed');
      expect(activity.tokens[0].events[0].type).toBe('claim');
      expect(activity.tokens[0].events[0].teamId).toBe('001');
    });

    it('should calculate stats correctly', async () => {
      await storage.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 50000, timestamp: new Date().toISOString()
      });
      await storage.addTransaction({
        id: 'tx-2', tokenId: 'token2', teamId: '002',
        mode: 'blackmarket', points: 75000, timestamp: new Date().toISOString()
      });

      const activity = storage.getGameActivity();

      expect(activity.stats.totalTokens).toBe(2);
      expect(activity.stats.claimed).toBe(2);
      expect(activity.stats.available).toBe(0);
    });
  });

  describe('session lifecycle', () => {
    it('should create new session', async () => {
      const session = await storage.createSession('Test Game', []);

      expect(session.sessionId).toMatch(/^LOCAL_/);
      expect(storage.getTransactions()).toHaveLength(0);
    });

    it('should get current session', () => {
      const session = storage.getCurrentSession();

      expect(session).toBeDefined();
      expect(session.sessionId).toMatch(/^LOCAL_/);
      expect(session.status).toBe('active');
    });

    it('should end session and persist', async () => {
      await storage.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 10000, timestamp: new Date().toISOString()
      });

      await storage.endSession();

      const saved = JSON.parse(localStorage.getItem('standaloneSession'));
      expect(saved.transactions).toHaveLength(1);
    });
  });
});
