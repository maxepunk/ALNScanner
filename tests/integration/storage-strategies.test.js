/**
 * Integration Tests - Storage Strategies
 *
 * Tests REAL implementations of storage strategies to verify
 * they work correctly with localStorage persistence and
 * produce compatible data structures.
 *
 * Unlike unit tests which test individual methods in isolation,
 * these tests verify:
 * - Full session lifecycles (create → scan → adjust → end)
 * - Persistence and reload from localStorage
 * - API parity between LocalStorage and DataManager/StandaloneDataManager
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LocalStorage } from '../../src/core/storage/LocalStorage.js';
import StandaloneDataManager from '../../src/core/standaloneDataManager.js';

describe('Storage Strategy Integration', () => {
  let storage;

  beforeEach(() => {
    localStorage.clear();
    storage = new LocalStorage({
      tokenManager: {
        getAllTokens: () => [],
        findToken: () => null
      }
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Session Lifecycle', () => {
    it('should handle complete session flow: create → scan → end', async () => {
      // Create session
      const session = await storage.createSession('Test Game', []);
      expect(session.sessionId).toMatch(/^LOCAL_/);
      expect(storage.getCurrentSession()).not.toBeNull();

      // Add transactions for multiple teams
      await storage.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 50000,
        valueRating: 3, memoryType: 'Personal',
        timestamp: new Date().toISOString()
      });
      await storage.addTransaction({
        id: 'tx-2', tokenId: 'token2', teamId: '002',
        mode: 'blackmarket', points: 75000,
        valueRating: 4, memoryType: 'Business',
        timestamp: new Date().toISOString()
      });

      // Verify state
      expect(storage.getTransactions()).toHaveLength(2);
      expect(storage.getTeamScores()).toHaveLength(2);

      // Team 002 should be first (higher score)
      const scores = storage.getTeamScores();
      expect(scores[0].teamId).toBe('002');
      expect(scores[0].score).toBe(75000);

      // End session
      await storage.endSession();

      // Verify persisted to localStorage
      const saved = localStorage.getItem('standaloneSession');
      expect(saved).toBeTruthy();
      const parsed = JSON.parse(saved);
      expect(parsed.transactions).toHaveLength(2);
    });

    it('should persist session state and reload correctly', async () => {
      // Create initial session with data
      await storage.createSession('Reload Test', []);
      await storage.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 10000,
        valueRating: 1, memoryType: 'Personal',
        timestamp: new Date().toISOString()
      });

      const originalSessionId = storage.getCurrentSession().sessionId;

      // Create NEW storage instance (simulates page reload)
      const reloadedStorage = new LocalStorage({
        tokenManager: { getAllTokens: () => [], findToken: () => null }
      });
      // Must call initialize() to load from localStorage
      await reloadedStorage.initialize();

      // Should have loaded the saved session
      expect(reloadedStorage.getTransactions()).toHaveLength(1);
      expect(reloadedStorage.getTransactions()[0].tokenId).toBe('token1');
      expect(reloadedStorage.getTeamScores()).toHaveLength(1);
      expect(reloadedStorage.getTeamScores()[0].score).toBe(10000);
    });
  });

  describe('Score Adjustment Persistence', () => {
    it('should persist adjustments across page reloads', async () => {
      // Setup: Create session with transaction
      await storage.createSession('Adjustment Test', []);
      await storage.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 10000,
        valueRating: 1, memoryType: 'Personal',
        timestamp: new Date().toISOString()
      });

      // Apply adjustment
      await storage.adjustTeamScore('001', 5000, 'Bonus');

      // Reload storage
      const newStorage = new LocalStorage({
        tokenManager: { getAllTokens: () => [], findToken: () => null }
      });
      // Must call initialize() to load from localStorage
      await newStorage.initialize();

      // Verify adjustment persisted
      const scores = newStorage.getTeamScores();
      expect(scores[0].score).toBe(15000);
    });
  });

  describe('Data Format Compatibility', () => {
    it('should produce same getGameActivity structure as StandaloneDataManager', async () => {
      // Setup storage with transaction
      await storage.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 50000,
        valueRating: 3, memoryType: 'Personal',
        summary: 'Test summary',
        timestamp: '2025-01-05T10:00:00Z'
      });

      // Get activity from LocalStorage
      const storageActivity = storage.getGameActivity();

      // Create StandaloneDataManager with same transaction
      localStorage.clear(); // Clear to avoid loading old data
      const dataManager = new StandaloneDataManager({
        tokenManager: { getAllTokens: () => [], findToken: () => null }
      });
      dataManager.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 50000,
        valueRating: 3, memoryType: 'Personal',
        summary: 'Test summary',
        timestamp: '2025-01-05T10:00:00Z'
      });

      const dmActivity = dataManager.getGameActivity();

      // Verify structure matches
      expect(storageActivity).toHaveProperty('tokens');
      expect(storageActivity).toHaveProperty('stats');
      expect(dmActivity).toHaveProperty('tokens');
      expect(dmActivity).toHaveProperty('stats');

      // Verify token structure
      expect(storageActivity.tokens[0]).toHaveProperty('tokenId');
      expect(storageActivity.tokens[0]).toHaveProperty('tokenData');
      expect(storageActivity.tokens[0]).toHaveProperty('events');
      expect(storageActivity.tokens[0]).toHaveProperty('status');
      expect(storageActivity.tokens[0]).toHaveProperty('discoveredByPlayers');
      expect(storageActivity.tokens[0]).toHaveProperty('potentialValue');

      // Verify event structure
      expect(storageActivity.tokens[0].events[0]).toHaveProperty('type');
      expect(storageActivity.tokens[0].events[0]).toHaveProperty('teamId');
      expect(storageActivity.tokens[0].events[0]).toHaveProperty('points');
      expect(storageActivity.tokens[0].events[0]).toHaveProperty('summary');

      // Verify stats structure
      expect(storageActivity.stats).toHaveProperty('totalTokens');
      expect(storageActivity.stats).toHaveProperty('available');
      expect(storageActivity.stats).toHaveProperty('claimed');
      expect(storageActivity.stats).toHaveProperty('claimedWithoutDiscovery');
      expect(storageActivity.stats).toHaveProperty('totalPlayerScans');
    });

    it('should produce matching stat values for same data', async () => {
      // Add multiple transactions
      await storage.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 50000,
        valueRating: 3, memoryType: 'Personal',
        timestamp: '2025-01-05T10:00:00Z'
      });
      await storage.addTransaction({
        id: 'tx-2', tokenId: 'token2', teamId: '002',
        mode: 'detective', points: 0,
        valueRating: 2, memoryType: 'Business',
        timestamp: '2025-01-05T11:00:00Z'
      });

      const activity = storage.getGameActivity();

      // All tokens should be claimed (no player scans in standalone)
      expect(activity.stats.totalTokens).toBe(2);
      expect(activity.stats.claimed).toBe(2);
      expect(activity.stats.available).toBe(0);
      expect(activity.stats.claimedWithoutDiscovery).toBe(2);
      expect(activity.stats.totalPlayerScans).toBe(0);
    });
  });

  describe('Transaction Removal and Re-scanning', () => {
    it('should allow re-scanning token after transaction deletion', async () => {
      // Add transaction
      await storage.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: '001',
        mode: 'blackmarket', points: 50000,
        valueRating: 3, memoryType: 'Personal',
        timestamp: new Date().toISOString()
      });

      expect(storage.getTransactions()).toHaveLength(1);

      // Remove transaction
      const result = await storage.removeTransaction('tx-1');
      expect(result.success).toBe(true);
      expect(storage.getTransactions()).toHaveLength(0);

      // Should be able to add same token again
      const readdResult = await storage.addTransaction({
        id: 'tx-2', tokenId: 'token1', teamId: '002', // Different team this time
        mode: 'blackmarket', points: 50000,
        valueRating: 3, memoryType: 'Personal',
        timestamp: new Date().toISOString()
      });

      expect(readdResult.success).toBe(true);
      expect(storage.getTransactions()).toHaveLength(1);
      expect(storage.getTransactions()[0].teamId).toBe('002');
    });
  });

  describe('Multi-Team Session', () => {
    it('should track scores independently for multiple teams', async () => {
      // Three teams scanning different tokens
      await storage.addTransaction({
        id: 'tx-1', tokenId: 'token1', teamId: 'Alpha',
        mode: 'blackmarket', points: 10000,
        valueRating: 1, memoryType: 'Personal',
        timestamp: new Date().toISOString()
      });
      await storage.addTransaction({
        id: 'tx-2', tokenId: 'token2', teamId: 'Beta',
        mode: 'blackmarket', points: 75000,
        valueRating: 4, memoryType: 'Business',
        timestamp: new Date().toISOString()
      });
      await storage.addTransaction({
        id: 'tx-3', tokenId: 'token3', teamId: 'Gamma',
        mode: 'blackmarket', points: 150000,
        valueRating: 5, memoryType: 'Personal',
        timestamp: new Date().toISOString()
      });

      const scores = storage.getTeamScores();
      expect(scores).toHaveLength(3);

      // Sorted by score descending
      expect(scores[0].teamId).toBe('Gamma');
      expect(scores[0].score).toBe(150000);
      expect(scores[1].teamId).toBe('Beta');
      expect(scores[1].score).toBe(75000);
      expect(scores[2].teamId).toBe('Alpha');
      expect(scores[2].score).toBe(10000);
    });
  });
});
