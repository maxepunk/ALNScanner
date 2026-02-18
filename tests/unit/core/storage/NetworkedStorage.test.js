// ALNScanner/tests/unit/core/storage/NetworkedStorage.test.js
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NetworkedStorage } from '../../../../src/core/storage/NetworkedStorage.js';

describe('NetworkedStorage Strategy', () => {
  let storage;
  let mockSocket;
  let mockTokenManager;
  let mockDebug;

  beforeEach(() => {
    mockSocket = {
      emit: jest.fn(),
      on: jest.fn(),
      connected: true
    };

    mockTokenManager = {
      findToken: jest.fn(),
      getGroupInventory: jest.fn(() => ({}))
    };

    mockDebug = { log: jest.fn() };

    storage = new NetworkedStorage({
      socket: mockSocket,
      tokenManager: mockTokenManager,
      debug: mockDebug
    });
  });

  describe('constructor', () => {
    it('should create instance with dependencies', () => {
      expect(storage.socket).toBe(mockSocket);
      expect(storage.tokenManager).toBe(mockTokenManager);
      expect(storage.debug).toBe(mockDebug);
    });

    it('should initialize empty local cache', () => {
      expect(storage.transactions).toEqual([]);
      expect(storage.backendScores).toBeInstanceOf(Map);
      expect(storage.scannedTokens).toBeInstanceOf(Set);
      expect(storage.playerScans).toEqual([]);
    });
  });

  describe('isReady', () => {
    it('should return true when socket is connected', () => {
      mockSocket.connected = true;
      expect(storage.isReady()).toBe(true);
    });

    it('should return false when socket is disconnected', () => {
      mockSocket.connected = false;
      expect(storage.isReady()).toBe(false);
    });

    it('should return false when socket is null', () => {
      storage.socket = null;
      expect(storage.isReady()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should resolve immediately', async () => {
      await expect(storage.initialize()).resolves.toBeUndefined();
    });
  });

  describe('addTransaction', () => {
    it('should emit transaction:submit to socket', async () => {
      const tx = {
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket'
      };

      await storage.addTransaction(tx);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'transaction:submit',
        expect.objectContaining({
          tokenId: 'token1',
          teamId: '001',
          deviceType: 'gm'
        })
      );
    });

    it('should mark token as scanned locally', async () => {
      await storage.addTransaction({
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket'
      });

      expect(storage.scannedTokens.has('token1')).toBe(true);
    });

    it('should return pending result', async () => {
      const result = await storage.addTransaction({
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket'
      });

      expect(result.success).toBe(true);
      expect(result.pending).toBe(true);
    });

    it('should return error for transaction without teamId', async () => {
      const result = await storage.addTransaction({
        tokenId: 'token1',
        mode: 'blackmarket'
        // Missing teamId
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transaction must have teamId');
    });

    it('should return error when socket is disconnected', async () => {
      mockSocket.connected = false;

      const result = await storage.addTransaction({
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Socket not connected');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('removeTransaction', () => {
    it('should emit gm:command with transaction:delete action', async () => {
      await storage.removeTransaction('tx-123');

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'gm:command',
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'transaction:delete',
            payload: { transactionId: 'tx-123' }
          })
        })
      );
    });

    it('should return pending result', async () => {
      const result = await storage.removeTransaction('tx-123');

      expect(result.success).toBe(true);
      expect(result.pending).toBe(true);
    });

    it('should return error when socket is disconnected', async () => {
      mockSocket.connected = false;

      const result = await storage.removeTransaction('tx-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Socket not connected');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('adjustTeamScore', () => {
    it('should emit gm:command with score:adjust action', async () => {
      await storage.adjustTeamScore('001', 5000, 'Bonus');

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'gm:command',
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'score:adjust',
            payload: expect.objectContaining({
              teamId: '001',
              delta: 5000,
              reason: 'Bonus'
            })
          })
        })
      );
    });

    it('should return error when socket is disconnected', async () => {
      mockSocket.connected = false;

      const result = await storage.adjustTeamScore('001', 5000, 'Bonus');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Socket not connected');
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('getTransactions', () => {
    it('should return local transaction cache', () => {
      storage.transactions = [{ id: 'tx-1' }, { id: 'tx-2' }];

      expect(storage.getTransactions()).toEqual([{ id: 'tx-1' }, { id: 'tx-2' }]);
    });
  });

  describe('getTeamScores', () => {
    it('should return empty array when no backend scores', () => {
      expect(storage.getTeamScores()).toEqual([]);
    });

    it('should return scores from backend cache sorted by score', () => {
      storage.backendScores.set('001', {
        currentScore: 50000,
        baseScore: 40000,
        bonusPoints: 10000,
        tokensScanned: 3,
        completedGroups: ['GroupA']
      });
      storage.backendScores.set('002', {
        currentScore: 75000,
        baseScore: 75000,
        bonusPoints: 0,
        tokensScanned: 5,
        completedGroups: []
      });

      const scores = storage.getTeamScores();

      expect(scores).toHaveLength(2);
      expect(scores[0].teamId).toBe('002'); // Higher score first
      expect(scores[0].score).toBe(75000);
      expect(scores[1].teamId).toBe('001');
      expect(scores[1].bonusScore).toBe(10000);
    });
  });

  describe('getGameActivity', () => {
    it('should return empty activity for new storage', () => {
      const activity = storage.getGameActivity();

      expect(activity.tokens).toEqual([]);
      expect(activity.stats.totalTokens).toBe(0);
    });

    it('should include transactions as claims', () => {
      storage.transactions = [{
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        timestamp: '2025-01-05T10:00:00Z',
        valueRating: 3,
        memoryType: 'Personal'
      }];

      const activity = storage.getGameActivity();

      expect(activity.tokens).toHaveLength(1);
      expect(activity.tokens[0].tokenId).toBe('token1');
      expect(activity.tokens[0].status).toBe('claimed');
    });

    it('should include player scans as discoveries', () => {
      storage.playerScans = [{
        tokenId: 'token1',
        timestamp: '2025-01-05T09:00:00Z',
        deviceId: 'player-device-1',
        tokenData: { SF_ValueRating: 3, SF_MemoryType: 'Personal' }
      }];

      const activity = storage.getGameActivity();

      expect(activity.tokens).toHaveLength(1);
      expect(activity.tokens[0].status).toBe('available');
      expect(activity.tokens[0].discoveredByPlayers).toBe(true);
    });

    it('should merge player scans and transactions for same token', () => {
      storage.playerScans = [{
        tokenId: 'token1',
        timestamp: '2025-01-05T09:00:00Z',
        deviceId: 'player-device-1',
        tokenData: { SF_ValueRating: 3, SF_MemoryType: 'Personal' }
      }];
      storage.transactions = [{
        tokenId: 'token1',
        teamId: '001',
        mode: 'blackmarket',
        timestamp: '2025-01-05T10:00:00Z'
      }];

      const activity = storage.getGameActivity();

      expect(activity.tokens).toHaveLength(1);
      expect(activity.tokens[0].status).toBe('claimed');
      expect(activity.tokens[0].discoveredByPlayers).toBe(true);
      expect(activity.tokens[0].events).toHaveLength(2);
    });
  });

  describe('session lifecycle', () => {
    it('should emit gm:command for createSession', async () => {
      await storage.createSession('Test Game', ['Team1', 'Team2']);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'gm:command',
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'session:create',
            payload: { name: 'Test Game', teams: ['Team1', 'Team2'] }
          })
        })
      );
    });

    it('should emit gm:command for endSession', async () => {
      await storage.endSession();

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'gm:command',
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'session:end'
          })
        })
      );
    });

    it('should return session info when session ID is set', () => {
      storage.currentSessionId = 'session-123';

      const session = storage.getCurrentSession();

      expect(session.sessionId).toBe('session-123');
      expect(session.status).toBe('active');
    });

    it('should return null when no session', () => {
      storage.currentSessionId = null;

      expect(storage.getCurrentSession()).toBeNull();
    });
  });

  describe('cache update methods', () => {
    it('should set transactions', () => {
      storage.setTransactions([{ id: 'tx-1' }]);
      expect(storage.transactions).toEqual([{ id: 'tx-1' }]);
    });

    it('should add transaction from broadcast (no duplicates)', () => {
      storage.transactions = [{ id: 'tx-1' }];

      storage.addTransactionFromBroadcast({ id: 'tx-2' });
      expect(storage.transactions).toHaveLength(2);

      storage.addTransactionFromBroadcast({ id: 'tx-1' }); // Duplicate
      expect(storage.transactions).toHaveLength(2);
    });

    it('should set backend scores', () => {
      storage.setBackendScores('001', { currentScore: 50000 });
      expect(storage.backendScores.get('001')).toEqual({ currentScore: 50000 });
    });

    it('should reset backend scores to zero (preserving team entries)', () => {
      storage.setBackendScores('001', {
        currentScore: 50000, baseScore: 40000, bonusPoints: 10000,
        tokensScanned: 3, completedGroups: ['GroupA'], adminAdjustments: [{ delta: 5000 }]
      });
      storage.setBackendScores('002', {
        currentScore: 75000, baseScore: 75000, bonusPoints: 0,
        tokensScanned: 5, completedGroups: [], adminAdjustments: []
      });

      const resetTeamIds = storage.resetBackendScores();

      expect(resetTeamIds).toEqual(['001', '002']);
      expect(storage.backendScores.size).toBe(2);
      expect(storage.backendScores.get('001').currentScore).toBe(0);
      expect(storage.backendScores.get('001').baseScore).toBe(0);
      expect(storage.backendScores.get('001').bonusPoints).toBe(0);
      expect(storage.backendScores.get('001').tokensScanned).toBe(0);
      expect(storage.backendScores.get('001').completedGroups).toEqual([]);
      expect(storage.backendScores.get('002').currentScore).toBe(0);
    });

    it('should clear backend scores (remove all entries)', () => {
      storage.setBackendScores('001', { currentScore: 50000 });
      storage.clearBackendScores();
      expect(storage.backendScores.size).toBe(0);
    });

    it('should set scanned tokens', () => {
      storage.setScannedTokens(['token1', 'token2']);
      expect(storage.scannedTokens.has('token1')).toBe(true);
      expect(storage.scannedTokens.has('token2')).toBe(true);
    });

    it('should set player scans', () => {
      storage.setPlayerScans([{ tokenId: 'token1' }]);
      expect(storage.playerScans).toEqual([{ tokenId: 'token1' }]);
    });

    it('should add player scan (no duplicates)', () => {
      storage.playerScans = [{ id: 'scan-1' }];

      storage.addPlayerScan({ id: 'scan-2' });
      expect(storage.playerScans).toHaveLength(2);

      storage.addPlayerScan({ id: 'scan-1' }); // Duplicate
      expect(storage.playerScans).toHaveLength(2);
    });

    it('should set session ID', () => {
      storage.setSessionId('session-123');
      expect(storage.currentSessionId).toBe('session-123');
    });
  });

  describe('dispose', () => {
    it('should not throw when called', () => {
      expect(() => storage.dispose()).not.toThrow();
    });
  });
});
