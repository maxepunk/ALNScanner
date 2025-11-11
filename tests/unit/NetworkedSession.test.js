/**
 * NetworkedSession Tests - Service Orchestration
 *
 * Tests the lifecycle orchestration and event wiring of the NetworkedSession.
 * These tests SHOULD FAIL initially - that's the point of TDD!
 */

const NetworkedSession = require('../../js/network/NetworkedSession');

describe('NetworkedSession - Service Orchestration', () => {
  let session;
  let mockConfig;
  let mockServices;

  beforeEach(() => {
    mockConfig = {
      url: 'https://localhost:3000',
      deviceId: 'TEST_GM',
      stationName: 'Test Station',
      token: createValidToken()
    };

    // Mock all service constructors
    mockServices = {
      ConnectionManager: jest.fn().mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(),
        disconnect: jest.fn().mockResolvedValue(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        state: 'disconnected'
      })),
      OrchestratorClient: jest.fn().mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(),
        disconnect: jest.fn().mockResolvedValue(),
        destroy: jest.fn(),
        addEventListener: jest.fn()
      })),
      NetworkedQueueManager: jest.fn().mockImplementation(() => ({
        syncQueue: jest.fn(),
        destroy: jest.fn()
      })),
      AdminController: jest.fn().mockImplementation(() => ({
        initialize: jest.fn(),
        pause: jest.fn(),
        destroy: jest.fn(),
        addEventListener: jest.fn()
      }))
    };

    global.ConnectionManager = mockServices.ConnectionManager;
    global.OrchestratorClient = mockServices.OrchestratorClient;
    global.NetworkedQueueManager = mockServices.NetworkedQueueManager;
    global.AdminController = mockServices.AdminController;

    session = new NetworkedSession(mockConfig);
  });

  afterEach(() => {
    // Cleanup global mocks
    delete global.ConnectionManager;
    delete global.OrchestratorClient;
    delete global.NetworkedQueueManager;
    delete global.AdminController;
  });

  describe('constructor', () => {
    it('should initialize with disconnected state', () => {
      expect(session.state).toBe('disconnected');
      expect(session.services).toBeNull();
    });

    it('should store config', () => {
      expect(session.config).toEqual(mockConfig);
    });

    it('should extend EventTarget for event emission', () => {
      expect(session).toBeInstanceOf(EventTarget);
    });
  });

  describe('initialize', () => {
    it('should create services in correct order', async () => {
      await session.initialize();

      // Verify all services were created
      expect(mockServices.ConnectionManager).toHaveBeenCalled();
      expect(mockServices.OrchestratorClient).toHaveBeenCalled();
      expect(mockServices.NetworkedQueueManager).toHaveBeenCalled();
      expect(mockServices.AdminController).toHaveBeenCalled();

      // Verify creation order (using call order tracking)
      const callOrder = [
        mockServices.ConnectionManager.mock.invocationCallOrder[0],
        mockServices.OrchestratorClient.mock.invocationCallOrder[0],
        mockServices.NetworkedQueueManager.mock.invocationCallOrder[0],
        mockServices.AdminController.mock.invocationCallOrder[0]
      ];

      // Each should be called after the previous
      expect(callOrder[0]).toBeLessThan(callOrder[1]);
      expect(callOrder[1]).toBeLessThan(callOrder[2]);
      expect(callOrder[2]).toBeLessThan(callOrder[3]);
    });

    it('should wire event handlers between services', async () => {
      await session.initialize();

      const connectionManager = session.services.connectionManager;

      // Verify event listeners registered
      expect(connectionManager.addEventListener).toHaveBeenCalledWith(
        'connected',
        expect.any(Function)
      );
      expect(connectionManager.addEventListener).toHaveBeenCalledWith(
        'disconnected',
        expect.any(Function)
      );
      expect(connectionManager.addEventListener).toHaveBeenCalledWith(
        'auth:required',
        expect.any(Function)
      );
    });

    it('should initiate connection after services created', async () => {
      await session.initialize();

      const connectionManager = session.services.connectionManager;
      expect(connectionManager.connect).toHaveBeenCalled();
    });

    it('should emit session:ready on successful initialization', async () => {
      const readyHandler = jest.fn();
      session.addEventListener('session:ready', readyHandler);

      await session.initialize();

      expect(readyHandler).toHaveBeenCalledWith(expect.objectContaining({
        detail: { services: session.services }
      }));
      expect(session.state).toBe('connected');
    });

    it('should emit session:error on initialization failure', async () => {
      mockServices.ConnectionManager.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      const errorHandler = jest.fn();
      session.addEventListener('session:error', errorHandler);

      await expect(session.initialize()).rejects.toThrow('Connection failed');

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        detail: { error: expect.any(Error) }
      }));
      expect(session.state).toBe('error');
    });

    it('should throw if already initialized', async () => {
      await session.initialize();

      await expect(session.initialize()).rejects.toThrow('Session already initialized');
    });
  });

  describe('service coordination', () => {
    it('should initialize admin controller on connected event', async () => {
      await session.initialize();

      const connectionManager = session.services.connectionManager;
      const adminController = session.services.adminController;

      // Simulate connected event
      const connectedHandler = connectionManager.addEventListener.mock.calls
        .find(c => c[0] === 'connected')[1];

      connectedHandler();

      expect(adminController.initialize).toHaveBeenCalled();
    });

    it('should sync queue on connected event', async () => {
      await session.initialize();

      const connectionManager = session.services.connectionManager;
      const queueManager = session.services.queueManager;

      // Simulate connected event
      const connectedHandler = connectionManager.addEventListener.mock.calls
        .find(c => c[0] === 'connected')[1];

      connectedHandler();

      expect(queueManager.syncQueue).toHaveBeenCalled();
    });

    it('should pause admin controller on disconnected event', async () => {
      await session.initialize();

      const connectionManager = session.services.connectionManager;
      const adminController = session.services.adminController;

      // Simulate disconnected event
      const disconnectedHandler = connectionManager.addEventListener.mock.calls
        .find(c => c[0] === 'disconnected')[1];

      disconnectedHandler();

      expect(adminController.pause).toHaveBeenCalled();
    });

    it('should forward auth:required event', async () => {
      await session.initialize();

      const authHandler = jest.fn();
      session.addEventListener('auth:required', authHandler);

      const connectionManager = session.services.connectionManager;

      // Simulate auth:required event
      const authRequiredHandler = connectionManager.addEventListener.mock.calls
        .find(c => c[0] === 'auth:required')[1];

      authRequiredHandler();

      expect(authHandler).toHaveBeenCalled();
    });
  });

  describe('getService', () => {
    it('should return requested service', async () => {
      await session.initialize();

      const connectionManager = session.getService('connectionManager');

      expect(connectionManager).toBeDefined();
      expect(connectionManager.connect).toBeDefined();
    });

    it('should throw if session not initialized', () => {
      expect(() => session.getService('connectionManager'))
        .toThrow('Session not initialized');
    });

    it('should throw if service name invalid', async () => {
      await session.initialize();

      expect(() => session.getService('invalidService'))
        .toThrow();
    });
  });

  describe('destroy', () => {
    it('should destroy services in reverse order', async () => {
      await session.initialize();

      const destroyOrder = [];

      session.services.adminController.destroy.mockImplementation(() => {
        destroyOrder.push('adminController');
      });
      session.services.queueManager.destroy.mockImplementation(() => {
        destroyOrder.push('queueManager');
      });
      session.services.connectionManager.disconnect.mockImplementation(async () => {
        destroyOrder.push('connectionManager');
      });
      session.services.client.destroy.mockImplementation(() => {
        destroyOrder.push('client');
      });

      await session.destroy();

      expect(destroyOrder).toEqual([
        'adminController',
        'queueManager',
        'connectionManager',
        'client'
      ]);
    });

    it('should reset state after destroy', async () => {
      await session.initialize();

      await session.destroy();

      expect(session.services).toBeNull();
      expect(session.state).toBe('disconnected');
    });

    it('should not throw if not initialized', async () => {
      await expect(session.destroy()).resolves.not.toThrow();
    });

    it('should remove all event listeners', async () => {
      await session.initialize();

      const connectionManager = session.services.connectionManager;

      await session.destroy();

      expect(connectionManager.removeEventListener).toHaveBeenCalled();
    });
  });
});

// Test Helpers

function createValidToken(expiresInSeconds = 3600) {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    deviceId: 'TEST_GM'
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `header.${encoded}.signature`;
}
