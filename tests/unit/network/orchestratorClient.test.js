/**
 * OrchestratorClient Tests - Dumb WebSocket Pipe
 *
 * Tests that OrchestratorClient is ONLY a WebSocket wrapper with NO business logic.
 * All token validation, retry logic, and reconnection handling is ConnectionManager's job.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import OrchestratorClient from '../../../src/network/orchestratorClient.js';

describe('OrchestratorClient - Dumb Pipe', () => {
  let client;
  let mockSocket;

  beforeEach(() => {
    // Mock socket.io
    mockSocket = createMockSocket();
    global.io = jest.fn(() => mockSocket);

    client = new OrchestratorClient({
      url: 'https://localhost:3000',
      deviceId: 'TEST_GM'
    });
  });

  afterEach(() => {
    delete global.io;
  });

  describe('constructor', () => {
    it('should initialize with null socket', () => {
      expect(client.socket).toBeNull();
      expect(client.isConnected).toBe(false);
    });

    it('should store config', () => {
      expect(client.config.url).toBe('https://localhost:3000');
      expect(client.config.deviceId).toBe('TEST_GM');
    });

    it('should NOT create socket until connect() called', () => {
      expect(global.io).not.toHaveBeenCalled();
    });

    it('should extend EventTarget for event emission', () => {
      expect(client).toBeInstanceOf(EventTarget);
    });
  });

  describe('connect', () => {
    it('should create socket with provided token and auth', async () => {
      const token = 'fake.jwt.token';
      const auth = { deviceId: 'TEST_GM', deviceType: 'gm' };

      const connectPromise = client.connect(token, auth);

      // Simulate successful connection
      mockSocket._simulateConnect();

      await connectPromise;

      expect(global.io).toHaveBeenCalledWith(
        'https://localhost:3000',
        expect.objectContaining({
          transports: ['websocket'],
          auth: {
            token: 'fake.jwt.token',
            deviceId: 'TEST_GM',
            deviceType: 'gm',
            version: '1.0.0'
          }
        })
      );
    });

    it('should emit socket:connected event when connection succeeds', async () => {
      const connectHandler = jest.fn();
      client.addEventListener('socket:connected', connectHandler);

      const connectPromise = client.connect('token', { deviceId: 'TEST', deviceType: 'gm' });
      mockSocket._simulateConnect();

      await connectPromise;

      expect(connectHandler).toHaveBeenCalled();
      expect(client.isConnected).toBe(true);
    });

    it('should emit socket:error event on connection failure', async () => {
      const errorHandler = jest.fn();
      client.addEventListener('socket:error', errorHandler);

      const connectPromise = client.connect('token', { deviceId: 'TEST', deviceType: 'gm' });
      mockSocket._simulateError(new Error('Connection failed'));

      await expect(connectPromise).rejects.toThrow('Connection failed');
      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        detail: { error: expect.any(Error) }
      }));
    });

    it('should timeout after 10 seconds if no response', async () => {
      jest.useFakeTimers();

      const connectPromise = client.connect('token', { deviceId: 'TEST', deviceType: 'gm' });

      jest.advanceTimersByTime(10000);

      await expect(connectPromise).rejects.toThrow('Connection timeout');

      jest.useRealTimers();
    });

    it('should cleanup old socket before creating new one', async () => {
      // First connection
      const connectPromise1 = client.connect('token', { deviceId: 'TEST', deviceType: 'gm' });
      mockSocket._simulateConnect();
      await connectPromise1;

      const oldSocket = client.socket;

      // Second connection (should cleanup first)
      const connectPromise2 = client.connect('token', { deviceId: 'TEST', deviceType: 'gm' });
      mockSocket._simulateConnect();
      await connectPromise2;

      expect(oldSocket.removeAllListeners).toHaveBeenCalled();
      expect(oldSocket.disconnect).toHaveBeenCalled();
    });

    it('should NOT validate token (that is ConnectionManager responsibility)', async () => {
      // Should not have any isTokenValid method
      expect(client.isTokenValid).toBeUndefined();

      // Should accept any token string without validation
      const connectPromise = client.connect('any-string-works', { deviceId: 'TEST', deviceType: 'gm' });
      mockSocket._simulateConnect();
      await expect(connectPromise).resolves.not.toThrow();
    });

    it('should NOT handle reconnection logic (that is ConnectionManager responsibility)', () => {
      // Should not have retry methods
      expect(client.scheduleRetry).toBeUndefined();
      expect(client.retryCount).toBeUndefined();
      expect(client.maxRetries).toBeUndefined();
    });
  });

  describe('send', () => {
    beforeEach(async () => {
      const connectPromise = client.connect('token', { deviceId: 'TEST', deviceType: 'gm' });
      mockSocket._simulateConnect();
      await connectPromise;
    });

    it('should wrap message in AsyncAPI envelope', () => {
      client.send('transaction:submit', {
        tokenId: 'test',
        teamId: '001',
        deviceId: 'GM_TEST',
        mode: 'blackmarket'
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('transaction:submit', {
        event: 'transaction:submit',
        data: expect.objectContaining({
          tokenId: 'test',
          teamId: '001',
          deviceId: 'GM_TEST',
          mode: 'blackmarket'
        }),
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
      });
    });

    it('should throw if socket not connected', () => {
      client.socket.connected = false;

      expect(() => client.send('test:event', {}))
        .toThrow('Socket not connected');
    });

    it('should throw if socket is null', async () => {
      await client.disconnect();

      expect(() => client.send('test:event', {}))
        .toThrow('Socket not connected');
    });
  });

  describe('message forwarding', () => {
    beforeEach(async () => {
      const connectPromise = client.connect('token', { deviceId: 'TEST', deviceType: 'gm' });
      mockSocket._simulateConnect();
      await connectPromise;
    });

    it('should emit message:received event for all orchestrator messages', () => {
      const messageHandler = jest.fn();
      client.addEventListener('message:received', messageHandler);

      // Simulate receiving sync:full
      mockSocket._simulateMessage('sync:full', {
        event: 'sync:full',
        data: { session: null, scores: [] },
        timestamp: new Date().toISOString()
      });

      expect(messageHandler).toHaveBeenCalledWith(expect.objectContaining({
        detail: {
          type: 'sync:full',
          payload: expect.objectContaining({
            session: null,
            scores: []
          })
        }
      }));
    });

    it('should forward all AsyncAPI message types', () => {
      const messageHandler = jest.fn();
      client.addEventListener('message:received', messageHandler);

      const messageTypes = [
        'sync:full',
        'transaction:result',
        'transaction:new',
        'score:updated',
        'video:status',
        'session:update',
        'device:connected',
        'device:disconnected',
        'group:completed',
        'gm:command:ack',
        'offline:queue:processed',
        'batch:ack',
        'error'
      ];

      messageTypes.forEach(type => {
        mockSocket._simulateMessage(type, {
          event: type,
          data: { test: 'data' },
          timestamp: new Date().toISOString()
        });
      });

      expect(messageHandler).toHaveBeenCalledTimes(messageTypes.length);
    });

    it('should NOT process messages (just forward them)', () => {
      const messageHandler = jest.fn();
      client.addEventListener('message:received', messageHandler);

      // Should not have any handler methods
      expect(client.handleSync).toBeUndefined();
      expect(client.handleTransaction).toBeUndefined();
      expect(client.processMessage).toBeUndefined();

      // Should just forward
      mockSocket._simulateMessage('sync:full', {
        event: 'sync:full',
        data: { session: { id: 'test' } },
        timestamp: new Date().toISOString()
      });

      expect(messageHandler).toHaveBeenCalledWith(expect.objectContaining({
        detail: {
          type: 'sync:full',
          payload: { session: { id: 'test' } }
        }
      }));
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      const connectPromise = client.connect('token', { deviceId: 'TEST', deviceType: 'gm' });
      mockSocket._simulateConnect();
      await connectPromise;
    });

    it('should cleanup socket and listeners', async () => {
      await client.disconnect();

      expect(mockSocket.removeAllListeners).toHaveBeenCalled();
      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(client.socket).toBeNull();
      expect(client.isConnected).toBe(false);
    });

    it('should wait for disconnect event before resolving', async () => {
      const disconnectPromise = client.disconnect();

      // Should not resolve immediately
      let resolved = false;
      disconnectPromise.then(() => { resolved = true; });

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(resolved).toBe(false);

      // Simulate disconnect event
      mockSocket._simulateDisconnect('client namespace disconnect');

      await disconnectPromise;
      expect(resolved).toBe(true);
    });

    it('should emit socket:disconnected event', async () => {
      const disconnectHandler = jest.fn();
      client.addEventListener('socket:disconnected', disconnectHandler);

      const disconnectPromise = client.disconnect();
      mockSocket._simulateDisconnect('client namespace disconnect');

      await disconnectPromise;

      expect(disconnectHandler).toHaveBeenCalledWith(expect.objectContaining({
        detail: { reason: 'client namespace disconnect' }
      }));
    });

    it('should not throw if socket already null', async () => {
      await client.disconnect();

      // Second disconnect should be safe
      await expect(client.disconnect()).resolves.not.toThrow();
    });

    it('should timeout after 1 second if no disconnect event', async () => {
      jest.useFakeTimers();

      const disconnectPromise = client.disconnect();

      jest.advanceTimersByTime(1000);

      await disconnectPromise;

      expect(client.socket).toBeNull();

      jest.useRealTimers();
    });

    it('should handle disconnect when socket exists but not connected', async () => {
      const connectPromise = client.connect('token', { deviceId: 'TEST', deviceType: 'gm' });
      mockSocket._simulateConnect();
      await connectPromise;

      // Simulate unexpected disconnection (socket exists but not connected)
      mockSocket.connected = false;
      client.isConnected = false;

      await client.disconnect();

      expect(client.socket).toBeNull();
    });
  });

  describe('destroy', () => {
    it('should cleanup all resources', async () => {
      const connectPromise = client.connect('token', { deviceId: 'TEST', deviceType: 'gm' });
      mockSocket._simulateConnect();
      await connectPromise;

      client.destroy();

      expect(mockSocket.removeAllListeners).toHaveBeenCalled();
      expect(client.socket).toBeNull();
      expect(client.isConnected).toBe(false);
    });

    it('should not throw if never connected', () => {
      expect(() => client.destroy()).not.toThrow();
    });

    it('should cleanup connection timeout if destroyed during connection', async () => {
      jest.useFakeTimers();

      const connectPromise = client.connect('token', { deviceId: 'TEST', deviceType: 'gm' });

      // Destroy while connection in progress
      client.destroy();

      // Connection timeout should be cleared
      expect(client.connectionTimeout).toBeNull();
      expect(client.socket).toBeNull();

      jest.useRealTimers();
    });

    it('should handle destroy when socket disconnected but exists', async () => {
      const connectPromise = client.connect('token', { deviceId: 'TEST', deviceType: 'gm' });
      mockSocket._simulateConnect();
      await connectPromise;

      // Simulate socket disconnected but not cleaned up yet
      mockSocket.connected = false;

      client.destroy();

      expect(mockSocket.removeAllListeners).toHaveBeenCalled();
      expect(client.socket).toBeNull();
      expect(client.isConnected).toBe(false);
    });
  });

  describe('socket event handling', () => {
    beforeEach(async () => {
      const connectPromise = client.connect('token', { deviceId: 'TEST', deviceType: 'gm' });
      mockSocket._simulateConnect();
      await connectPromise;
    });

    it('should emit socket:disconnected on disconnect', () => {
      const disconnectHandler = jest.fn();
      client.addEventListener('socket:disconnected', disconnectHandler);

      mockSocket._simulateDisconnect('io server disconnect');

      expect(disconnectHandler).toHaveBeenCalledWith(expect.objectContaining({
        detail: { reason: 'io server disconnect' }
      }));
    });

    it('should update isConnected on disconnect', () => {
      expect(client.isConnected).toBe(true);

      mockSocket._simulateDisconnect('transport close');

      expect(client.isConnected).toBe(false);
    });

    it('should NOT auto-reconnect on disconnect (ConnectionManager handles that)', () => {
      // Should not have reconnection methods
      expect(client.reconnect).toBeUndefined();
      expect(client.autoReconnect).toBeUndefined();

      mockSocket._simulateDisconnect('io server disconnect');

      // Should not attempt reconnection
      expect(global.io).toHaveBeenCalledTimes(1); // Only the initial connect
    });

    it('should NOT handle auth:required (ConnectionManager handles that)', () => {
      // Should not have auth-related methods
      expect(client.checkTokenExpiry).toBeUndefined();
      expect(client.refreshToken).toBeUndefined();
      expect(client.handleAuthRequired).toBeUndefined();
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
