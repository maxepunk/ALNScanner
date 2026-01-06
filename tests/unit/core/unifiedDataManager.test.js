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
});
