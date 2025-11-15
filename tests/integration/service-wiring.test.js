/**
 * Integration Tests - Service Wiring
 * ES6 Module Tests
 *
 * These tests use REAL implementations of all refactored components
 * to verify they wire together correctly.
 *
 * Mocked:
 * - External APIs (fetch, socket.io)
 * - AdminModule namespace (old components)
 * - NetworkedQueueManager (not refactored yet)
 *
 * Real:
 * - NetworkedSession
 * - ConnectionManager
 * - OrchestratorClient
 * - AdminController
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import NetworkedSession from '../../src/network/networkedSession.js';
import ConnectionManager from '../../src/network/connectionManager.js';
import OrchestratorClient from '../../src/network/orchestratorClient.js';
import AdminController from '../../src/app/adminController.js';

// Mock the adminModule to intercept SessionManager, VideoController, etc.
jest.mock('../../src/utils/adminModule.js', () => ({
  SessionManager: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn()
  })),
  VideoController: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn()
  })),
  SystemMonitor: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    refresh: jest.fn()
  })),
  AdminOperations: jest.fn().mockImplementation(() => ({
    destroy: jest.fn()
  })),
  MonitoringDisplay: jest.fn().mockImplementation(() => ({
    destroy: jest.fn(),
    updateConnectionStatus: jest.fn()
  }))
}));

describe('Service Wiring Integration', () => {
  let session;
  let mockSocket;
  let mockDataManager;

  beforeEach(() => {
    // Make refactored components available globally (for NetworkedSession._createServices)
    global.OrchestratorClient = OrchestratorClient;
    global.ConnectionManager = ConnectionManager;
    global.AdminController = AdminController;

    // Mock fetch for health checks
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    // Mock socket.io
    mockSocket = createMockSocket();
    global.io = jest.fn(() => mockSocket);

    // Mock AdminModule namespace (old components not refactored yet)
    global.AdminModule = {
      SessionManager: jest.fn().mockImplementation(() => ({
        destroy: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn()
      })),
      VideoController: jest.fn().mockImplementation(() => ({
        destroy: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn()
      })),
      SystemMonitor: jest.fn().mockImplementation(() => ({
        destroy: jest.fn(),
        refresh: jest.fn()
      })),
      AdminOperations: jest.fn().mockImplementation(() => ({
        destroy: jest.fn()
      })),
      MonitoringDisplay: jest.fn().mockImplementation(() => ({
        destroy: jest.fn(),
        updateConnectionStatus: jest.fn()
      }))
    };

    // Mock NetworkedQueueManager (not refactored yet)
    global.NetworkedQueueManager = jest.fn().mockImplementation(() => ({
      syncQueue: jest.fn(),
      destroy: jest.fn()
    }));

    // Mock DataManager
    mockDataManager = {
      transactions: [],
      scannedTokens: new Set(),
      addTransaction: jest.fn(),
    };

    session = new NetworkedSession({
      url: 'https://localhost:3000',
      deviceId: 'TEST_GM_INTEGRATION',
      stationName: 'Integration Test',
      token: createValidToken()
    }, mockDataManager);
  });

  afterEach(async () => {
    await session.destroy();
    delete global.io;
    delete global.OrchestratorClient;
    delete global.ConnectionManager;
    delete global.AdminController;
    delete global.AdminModule;
    delete global.NetworkedQueueManager;
  });

  describe('full initialization flow', () => {
    it('should initialize all services and emit session:ready', async () => {
      const readyHandler = jest.fn();
      session.addEventListener('session:ready', readyHandler);

      const initPromise = session.initialize();

      // Simulate socket connection (allow event loop to process promise setup)
      await new Promise(resolve => setTimeout(resolve, 0));
      mockSocket._simulateConnect();

      await initPromise;

      expect(readyHandler).toHaveBeenCalled();
      expect(session.state).toBe('connected');
      expect(session.services).toBeDefined();
      expect(session.services.connectionManager).toBeInstanceOf(ConnectionManager);
      expect(session.services.client).toBeInstanceOf(OrchestratorClient);
      expect(session.services.queueManager).toBeDefined();
      expect(session.services.adminController).toBeInstanceOf(AdminController);
    });

    it('should wire services so connected event triggers admin initialization', async () => {
      // Import the mocked module to verify calls
      const adminModule = await import('../../src/utils/adminModule.js');

      const initPromise = session.initialize();

      // Simulate socket connection
      await new Promise(resolve => setTimeout(resolve, 0));
      mockSocket._simulateConnect();

      await initPromise;

      // AdminController should be initialized after connection
      const adminController = session.getService('adminController');
      expect(adminController.initialized).toBe(true);
      expect(adminModule.SessionManager).toHaveBeenCalled();
    });

    it('should wire services so connected event triggers queue sync', async () => {
      const initPromise = session.initialize();

      // Simulate socket connection
      await new Promise(resolve => setTimeout(resolve, 0));
      mockSocket._simulateConnect();

      await initPromise;

      // QueueManager should sync after connection
      const queueManager = session.getService('queueManager');
      // Spy on syncQueue to verify it was called
      const syncSpy = jest.spyOn(queueManager, 'syncQueue');

      // Trigger connected event again to verify wiring
      session.services.connectionManager.dispatchEvent(new Event('connected'));

      expect(syncSpy).toHaveBeenCalled();
    });

    it('should use real ConnectionManager for token validation', async () => {
      // Give session an expired token
      session.config.token = createExpiredToken();

      const errorHandler = jest.fn();
      session.addEventListener('session:error', errorHandler);

      await expect(session.initialize()).rejects.toThrow('Invalid or expired token');

      // ConnectionManager's validation should have caught it
      expect(errorHandler).toHaveBeenCalled();
      // State is 'disconnected' after cleanup (destroy() resets state)
      expect(session.state).toBe('disconnected');
    });

    it('should use real ConnectionManager for health checks', async () => {
      // Mock fetch to fail
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const errorHandler = jest.fn();
      session.addEventListener('session:error', errorHandler);

      await expect(session.initialize()).rejects.toThrow('Orchestrator unreachable');

      // ConnectionManager's health check should have caught it
      expect(errorHandler).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://localhost:3000/health',
        expect.any(Object)
      );
    });

    it('should use real OrchestratorClient for WebSocket connection', async () => {
      const initPromise = session.initialize();

      // Simulate socket connection
      await new Promise(resolve => setTimeout(resolve, 0));
      mockSocket._simulateConnect();

      await initPromise;

      // Verify socket was created with correct config
      expect(global.io).toHaveBeenCalledWith(
        'https://localhost:3000',
        expect.objectContaining({
          transports: ['websocket'],
          auth: expect.objectContaining({
            token: session.config.token,
            deviceId: 'TEST_GM_INTEGRATION',
            deviceType: 'gm'
          })
        })
      );

      const client = session.getService('client');
      expect(client.isConnected).toBe(true);
    });
  });

  describe('error propagation', () => {
    it('should propagate connection errors to session:error', async () => {
      const errorHandler = jest.fn();
      session.addEventListener('session:error', errorHandler);

      const initPromise = session.initialize();

      // Simulate connection error
      await new Promise(resolve => setTimeout(resolve, 0));
      mockSocket._simulateError(new Error('Connection failed'));

      await expect(initPromise).rejects.toThrow();

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        detail: { error: expect.any(Error) }
      }));
      // State is 'disconnected' after cleanup (destroy() resets state)
      expect(session.state).toBe('disconnected');
    });

    it('should emit auth:required on token expiry during initialization', async () => {
      session.config.token = createExpiredToken();

      const authHandler = jest.fn();
      session.addEventListener('auth:required', authHandler);

      await expect(session.initialize()).rejects.toThrow('Invalid or expired token');

      // Should propagate through ConnectionManager → NetworkedSession
      expect(authHandler).toHaveBeenCalled();
    });

    it('should handle disconnect events after initialization', async () => {
      const initPromise = session.initialize();
      await new Promise(resolve => setTimeout(resolve, 0));
      mockSocket._simulateConnect();
      await initPromise;

      const disconnectedHandler = jest.fn();
      session.services.connectionManager.addEventListener('disconnected', disconnectedHandler);

      // Spy on admin controller pause method
      const pauseSpy = jest.spyOn(session.services.adminController, 'pause');

      // Simulate server disconnect
      mockSocket._simulateDisconnect('io server disconnect');

      expect(disconnectedHandler).toHaveBeenCalled();
      expect(pauseSpy).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should cleanup all services on destroy', async () => {
      const initPromise = session.initialize();
      await new Promise(resolve => setTimeout(resolve, 0));
      mockSocket._simulateConnect();
      await initPromise;

      const services = { ...session.services };

      await session.destroy();

      // Verify all destroyed
      expect(services.adminController.modules).toBeNull();
      expect(services.client.socket).toBeNull();
      expect(session.services).toBeNull();
      expect(session.state).toBe('disconnected');
    });

    it('should cleanup in reverse order (LIFO)', async () => {
      const initPromise = session.initialize();
      await new Promise(resolve => setTimeout(resolve, 0));
      mockSocket._simulateConnect();
      await initPromise;

      const destroyOrder = [];

      // Track destroy calls
      session.services.adminController.destroy = jest.fn(() => {
        destroyOrder.push('adminController');
      });
      session.services.queueManager.destroy = jest.fn(() => {
        destroyOrder.push('queueManager');
      });
      session.services.connectionManager.disconnect = jest.fn(async () => {
        destroyOrder.push('connectionManager');
      });
      session.services.client.destroy = jest.fn(() => {
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

    it('should remove event listeners on destroy', async () => {
      const initPromise = session.initialize();
      await new Promise(resolve => setTimeout(resolve, 0));
      mockSocket._simulateConnect();
      await initPromise;

      const connectionManager = session.services.connectionManager;

      // Spy on removeEventListener
      const removeSpy = jest.spyOn(connectionManager, 'removeEventListener');

      await session.destroy();

      expect(removeSpy).toHaveBeenCalledWith('connected', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('disconnected', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('auth:required', expect.any(Function));
    });
  });

  describe('event-driven coordination', () => {
    it('should coordinate admin pause on disconnect via events', async () => {
      const initPromise = session.initialize();
      await new Promise(resolve => setTimeout(resolve, 0));
      mockSocket._simulateConnect();
      await initPromise;

      const pauseSpy = jest.spyOn(session.services.adminController, 'pause');

      // Simulate disconnect
      mockSocket._simulateDisconnect('transport close');

      expect(pauseSpy).toHaveBeenCalled();
    });

    it('should forward auth:required events from ConnectionManager to Session', async () => {
      const initPromise = session.initialize();
      await new Promise(resolve => setTimeout(resolve, 0));
      mockSocket._simulateConnect();
      await initPromise;

      const authHandler = jest.fn();
      session.addEventListener('auth:required', authHandler);

      // Simulate auth:required from ConnectionManager
      session.services.connectionManager.dispatchEvent(
        new CustomEvent('auth:required', { detail: { reason: 'token_expired' } })
      );

      expect(authHandler).toHaveBeenCalled();
    });
  });
});

// Test Helper: Create mock socket.io socket
function createMockSocket() {
  const eventHandlers = {};

  const mockSocket = {
    connected: false,
    on: jest.fn((event, handler) => {
      if (!eventHandlers[event]) {
        eventHandlers[event] = [];
      }
      eventHandlers[event].push(handler);
    }),
    once: jest.fn((event, handler) => {
      if (!eventHandlers[event]) {
        eventHandlers[event] = [];
      }
      eventHandlers[event].push(handler);
    }),
    off: jest.fn((event, handler) => {
      if (eventHandlers[event]) {
        eventHandlers[event] = eventHandlers[event].filter(h => h !== handler);
      }
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn(() => {
      Object.keys(eventHandlers).forEach(key => {
        delete eventHandlers[key];
      });
    }),

    // Test helpers
    _simulateConnect: () => {
      mockSocket.connected = true;
      eventHandlers['connect']?.forEach(handler => handler());
    },
    _simulateError: (error) => {
      eventHandlers['connect_error']?.forEach(handler => handler(error));
    },
    _simulateDisconnect: (reason) => {
      mockSocket.connected = false;
      eventHandlers['disconnect']?.forEach(handler => handler(reason));
    },
    _simulateMessage: (type, data) => {
      eventHandlers[type]?.forEach(handler => handler(data));
    }
  };

  return mockSocket;
}

// Test Helper: Create valid JWT token
function createValidToken(expiresInSeconds = 3600) {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    deviceId: 'TEST_GM_INTEGRATION'
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `header.${encoded}.signature`;
}

// Test Helper: Create expired JWT token
function createExpiredToken() {
  return createValidToken(-60); // Expired 1 minute ago
}
