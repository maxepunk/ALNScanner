import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UnifiedDataManager } from '../../../src/core/unifiedDataManager.js';

describe('UnifiedDataManager', () => {
  let manager;
  let mockTokenManager;
  let mockSessionModeManager;

  beforeEach(() => {
    mockTokenManager = {
      getAllTokens: jest.fn(() => []),
      findToken: jest.fn(() => null)
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
});
