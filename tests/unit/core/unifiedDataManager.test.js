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
});
