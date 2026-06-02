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

      expect(queueManager.tempQueue).toContainEqual(
        expect.objectContaining({ tokenId: 'token1', teamId: '001' })
      );
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'networkedTempQueue',
        expect.stringContaining('token1')
      );
      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail).toEqual({
        queuedCount: 1,
        syncing: false
      });
    });

    it('should persist before emitting on the connected path', () => {
      const transaction = { tokenId: 'token2', teamId: '002', timestamp: new Date().toISOString() };
      mockClient.isConnected = true;

      const id = queueManager.queueTransaction(transaction);

      // Durable (TQ-1): entry is in the queue AND persisted at emit time
      expect(queueManager.tempQueue.some(t => t.clientTxId === id)).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'networkedTempQueue',
        expect.stringContaining(id)
      );
      // And it was emitted via the durable submit path
      expect(mockClient.send).toHaveBeenCalledWith(
        'transaction:submit',
        expect.objectContaining({ clientTxId: id })
      );

      // Resolve the in-flight replay so the 30s timer is cleared (no leaked timer)
      const replayHandler = mockClient.addEventListener.mock.calls
        .find(c => c[0] === 'message:received')[1];
      replayHandler({ detail: { type: 'transaction:result', payload: { clientTxId: id, status: 'accepted' } } });
    });

    it('should remove the entry after a definitive accepted result', async () => {
      const transaction = { tokenId: 'token2', teamId: '002', timestamp: new Date().toISOString() };
      mockClient.isConnected = true;
      jest.spyOn(queueManager, 'replayTransaction').mockResolvedValue({ status: 'accepted' });

      const id = queueManager.queueTransaction(transaction);

      // STRENGTHENED: prove durability THEN removal so the test cannot pass
      // accidentally pre-fix (where the connected path never queued the entry).
      expect(queueManager.tempQueue.some(t => t.clientTxId === id)).toBe(true);  // present after queue

      // _submitDurable is fire-and-forget; setTimeout(0) is a macrotask that runs
      // AFTER the .then()->_removeByClientTxId microtask chain (deterministic).
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(queueManager.tempQueue.some(t => t.clientTxId === id)).toBe(false); // absent after result
    });

    it('removes the entry and surfaces transaction:failed on a definitive rejected result (connected)', async () => {
      mockClient.isConnected = true;
      jest.spyOn(queueManager, 'replayTransaction').mockResolvedValue({ status: 'rejected', message: 'No active session' });

      const failedSpy = jest.fn();
      queueManager.addEventListener('transaction:failed', failedSpy);

      const id = queueManager.queueTransaction({ tokenId: 'tR', teamId: '001' });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(queueManager.tempQueue.some(t => t.clientTxId === id)).toBe(false);  // permanent: removed
      expect(failedSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps the entry persisted when the durable submit throws (transient, connected)', async () => {
      mockClient.isConnected = true;
      jest.spyOn(queueManager, 'replayTransaction').mockRejectedValue(new Error('connection lost'));

      const id = queueManager.queueTransaction({ tokenId: 'tT', teamId: '001' });
      await new Promise(resolve => setTimeout(resolve, 0));

      // Transient failure: leave persisted for syncQueue to retry on reconnect
      expect(queueManager.tempQueue.some(t => t.clientTxId === id)).toBe(true);
    });

    it('keeps the entry persisted when the connected result is queued', async () => {
      mockClient.isConnected = true;
      jest.spyOn(queueManager, 'replayTransaction').mockResolvedValue({ status: 'queued' });

      const id = queueManager.queueTransaction({ tokenId: 'tQ', teamId: '001' });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(queueManager.tempQueue.some(t => t.clientTxId === id)).toBe(true);
    });

    it('should handle missing client gracefully', () => {
      queueManager.client = null;

      const transaction = { tokenId: 'token3', teamId: '003' };
      queueManager.queueTransaction(transaction);

      expect(queueManager.tempQueue).toContainEqual(
        expect.objectContaining({ tokenId: 'token3', teamId: '003' })
      );
    });

    it('should generate and return a clientTxId, persisting it', () => {
      mockClient.isConnected = false;
      const tx = { tokenId: 'tokenX', teamId: '009', timestamp: new Date().toISOString() };

      const id = queueManager.queueTransaction(tx);

      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      expect(queueManager.tempQueue[0].clientTxId).toBe(id);
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
      jest.spyOn(queueManager, 'replayTransaction').mockResolvedValue({ status: 'accepted' });

      await queueManager.syncQueue();

      expect(queueManager.replayTransaction).toHaveBeenCalledTimes(2);
      expect(queueManager.replayTransaction).toHaveBeenCalledWith(transactions[0]);
      expect(queueManager.replayTransaction).toHaveBeenCalledWith(transactions[1]);
      expect(queueManager.tempQueue).toHaveLength(0);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('networkedTempQueue');
    });

    it('should keep a transient-failed entry and remove the succeeded one', async () => {
      const transactions = [
        { tokenId: 'token1', teamId: '001' },
        { tokenId: 'token2', teamId: '002' }
      ];
      queueManager.tempQueue = [...transactions];

      // First accepted (removed), second throws (transient -> kept for reconnect)
      jest.spyOn(queueManager, 'replayTransaction')
        .mockResolvedValueOnce({ status: 'accepted' })
        .mockRejectedValueOnce(new Error('Validation error'));

      await queueManager.syncQueue();

      expect(queueManager.tempQueue).toHaveLength(1);

      // Find the call with 'Queue sync complete'
      const syncCompleteCall = mockDebug.log.mock.calls.find(
        call => call[0] === 'Queue sync complete'
      );

      expect(syncCompleteCall).toBeDefined();
      expect(syncCompleteCall[1]).toEqual({
        total: 2,
        success: 1,
        failed: 1,
        kept: 1
      });
    });

    it('should log individual replay failures', async () => {
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

      // Each failure should be logged individually
      const failureCalls = mockDebug.error.mock.calls.filter(
        call => call[0] === 'Transaction replay failed'
      );
      expect(failureCalls).toHaveLength(3);
      expect(failureCalls[0][1]).toEqual({ tokenId: 'token1', error: 'Connection timeout' });
      expect(failureCalls[1][1]).toEqual({ tokenId: 'token2', error: 'Invalid token format' });
      expect(failureCalls[2][1]).toEqual({ tokenId: 'token3', error: 'Network error' });
    });

    it('should emit queue:changed event after sync', async () => {
      queueManager.tempQueue = [{ tokenId: 'token1', teamId: '001' }];
      jest.spyOn(queueManager, 'replayTransaction').mockResolvedValue({ status: 'accepted' });

      const eventSpy = jest.fn();
      queueManager.addEventListener('queue:changed', eventSpy);

      await queueManager.syncQueue();

      expect(eventSpy).toHaveBeenCalledTimes(1);
      expect(eventSpy.mock.calls[0][0].detail).toEqual({
        queuedCount: 0,
        syncing: false
      });
    });

    it('should preserve queue when a replay throws (transient/connection error)', async () => {
      const transactions = [{ tokenId: 'token1', teamId: '001', clientTxId: 'ctx-1' }];
      queueManager.tempQueue = [...transactions];

      jest.spyOn(queueManager, 'replayTransaction').mockRejectedValue(new Error('connection lost'));

      await queueManager.syncQueue();

      // Transient failure: keep for next reconnect (was wrongly cleared before)
      expect(queueManager.tempQueue).toContainEqual(transactions[0]);
    });

    it('should remove accepted and duplicate entries', async () => {
      queueManager.tempQueue = [
        { tokenId: 'tA', teamId: '001', clientTxId: 'a' },
        { tokenId: 'tB', teamId: '002', clientTxId: 'b' }
      ];
      jest.spyOn(queueManager, 'replayTransaction')
        .mockResolvedValueOnce({ status: 'accepted', clientTxId: 'a' })
        .mockResolvedValueOnce({ status: 'duplicate', clientTxId: 'b' });

      await queueManager.syncQueue();

      expect(queueManager.tempQueue).toHaveLength(0);
    });

    it('should remove rejected entries (permanent fail) and not retry them', async () => {
      const tx = { tokenId: 'tC', teamId: '003', clientTxId: 'c' };
      queueManager.tempQueue = [tx];
      jest.spyOn(queueManager, 'replayTransaction')
        .mockResolvedValueOnce({ status: 'rejected', clientTxId: 'c', message: 'No active session' });

      await queueManager.syncQueue();

      expect(queueManager.tempQueue).toHaveLength(0); // permanent: removed, not looped forever
    });

    it('should keep queued entries for the next reconnect', async () => {
      const tx = { tokenId: 'tD', teamId: '004', clientTxId: 'd' };
      queueManager.tempQueue = [tx];
      jest.spyOn(queueManager, 'replayTransaction')
        .mockResolvedValueOnce({ status: 'queued', clientTxId: 'd' });

      await queueManager.syncQueue();

      expect(queueManager.tempQueue).toContainEqual(tx);
    });

    it('should surface a transaction:failed event on permanent rejection', async () => {
      const tx = { tokenId: 'tE', teamId: '005', clientTxId: 'e' };
      queueManager.tempQueue = [tx];
      jest.spyOn(queueManager, 'replayTransaction')
        .mockResolvedValueOnce({ status: 'rejected', clientTxId: 'e', message: 'No active session' });

      const failedSpy = jest.fn();
      queueManager.addEventListener('transaction:failed', failedSpy);

      await queueManager.syncQueue();

      expect(failedSpy).toHaveBeenCalledTimes(1);
      expect(failedSpy.mock.calls[0][0].detail).toEqual(
        expect.objectContaining({ status: 'rejected', message: 'No active session' })
      );
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

    it('should reject fast when a backend error matches the submission', async () => {
      const transaction = { tokenId: 'token7', teamId: '007', clientTxId: 'ctx-7' };

      mockClient.addEventListener.mockImplementation((eventType, handler) => {
        setTimeout(() => {
          handler({
            detail: {
              type: 'error',
              payload: {
                code: 'VALIDATION_ERROR',
                message: 'Failed to process transaction',
                clientTxId: 'ctx-7'
              }
            }
          });
        }, 10);
      });

      // Without the type==='error' branch, this falls through the
      // 'if (type !== transaction:result) return' guard and hangs to the 30s
      // timeout -> jest's 5s default fires first (RED via timeout).
      await expect(queueManager.replayTransaction(transaction))
        .rejects
        .toThrow('Failed to process transaction');
    });
  });

  describe('reconcileWithServerState', () => {
    it('drops queued entries already recorded on the server', () => {
      queueManager.tempQueue = [
        { tokenId: 'tDup', teamId: '001', clientTxId: 'a' },
        { tokenId: 'tNew', teamId: '001', clientTxId: 'b' }
      ];

      queueManager.reconcileWithServerState(['tDup', 'tOther']);

      expect(queueManager.tempQueue.map(t => t.tokenId)).toEqual(['tNew']);
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('is a no-op when given a non-array', () => {
      queueManager.tempQueue = [{ tokenId: 'tNew', teamId: '001', clientTxId: 'b' }];
      queueManager.reconcileWithServerState(undefined);
      expect(queueManager.tempQueue).toHaveLength(1);
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
