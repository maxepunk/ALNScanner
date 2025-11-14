/**
 * NetworkedQueueManager Unit Tests
 * Tests offline queue management, persistence, and auto-sync
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import NetworkedQueueManager from '../../../src/network/networkedQueueManager.js';

describe('NetworkedQueueManager', () => {
  let queueManager;
  let mockClient;
  let mockDebug;
  let localStorageMock;

  beforeEach(() => {
    // Create a simple store object
    const store = {};

    // Mock localStorage with proper implementation that actually executes the logic
    localStorageMock = {
      getItem: jest.fn((key) => store[key] || null),
      setItem: jest.fn((key, value) => { store[key] = String(value); }),
      removeItem: jest.fn((key) => { delete store[key]; }),
      clear: jest.fn(() => { Object.keys(store).forEach(key => delete store[key]); }),
      get store() { return store; }  // For test access
    };

    // Replace global.localStorage
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true
    });

    // Mock OrchestratorClient
    mockClient = {
      isConnected: false,
      send: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };

    // Mock debug utility
    mockDebug = {
      log: jest.fn(),
      error: jest.fn()
    };

    // Create queue manager
    queueManager = new NetworkedQueueManager({
      client: mockClient,
      debug: mockDebug,
      deviceId: 'test-device'
    });
  });

  afterEach(() => {
    if (queueManager) {
      queueManager.destroy();
    }
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with empty queue', () => {
      expect(queueManager.tempQueue).toEqual([]);
      expect(queueManager.syncing).toBe(false);
    });

    it('should accept injected dependencies', () => {
      expect(queueManager.client).toBe(mockClient);
      expect(queueManager.debug).toBe(mockDebug);
      expect(queueManager.deviceId).toBe('test-device');
    });

    it('should load persisted queue on initialization', () => {
      const savedQueue = [
        { tokenId: 'token1', teamId: '001' },
        { tokenId: 'token2', teamId: '002' }
      ];
      // Use setItem to properly populate the mock
      localStorageMock.setItem('networkedTempQueue', JSON.stringify(savedQueue));

      const newManager = new NetworkedQueueManager({
        client: mockClient,
        debug: mockDebug
      });

      expect(newManager.tempQueue).toEqual(savedQueue);
    });

    it('should merge orphaned transactions from fallback queue', () => {
      const orphanedQueue = [
        { tokenId: 'orphan1', teamId: '001' }
      ];
      // Use setItem to properly populate the mock
      localStorageMock.setItem('pendingNetworkedTransactions', JSON.stringify(orphanedQueue));

      const newManager = new NetworkedQueueManager({
        client: mockClient,
        debug: mockDebug
      });

      expect(newManager.tempQueue).toEqual(orphanedQueue);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('pendingNetworkedTransactions');
    });
  });

  describe('queueTransaction', () => {
    it('should queue transaction when disconnected', () => {
      const transaction = {
        tokenId: 'token1',
        teamId: '001',
        timestamp: new Date().toISOString()
      };

      mockClient.isConnected = false;

      const eventSpy = jest.fn();
      queueManager.addEventListener('queue:changed', eventSpy);

      queueManager.queueTransaction(transaction);

      expect(queueManager.tempQueue).toContainEqual(transaction);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'networkedTempQueue',
        JSON.stringify([transaction])
      );
      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail).toEqual({
        queuedCount: 1,
        syncing: false
      });
    });

    it('should send transaction immediately when connected', () => {
      const transaction = {
        tokenId: 'token2',
        teamId: '002',
        timestamp: new Date().toISOString()
      };

      mockClient.isConnected = true;

      queueManager.queueTransaction(transaction);

      expect(mockClient.send).toHaveBeenCalledWith('transaction:submit', transaction);
      expect(queueManager.tempQueue).toHaveLength(0);
    });

    it('should handle missing client gracefully', () => {
      queueManager.client = null;

      const transaction = { tokenId: 'token3', teamId: '003' };
      queueManager.queueTransaction(transaction);

      expect(queueManager.tempQueue).toContainEqual(transaction);
    });
  });

  describe('syncQueue', () => {
    beforeEach(() => {
      mockClient.isConnected = true;
    });

    it('should not sync if already syncing', async () => {
      queueManager.syncing = true;
      queueManager.tempQueue = [{ tokenId: 'token1', teamId: '001' }];

      await queueManager.syncQueue();

      expect(mockClient.send).not.toHaveBeenCalled();
    });

    it('should not sync if queue is empty', async () => {
      queueManager.tempQueue = [];

      await queueManager.syncQueue();

      expect(mockClient.send).not.toHaveBeenCalled();
    });

    it('should not sync if disconnected', async () => {
      mockClient.isConnected = false;
      queueManager.tempQueue = [{ tokenId: 'token1', teamId: '001' }];

      await queueManager.syncQueue();

      expect(mockClient.send).not.toHaveBeenCalled();
    });

    it('should replay all transactions via WebSocket', async () => {
      const transactions = [
        { tokenId: 'token1', teamId: '001' },
        { tokenId: 'token2', teamId: '002' }
      ];
      queueManager.tempQueue = [...transactions];

      // Mock successful replay
      jest.spyOn(queueManager, 'replayTransaction').mockResolvedValue({ status: 'success' });

      await queueManager.syncQueue();

      expect(queueManager.replayTransaction).toHaveBeenCalledTimes(2);
      expect(queueManager.replayTransaction).toHaveBeenCalledWith(transactions[0]);
      expect(queueManager.replayTransaction).toHaveBeenCalledWith(transactions[1]);
      expect(queueManager.tempQueue).toHaveLength(0);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('networkedTempQueue');
    });

    it('should clear queue even if some transactions fail', async () => {
      const transactions = [
        { tokenId: 'token1', teamId: '001' },
        { tokenId: 'token2', teamId: '002' }
      ];
      queueManager.tempQueue = [...transactions];

      // Mock mixed results
      jest.spyOn(queueManager, 'replayTransaction')
        .mockResolvedValueOnce({ status: 'success' })
        .mockRejectedValueOnce(new Error('Validation error'));

      await queueManager.syncQueue();

      expect(queueManager.tempQueue).toHaveLength(0);

      // Find the call with 'Queue sync complete'
      const syncCompleteCall = mockDebug.log.mock.calls.find(
        call => call[0] === 'Queue sync complete'
      );

      expect(syncCompleteCall).toBeDefined();
      expect(syncCompleteCall[1]).toEqual(expect.objectContaining({
        total: 2,
        success: 1,
        failed: 1,
        errorBreakdown: { validation: 1 }
      }));
    });

    it('should categorize errors correctly', async () => {
      queueManager.tempQueue = [
        { tokenId: 'token1', teamId: '001' },
        { tokenId: 'token2', teamId: '002' },
        { tokenId: 'token3', teamId: '003' }
      ];

      jest.spyOn(queueManager, 'replayTransaction')
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockRejectedValueOnce(new Error('Invalid token format'))
        .mockRejectedValueOnce(new Error('Network error'));

      await queueManager.syncQueue();

      // Find the call with 'Queue sync complete'
      const syncCompleteCall = mockDebug.log.mock.calls.find(
        call => call[0] === 'Queue sync complete'
      );

      expect(syncCompleteCall).toBeDefined();
      expect(syncCompleteCall[1]).toEqual(expect.objectContaining({
        errorBreakdown: {
          timeout: 1,
          validation: 1,
          network: 1
        }
      }));
    });

    it('should emit queue:changed event after sync', async () => {
      queueManager.tempQueue = [{ tokenId: 'token1', teamId: '001' }];
      jest.spyOn(queueManager, 'replayTransaction').mockResolvedValue({ status: 'success' });

      const eventSpy = jest.fn();
      queueManager.addEventListener('queue:changed', eventSpy);

      await queueManager.syncQueue();

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail).toEqual({
        queuedCount: 0,
        syncing: false
      });
    });

    it('should preserve queue on sync failure', async () => {
      const transactions = [{ tokenId: 'token1', teamId: '001' }];
      queueManager.tempQueue = [...transactions];

      // Mock sync failure (throw before any replays)
      jest.spyOn(queueManager, 'replayTransaction').mockImplementation(() => {
        throw new Error('Network failure');
      });

      await queueManager.syncQueue();

      // Queue should be cleared despite failures (per spec)
      expect(queueManager.tempQueue).toHaveLength(0);
    });
  });

  describe('replayTransaction', () => {
    beforeEach(() => {
      mockClient.isConnected = true;
    });

    it('should send transaction via OrchestratorClient', async () => {
      const transaction = { tokenId: 'token1', teamId: '001' };

      // Setup mock to immediately call handler
      mockClient.addEventListener.mockImplementation((eventType, handler) => {
        if (eventType === 'message:received') {
          // Simulate response
          setTimeout(() => {
            handler({
              detail: {
                type: 'transaction:result',
                payload: {
                  tokenId: 'token1',
                  teamId: '001',
                  status: 'success'
                }
              }
            });
          }, 10);
        }
      });

      const result = await queueManager.replayTransaction(transaction);

      expect(mockClient.send).toHaveBeenCalledWith('transaction:submit', transaction);
      expect(result.status).toBe('success');
    });

    it('should resolve with matching transaction result', async () => {
      const transaction = { tokenId: 'token2', teamId: '002' };

      mockClient.addEventListener.mockImplementation((eventType, handler) => {
        setTimeout(() => {
          handler({
            detail: {
              type: 'transaction:result',
              payload: {
                tokenId: 'token2',
                teamId: '002',
                status: 'success',
                points: 1000
              }
            }
          });
        }, 10);
      });

      const result = await queueManager.replayTransaction(transaction);

      expect(result).toEqual({
        tokenId: 'token2',
        teamId: '002',
        status: 'success',
        points: 1000
      });
    });

    it('should reject on error status', async () => {
      const transaction = { tokenId: 'token3', teamId: '003' };

      mockClient.addEventListener.mockImplementation((eventType, handler) => {
        setTimeout(() => {
          handler({
            detail: {
              type: 'transaction:result',
              payload: {
                tokenId: 'token3',
                teamId: '003',
                status: 'error',
                message: 'Invalid token'
              }
            }
          });
        }, 10);
      });

      await expect(queueManager.replayTransaction(transaction))
        .rejects
        .toThrow('Invalid token');
    });

    it('should timeout after 30s', async () => {
      const transaction = { tokenId: 'token4', teamId: '004' };

      // Don't call the handler - let it timeout
      mockClient.addEventListener.mockImplementation(() => {
        // No response
      });

      await expect(queueManager.replayTransaction(transaction))
        .rejects
        .toThrow('Transaction replay timeout after 30s: token4');
    }, 35000); // Extend test timeout

    it('should cleanup handlers after success', async () => {
      const transaction = { tokenId: 'token5', teamId: '005' };

      mockClient.addEventListener.mockImplementation((eventType, handler) => {
        setTimeout(() => {
          handler({
            detail: {
              type: 'transaction:result',
              payload: {
                tokenId: 'token5',
                teamId: '005',
                status: 'success'
              }
            }
          });
        }, 10);
      });

      await queueManager.replayTransaction(transaction);

      expect(mockClient.removeEventListener).toHaveBeenCalled();
      expect(queueManager.activeHandlers.size).toBe(0);
    });

    it('should ignore non-matching transaction results', async () => {
      const transaction = { tokenId: 'token6', teamId: '006' };

      let handlerRef;
      mockClient.addEventListener.mockImplementation((eventType, handler) => {
        handlerRef = handler;
        // Send non-matching result first
        setTimeout(() => {
          handler({
            detail: {
              type: 'transaction:result',
              payload: {
                tokenId: 'OTHER_TOKEN',
                teamId: '999',
                status: 'success'
              }
            }
          });

          // Send matching result after
          setTimeout(() => {
            handler({
              detail: {
                type: 'transaction:result',
                payload: {
                  tokenId: 'token6',
                  teamId: '006',
                  status: 'success'
                }
              }
            });
          }, 10);
        }, 10);
      });

      const result = await queueManager.replayTransaction(transaction);

      expect(result.tokenId).toBe('token6');
    });
  });

  describe('localStorage persistence', () => {
    it('should save queue to localStorage', () => {
      queueManager.tempQueue = [
        { tokenId: 'token1', teamId: '001' },
        { tokenId: 'token2', teamId: '002' }
      ];

      queueManager.saveQueue();

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'networkedTempQueue',
        JSON.stringify(queueManager.tempQueue)
      );
    });

    it('should remove localStorage entry when queue empty', () => {
      queueManager.tempQueue = [];

      queueManager.saveQueue();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('networkedTempQueue');
    });

    it('should load queue from localStorage', () => {
      const savedQueue = [
        { tokenId: 'token1', teamId: '001' }
      ];
      // Use setItem to properly populate the mock
      localStorageMock.setItem('networkedTempQueue', JSON.stringify(savedQueue));

      queueManager.loadQueue();

      expect(queueManager.tempQueue).toEqual(savedQueue);
    });

    it('should handle localStorage quota exceeded error', () => {
      queueManager.tempQueue = [{ tokenId: 'token1', teamId: '001' }];

      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';
      localStorageMock.setItem.mockImplementation(() => {
        throw quotaError;
      });

      // Mock alert
      global.alert = jest.fn();

      queueManager.saveQueue();

      expect(mockDebug.error).toHaveBeenCalledWith(
        'localStorage quota exceeded - unable to save queue',
        expect.objectContaining({
          queueSize: 1
        })
      );
      expect(global.alert).toHaveBeenCalledWith(
        'Storage full: Unable to queue transactions offline. Please sync or clear data.'
      );
    });

    it('should handle corrupted localStorage data', () => {
      // Use setItem to properly populate the mock
      localStorageMock.setItem('networkedTempQueue', 'INVALID JSON');

      queueManager.loadQueue();

      expect(queueManager.tempQueue).toEqual([]);
      expect(mockDebug.error).toHaveBeenCalled();
    });
  });

  describe('clearQueue', () => {
    it('should clear queue and localStorage', () => {
      queueManager.tempQueue = [
        { tokenId: 'token1', teamId: '001' }
      ];
      // Use setItem to properly populate the mock
      localStorageMock.setItem('networkedTempQueue', 'data');

      queueManager.clearQueue();

      expect(queueManager.tempQueue).toHaveLength(0);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('networkedTempQueue');
    });
  });

  describe('getStatus', () => {
    it('should return current queue status', () => {
      queueManager.tempQueue = [
        { tokenId: 'token1', teamId: '001' },
        { tokenId: 'token2', teamId: '002' }
      ];
      queueManager.syncing = true;

      const status = queueManager.getStatus();

      expect(status).toEqual({
        queuedCount: 2,
        syncing: true
      });
    });

    it('should return zero count for empty queue', () => {
      queueManager.tempQueue = [];
      queueManager.syncing = false;

      const status = queueManager.getStatus();

      expect(status).toEqual({
        queuedCount: 0,
        syncing: false
      });
    });
  });

  describe('destroy', () => {
    it('should cleanup all active handlers', () => {
      // Add some active handlers
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      queueManager.activeHandlers.set('key1', handler1);
      queueManager.activeHandlers.set('key2', handler2);

      queueManager.destroy();

      expect(mockClient.removeEventListener).toHaveBeenCalledTimes(2);
      expect(queueManager.activeHandlers.size).toBe(0);
      expect(queueManager.client).toBeNull();
    });

    it('should handle destroy when no handlers exist', () => {
      queueManager.destroy();

      expect(queueManager.activeHandlers.size).toBe(0);
      expect(queueManager.client).toBeNull();
    });
  });

  describe('EventTarget functionality', () => {
    it('should extend EventTarget', () => {
      expect(queueManager).toBeInstanceOf(EventTarget);
    });

    it('should emit queue:changed events with correct detail', () => {
      mockClient.isConnected = false;

      const eventSpy = jest.fn();
      queueManager.addEventListener('queue:changed', eventSpy);

      queueManager.queueTransaction({ tokenId: 'token1', teamId: '001' });

      expect(eventSpy).toHaveBeenCalledTimes(1);
      const event = eventSpy.mock.calls[0][0];
      expect(event.type).toBe('queue:changed');
      expect(event.detail).toEqual({
        queuedCount: 1,
        syncing: false
      });
    });
  });
});
