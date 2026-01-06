/**
 * NetworkedSession - Service Factory and Lifecycle Orchestrator Tests
 * ES6 Module Tests
 */

import NetworkedSession from '../../../src/network/networkedSession.js';
import OrchestratorClient from '../../../src/network/orchestratorClient.js';
import ConnectionManager from '../../../src/network/connectionManager.js';
import NetworkedQueueManager from '../../../src/network/networkedQueueManager.js';
import AdminController from '../../../src/app/adminController.js';

// Mock all dependencies
jest.mock('../../../src/network/orchestratorClient.js');
jest.mock('../../../src/network/connectionManager.js');
jest.mock('../../../src/network/networkedQueueManager.js');
jest.mock('../../../src/app/adminController.js');

describe('NetworkedSession', () => {
  let session;
  let mockClient;
  let mockConnectionManager;
  let mockQueueManager;
  let mockAdminController;
  let mockDataManager;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock implementations
    mockClient = {
      destroy: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    mockConnectionManager = {
      connect: jest.fn().mockResolvedValue(),
      disconnect: jest.fn().mockResolvedValue(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    mockQueueManager = {
      syncQueue: jest.fn(),
      destroy: jest.fn(),
    };

    mockAdminController = {
      initialize: jest.fn(),
      pause: jest.fn(),
      destroy: jest.fn(),
    };

    mockDataManager = {
      transactions: [],
      scannedTokens: new Set(),
      addTransaction: jest.fn(),
      addTransactionFromBroadcast: jest.fn(),
      removeTransaction: jest.fn(),
      clearBackendScores: jest.fn(),
      updateTeamScoreFromBackend: jest.fn(),
    };

    // Mock constructors
    OrchestratorClient.mockImplementation(() => mockClient);
    ConnectionManager.mockImplementation(() => mockConnectionManager);
    NetworkedQueueManager.mockImplementation(() => mockQueueManager);
    AdminController.mockImplementation(() => mockAdminController);

    // Create session instance with dataManager
    session = new NetworkedSession({
      url: 'https://test.example.com:3000',
      deviceId: 'GM_TEST',
      stationName: 'Test Station',
      token: 'test-token',
    }, mockDataManager);
  });

  describe('constructor', () => {
    it('should create instance with config', () => {
      expect(session.config).toEqual({
        url: 'https://test.example.com:3000',
        deviceId: 'GM_TEST',
        stationName: 'Test Station',
        token: 'test-token',
      });
      expect(session.services).toBeNull();
      expect(session.state).toBe('disconnected');
    });

    it('should extend EventTarget', () => {
      expect(session).toBeInstanceOf(EventTarget);
      expect(session.addEventListener).toBeDefined();
      expect(session.dispatchEvent).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should create all services in correct order', async () => {
      await session.initialize();

      // Verify service creation order
      expect(OrchestratorClient).toHaveBeenCalledWith({
        url: 'https://test.example.com:3000',
        deviceId: 'GM_TEST',
      });

      expect(ConnectionManager).toHaveBeenCalledWith({
        url: 'https://test.example.com:3000',
        deviceId: 'GM_TEST',
        token: 'test-token',
        client: mockClient,
      });

      expect(NetworkedQueueManager).toHaveBeenCalledWith({
        client: mockClient,
        deviceId: 'GM_TEST',
        debug: console
      });
      // AdminController receives client, dataManager, and teamRegistry (null for tests)
      expect(AdminController).toHaveBeenCalledWith(mockClient, expect.any(Object), null);

      expect(session.services).not.toBeNull();
      expect(session.services.client).toBe(mockClient);
      expect(session.services.connectionManager).toBe(mockConnectionManager);
      expect(session.services.queueManager).toBe(mockQueueManager);
      expect(session.services.adminController).toBe(mockAdminController);
    });

    it('should wire event handlers', async () => {
      await session.initialize();

      // Verify event listeners added
      expect(mockConnectionManager.addEventListener).toHaveBeenCalledWith(
        'connected',
        expect.any(Function)
      );
      expect(mockConnectionManager.addEventListener).toHaveBeenCalledWith(
        'disconnected',
        expect.any(Function)
      );
      expect(mockConnectionManager.addEventListener).toHaveBeenCalledWith(
        'auth:required',
        expect.any(Function)
      );
    });

    it('should initiate connection via ConnectionManager', async () => {
      await session.initialize();

      expect(mockConnectionManager.connect).toHaveBeenCalledTimes(1);
    });

    it('should set state to connected', async () => {
      await session.initialize();

      expect(session.state).toBe('connected');
    });

    it('should emit session:ready event with services', async () => {
      const readyHandler = jest.fn();
      session.addEventListener('session:ready', readyHandler);

      await session.initialize();

      expect(readyHandler).toHaveBeenCalledTimes(1);
      expect(readyHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { services: session.services },
        })
      );
    });

    it('should throw error if already initialized', async () => {
      await session.initialize();

      await expect(session.initialize()).rejects.toThrow('Session already initialized');
    });

    it('should cleanup on initialization failure', async () => {
      // Mock connection failure
      mockConnectionManager.connect.mockRejectedValue(new Error('Connection failed'));

      const errorHandler = jest.fn();
      session.addEventListener('session:error', errorHandler);

      await expect(session.initialize()).rejects.toThrow('Connection failed');

      // Verify cleanup happened
      expect(session.state).toBe('disconnected');
      expect(session.services).toBeNull();

      // Verify error event emitted
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { error: expect.any(Error) },
        })
      );
    });

    it('should allow re-initialization after cleanup on failure', async () => {
      // First initialization fails
      mockConnectionManager.connect.mockRejectedValueOnce(new Error('Failed'));
      await expect(session.initialize()).rejects.toThrow('Failed');

      // Second initialization succeeds
      mockConnectionManager.connect.mockResolvedValue();
      await expect(session.initialize()).resolves.toBeUndefined();

      expect(session.state).toBe('connected');
    });
  });

  describe('getService', () => {
    it('should return service by name', async () => {
      await session.initialize();

      expect(session.getService('client')).toBe(mockClient);
      expect(session.getService('connectionManager')).toBe(mockConnectionManager);
      expect(session.getService('queueManager')).toBe(mockQueueManager);
      expect(session.getService('adminController')).toBe(mockAdminController);
    });

    it('should throw error if session not initialized', () => {
      expect(() => session.getService('client')).toThrow('Session not initialized');
    });

    it('should throw error for unknown service', async () => {
      await session.initialize();

      expect(() => session.getService('unknownService')).toThrow('Unknown service: unknownService');
    });
  });

  describe('destroy', () => {
    it('should cleanup all services in reverse order', async () => {
      await session.initialize();
      await session.destroy();

      // Verify destruction order (reverse of creation)
      expect(mockAdminController.destroy).toHaveBeenCalledTimes(1);
      expect(mockQueueManager.destroy).toHaveBeenCalledTimes(1);
      expect(mockConnectionManager.disconnect).toHaveBeenCalledTimes(1);
      expect(mockClient.destroy).toHaveBeenCalledTimes(1);
    });

    it('should remove event listeners before disconnecting', async () => {
      await session.initialize();
      await session.destroy();

      // Verify event listeners removed
      expect(mockConnectionManager.removeEventListener).toHaveBeenCalledWith(
        'connected',
        expect.any(Function)
      );
      expect(mockConnectionManager.removeEventListener).toHaveBeenCalledWith(
        'disconnected',
        expect.any(Function)
      );
      expect(mockConnectionManager.removeEventListener).toHaveBeenCalledWith(
        'auth:required',
        expect.any(Function)
      );
    });

    it('should reset state to disconnected', async () => {
      await session.initialize();
      await session.destroy();

      expect(session.state).toBe('disconnected');
      expect(session.services).toBeNull();
    });

    it('should handle destroy before initialization gracefully', async () => {
      await expect(session.destroy()).resolves.toBeUndefined();

      // Should not throw
      expect(session.services).toBeNull();
    });

    it('should handle destroy when services are partially created', async () => {
      // Create services without full initialization
      session._createServices();

      await expect(session.destroy()).resolves.toBeUndefined();
    });
  });

  describe('event wiring', () => {
    it('should initialize admin and sync queue on connected event', async () => {
      await session.initialize();

      // Get the connected handler that was registered
      const connectedHandler = mockConnectionManager.addEventListener.mock.calls.find(
        (call) => call[0] === 'connected'
      )[1];

      // Simulate connected event
      connectedHandler();

      expect(mockAdminController.initialize).toHaveBeenCalledTimes(1);
      expect(mockQueueManager.syncQueue).toHaveBeenCalledTimes(1);
    });

    it('should pause admin on disconnected event', async () => {
      await session.initialize();

      // Get the disconnected handler that was registered
      const disconnectedHandler = mockConnectionManager.addEventListener.mock.calls.find(
        (call) => call[0] === 'disconnected'
      )[1];

      // Simulate disconnected event
      disconnectedHandler();

      expect(mockAdminController.pause).toHaveBeenCalledTimes(1);
    });

    it('should forward auth:required event to session listeners', async () => {
      const authRequiredHandler = jest.fn();
      session.addEventListener('auth:required', authRequiredHandler);

      await session.initialize();

      // Get the auth:required handler that was registered
      const authHandler = mockConnectionManager.addEventListener.mock.calls.find(
        (call) => call[0] === 'auth:required'
      )[1];

      // Simulate auth:required event
      authHandler();

      expect(authRequiredHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('lifecycle edge cases', () => {
    it('should handle missing adminController gracefully in connected handler', async () => {
      await session.initialize();

      // Remove adminController
      session.services.adminController = null;

      const connectedHandler = mockConnectionManager.addEventListener.mock.calls.find(
        (call) => call[0] === 'connected'
      )[1];

      // Should not throw
      expect(() => connectedHandler()).not.toThrow();
    });

    it('should handle missing queueManager gracefully in connected handler', async () => {
      await session.initialize();

      // Remove queueManager
      session.services.queueManager = null;

      const connectedHandler = mockConnectionManager.addEventListener.mock.calls.find(
        (call) => call[0] === 'connected'
      )[1];

      // Should not throw
      expect(() => connectedHandler()).not.toThrow();
    });

    it('should handle missing adminController gracefully in disconnected handler', async () => {
      await session.initialize();

      // Remove adminController
      session.services.adminController = null;

      const disconnectedHandler = mockConnectionManager.addEventListener.mock.calls.find(
        (call) => call[0] === 'disconnected'
      )[1];

      // Should not throw
      expect(() => disconnectedHandler()).not.toThrow();
    });

    it('should handle destroy with missing services gracefully', async () => {
      await session.initialize();

      // Remove some services
      session.services.adminController = null;
      session.services.queueManager = null;

      await expect(session.destroy()).resolves.toBeUndefined();
    });
  });

  describe('state transitions', () => {
    it('should transition through states correctly', async () => {
      expect(session.state).toBe('disconnected');

      const initPromise = session.initialize();
      // State should not change until promise resolves
      expect(session.state).toBe('disconnected');

      await initPromise;
      expect(session.state).toBe('connected');

      await session.destroy();
      expect(session.state).toBe('disconnected');
    });

    it('should set state to error on failure', async () => {
      mockConnectionManager.connect.mockRejectedValue(new Error('Failed'));

      await expect(session.initialize()).rejects.toThrow();
      expect(session.state).toBe('disconnected'); // Cleanup resets to disconnected
    });
  });

  describe('service coordination', () => {
    it('should pass correct config to OrchestratorClient', async () => {
      await session.initialize();

      expect(OrchestratorClient).toHaveBeenCalledWith({
        url: 'https://test.example.com:3000',
        deviceId: 'GM_TEST',
      });
    });

    it('should pass client to ConnectionManager', async () => {
      await session.initialize();

      expect(ConnectionManager).toHaveBeenCalledWith(
        expect.objectContaining({
          client: mockClient,
        })
      );
    });

    it('should pass client to NetworkedQueueManager', async () => {
      await session.initialize();

      expect(NetworkedQueueManager).toHaveBeenCalledWith({
        client: mockClient,
        deviceId: 'GM_TEST',
        debug: console
      });
    });

    it('should pass client to AdminController', async () => {
      await session.initialize();

      // AdminController receives client, dataManager, and teamRegistry (null for tests)
      expect(AdminController).toHaveBeenCalledWith(mockClient, expect.any(Object), null);
    });
  });

  describe('error handling', () => {
    it('should propagate initialization errors', async () => {
      mockConnectionManager.connect.mockRejectedValue(new Error('Custom error'));

      await expect(session.initialize()).rejects.toThrow('Custom error');
    });

    it('should emit session:error event on failure', async () => {
      mockConnectionManager.connect.mockRejectedValue(new Error('Test error'));

      const errorHandler = jest.fn();
      session.addEventListener('session:error', errorHandler);

      await expect(session.initialize()).rejects.toThrow();

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            error: expect.objectContaining({
              message: 'Test error',
            }),
          },
        })
      );
    });
  });

  describe('global WebSocket event handlers', () => {
    let messageHandler;

    beforeEach(async () => {
      // Add addEventListener mock to client
      mockClient.addEventListener = jest.fn();
      mockClient.removeEventListener = jest.fn();

      // Add required dataManager methods for WebSocket event handling
      mockDataManager.updateTeamScoreFromBackend = jest.fn();
      mockDataManager.addTransaction = jest.fn();
      mockDataManager.removeTransaction = jest.fn();
      mockDataManager.clearBackendScores = jest.fn();

      await session.initialize();

      // Get the message:received handler that was registered on client
      const messageCall = mockClient.addEventListener.mock.calls.find(
        (call) => call[0] === 'message:received'
      );
      messageHandler = messageCall ? messageCall[1] : null;
    });

    it('should register message:received handler on client', () => {
      expect(mockClient.addEventListener).toHaveBeenCalledWith(
        'message:received',
        expect.any(Function)
      );
      expect(messageHandler).toBeDefined();
    });

    it('should update DataManager on score:updated event', () => {
      const scorePayload = {
        teamId: '001',
        currentScore: 5000,
        tokensScanned: 3
      };

      messageHandler({ detail: { type: 'score:updated', payload: scorePayload } });

      expect(mockDataManager.updateTeamScoreFromBackend).toHaveBeenCalledWith(scorePayload);
    });

    it('should update DataManager on sync:full event with scores', () => {
      const scores = [
        { teamId: '001', currentScore: 5000 },
        { teamId: '002', currentScore: 3000 }
      ];

      messageHandler({ detail: { type: 'sync:full', payload: { scores } } });

      expect(mockDataManager.updateTeamScoreFromBackend).toHaveBeenCalledTimes(2);
      expect(mockDataManager.updateTeamScoreFromBackend).toHaveBeenCalledWith(scores[0]);
      expect(mockDataManager.updateTeamScoreFromBackend).toHaveBeenCalledWith(scores[1]);
    });

    it('should update DataManager on sync:full event with transactions', () => {
      const recentTransactions = [
        { id: 'tx1', tokenId: 'token1' },
        { id: 'tx2', tokenId: 'token2' }
      ];

      messageHandler({ detail: { type: 'sync:full', payload: { recentTransactions } } });

      expect(mockDataManager.addTransaction).toHaveBeenCalledTimes(2);
      expect(mockDataManager.addTransaction).toHaveBeenCalledWith(recentTransactions[0]);
      expect(mockDataManager.addTransaction).toHaveBeenCalledWith(recentTransactions[1]);
    });

    it('should add transaction on transaction:new event', () => {
      const transaction = { id: 'tx1', tokenId: 'token1', teamId: '001' };

      messageHandler({ detail: { type: 'transaction:new', payload: { transaction } } });

      expect(mockDataManager.addTransactionFromBroadcast).toHaveBeenCalledWith(transaction);
    });

    it('should remove transaction on transaction:deleted event', () => {
      const transactionId = 'tx-to-delete';

      messageHandler({ detail: { type: 'transaction:deleted', payload: { transactionId } } });

      expect(mockDataManager.removeTransaction).toHaveBeenCalledWith(transactionId);
    });

    it('should clear scores on scores:reset event', () => {
      messageHandler({ detail: { type: 'scores:reset', payload: {} } });

      expect(mockDataManager.clearBackendScores).toHaveBeenCalled();
    });

    it('should not call dataManager methods for unhandled event types', () => {
      messageHandler({ detail: { type: 'video:status', payload: { status: 'playing' } } });

      expect(mockDataManager.updateTeamScoreFromBackend).not.toHaveBeenCalled();
      expect(mockDataManager.addTransaction).not.toHaveBeenCalled();
      expect(mockDataManager.removeTransaction).not.toHaveBeenCalled();
      expect(mockDataManager.clearBackendScores).not.toHaveBeenCalled();
    });

    it('should remove message handler on destroy()', async () => {
      await session.destroy();

      expect(mockClient.removeEventListener).toHaveBeenCalledWith(
        'message:received',
        expect.any(Function)
      );
    });

    describe('session:update handling', () => {
      beforeEach(() => {
        mockDataManager.currentSessionId = 'old-session-123';
        mockDataManager.resetForNewSession = jest.fn();
      });

      it('should call resetForNewSession(null) when session ends', () => {
        const payload = { id: 'old-session-123', status: 'ended' };

        messageHandler({ detail: { type: 'session:update', payload } });

        expect(mockDataManager.resetForNewSession).toHaveBeenCalledWith(null);
      });

      it('should call resetForNewSession with new ID when session changes', () => {
        const payload = { id: 'new-session-456', status: 'active' };

        messageHandler({ detail: { type: 'session:update', payload } });

        expect(mockDataManager.resetForNewSession).toHaveBeenCalledWith('new-session-456');
      });

      it('should NOT call resetForNewSession when same session updates', () => {
        const payload = { id: 'old-session-123', status: 'active' };

        messageHandler({ detail: { type: 'session:update', payload } });

        expect(mockDataManager.resetForNewSession).not.toHaveBeenCalled();
      });

      it('should NOT call resetForNewSession when session pauses', () => {
        const payload = { id: 'old-session-123', status: 'paused' };

        messageHandler({ detail: { type: 'session:update', payload } });

        expect(mockDataManager.resetForNewSession).not.toHaveBeenCalled();
      });
    });

    describe('sync:full session boundary handling', () => {
      beforeEach(() => {
        mockDataManager.currentSessionId = 'old-session-123';
        mockDataManager.resetForNewSession = jest.fn();
        mockDataManager.setScannedTokensFromServer = jest.fn();
      });

      it('should call resetForNewSession when sync:full has different session ID', () => {
        const payload = {
          session: { id: 'new-session-456' },
          scores: [],
          recentTransactions: []
        };

        messageHandler({ detail: { type: 'sync:full', payload } });

        expect(mockDataManager.resetForNewSession).toHaveBeenCalledWith('new-session-456');
      });

      it('should NOT call resetForNewSession when sync:full has same session ID', () => {
        const payload = {
          session: { id: 'old-session-123' },
          scores: [],
          recentTransactions: []
        };

        messageHandler({ detail: { type: 'sync:full', payload } });

        expect(mockDataManager.resetForNewSession).not.toHaveBeenCalled();
      });

      it('should call setScannedTokensFromServer when deviceScannedTokens present', () => {
        const deviceScannedTokens = ['token1', 'token2'];
        const payload = {
          session: { id: 'old-session-123' },
          deviceScannedTokens,
          scores: [],
          recentTransactions: []
        };

        messageHandler({ detail: { type: 'sync:full', payload } });

        expect(mockDataManager.setScannedTokensFromServer).toHaveBeenCalledWith(deviceScannedTokens);
      });
    });
  });
});
