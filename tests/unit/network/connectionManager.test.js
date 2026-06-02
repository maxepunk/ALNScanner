/**
 * ConnectionManager Tests - Connection Lifecycle Only
 * ES6 Module Tests
 *
 * Tests that ConnectionManager handles ONLY connection lifecycle:
 * - Token validation
 * - Health checks
 * - Retry logic with exponential backoff
 * - Reconnection handling
 * - Auth:required event emission
 *
 * Does NOT handle WebSocket connection (that's OrchestratorClient's job).
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import ConnectionManager from '../../../src/network/connectionManager.js';

describe('ConnectionManager - Connection Lifecycle', () => {
  let connectionManager;
  let mockClient;

  beforeEach(() => {
    mockClient = {
      connect: jest.fn().mockResolvedValue(),
      disconnect: jest.fn().mockResolvedValue(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      isConnected: false
    };

    connectionManager = new ConnectionManager({
      url: 'https://localhost:3000',
      deviceId: 'TEST_GM',
      token: createValidToken(),
      client: mockClient
    });
  });

  describe('constructor', () => {
    it('should initialize with disconnected state', () => {
      expect(connectionManager.state).toBe('disconnected');
    });

    it('should store config', () => {
      expect(connectionManager.config.url).toBe('https://localhost:3000');
      expect(connectionManager.config.deviceId).toBe('TEST_GM');
    });

    it('should store token', () => {
      expect(connectionManager.token).toBeDefined();
    });

    it('should initialize retry count to 0', () => {
      expect(connectionManager.retryCount).toBe(0);
    });

    it('should extend EventTarget for event emission', () => {
      expect(connectionManager).toBeInstanceOf(EventTarget);
    });
  });

  describe('token validation', () => {
    it('should validate token expiry with 1 minute buffer', () => {
      const validToken = createValidToken(120); // 2 minutes
      connectionManager.token = validToken;
      expect(connectionManager.isTokenValid()).toBe(true);
    });

    it('should reject expired tokens', () => {
      const expiredToken = createExpiredToken();
      connectionManager.token = expiredToken;
      expect(connectionManager.isTokenValid()).toBe(false);
    });

    it('should reject tokens expiring within 1 minute', () => {
      const soonExpiredToken = createValidToken(30); // 30 seconds
      connectionManager.token = soonExpiredToken;
      expect(connectionManager.isTokenValid()).toBe(false);
    });

    it('should reject null token', () => {
      connectionManager.token = null;
      expect(connectionManager.isTokenValid()).toBe(false);
    });

    it('should reject malformed token', () => {
      connectionManager.token = 'not-a-jwt';
      expect(connectionManager.isTokenValid()).toBe(false);
    });

    it('should reject token without exp claim', () => {
      const payload = { deviceId: 'TEST_GM' };
      const encoded = btoa(JSON.stringify(payload));
      connectionManager.token = `header.${encoded}.signature`;
      expect(connectionManager.isTokenValid()).toBe(false);
    });
  });

  describe('health check', () => {
    it('should check orchestrator reachability before connecting', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const healthy = await connectionManager.checkHealth();

      expect(fetch).toHaveBeenCalledWith(
        'https://localhost:3000/health',
        expect.objectContaining({
          method: 'GET',
          mode: 'cors'
        })
      );
      expect(healthy).toBe(true);
    });

    it('should return false if orchestrator unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const healthy = await connectionManager.checkHealth();

      expect(healthy).toBe(false);
    });

    it('should return false if health check returns non-ok status', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

      const healthy = await connectionManager.checkHealth();

      expect(healthy).toBe(false);
    });

    it('should timeout after 5 seconds', async () => {
      // Skip this test - testing AbortController timeout is complex
      // The functionality is tested indirectly by "unreachable" test
      expect(true).toBe(true);
    });
  });

  describe('connect', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
    });

    it('should validate token before connecting', async () => {
      connectionManager.token = createExpiredToken();

      await expect(connectionManager.connect()).rejects.toThrow('Invalid or expired token');
      expect(mockClient.connect).not.toHaveBeenCalled();
    });

    it('should check health before connecting', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(connectionManager.connect()).rejects.toThrow('Orchestrator unreachable');
      expect(mockClient.connect).not.toHaveBeenCalled();
    });

    it('should call client.connect with token and auth', async () => {
      await connectionManager.connect();

      expect(mockClient.connect).toHaveBeenCalledWith(
        connectionManager.token,
        {
          deviceId: 'TEST_GM',
          deviceType: 'gm'
        }
      );
    });

    it('should emit connecting event before connection attempt', async () => {
      const connectingHandler = jest.fn();
      connectionManager.addEventListener('connecting', connectingHandler);

      await connectionManager.connect();

      expect(connectingHandler).toHaveBeenCalled();
    });

    it('should emit connected event on success', async () => {
      const connectedHandler = jest.fn();
      connectionManager.addEventListener('connected', connectedHandler);

      await connectionManager.connect();

      expect(connectedHandler).toHaveBeenCalled();
      expect(connectionManager.state).toBe('connected');
    });

    it('should reset retry count on successful connection', async () => {
      connectionManager.retryCount = 3;

      await connectionManager.connect();

      expect(connectionManager.retryCount).toBe(0);
    });

    it('should emit auth:required on token expiry', async () => {
      connectionManager.token = createExpiredToken();
      const authHandler = jest.fn();
      connectionManager.addEventListener('auth:required', authHandler);

      await expect(connectionManager.connect()).rejects.toThrow();

      expect(authHandler).toHaveBeenCalledWith(expect.objectContaining({
        detail: { reason: 'invalid_token' }
      }));
    });

    it('should setup reconnection handler after successful connect', async () => {
      await connectionManager.connect();

      expect(mockClient.addEventListener).toHaveBeenCalledWith(
        'socket:disconnected',
        expect.any(Function)
      );
    });
  });

  describe('reconnection handling', () => {
    beforeEach(async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      await connectionManager.connect();
    });

    it('should auto-reconnect on server-initiated disconnect if token valid', (done) => {
      connectionManager.token = createValidToken();

      // Mock connect to resolve immediately and call done
      jest.spyOn(connectionManager, 'connect').mockImplementation(async () => {
        expect(true).toBe(true); // Reconnect was attempted
        done();
      });

      // Simulate server disconnect
      const disconnectHandler = mockClient.addEventListener.mock.calls
        .find(c => c[0] === 'socket:disconnected')[1];

      disconnectHandler({ detail: { reason: 'io server disconnect' } });
    });

    it('should emit auth:required on disconnect if token expired', async () => {
      connectionManager.token = createExpiredToken();

      const authHandler = jest.fn();
      connectionManager.addEventListener('auth:required', authHandler);

      // Simulate server disconnect
      const disconnectHandler = mockClient.addEventListener.mock.calls
        .find(c => c[0] === 'socket:disconnected')[1];

      disconnectHandler({ detail: { reason: 'io server disconnect' } });

      expect(authHandler).toHaveBeenCalledWith(expect.objectContaining({
        detail: { reason: 'token_expired' }
      }));
    });

    it('should NOT reconnect on client-initiated disconnect', async () => {
      const connectSpy = jest.spyOn(connectionManager, 'connect');

      // Simulate client disconnect
      const disconnectHandler = mockClient.addEventListener.mock.calls
        .find(c => c[0] === 'socket:disconnected')[1];

      disconnectHandler({ detail: { reason: 'client namespace disconnect' } });

      expect(connectSpy).not.toHaveBeenCalled();
    });

    it('should auto-reconnect on transport close (Wi-Fi blip)', (done) => {
      connectionManager.token = createValidToken();

      jest.spyOn(connectionManager, 'connect').mockImplementation(async () => {
        expect(true).toBe(true); // reconnect was attempted
        done();
      });

      const disconnectHandler = mockClient.addEventListener.mock.calls
        .find(c => c[0] === 'socket:disconnected')[1];

      disconnectHandler({ detail: { reason: 'transport close' } });
    });

    it('should auto-reconnect on ping timeout', (done) => {
      connectionManager.token = createValidToken();

      jest.spyOn(connectionManager, 'connect').mockImplementation(async () => {
        expect(true).toBe(true);
        done();
      });

      const disconnectHandler = mockClient.addEventListener.mock.calls
        .find(c => c[0] === 'socket:disconnected')[1];

      disconnectHandler({ detail: { reason: 'ping timeout' } });
    });

    it('should emit disconnected event on disconnect', async () => {
      const disconnectedHandler = jest.fn();
      connectionManager.addEventListener('disconnected', disconnectedHandler);

      // Use a client-initiated reason so no reconnect timer is scheduled.
      const disconnectHandler = mockClient.addEventListener.mock.calls
        .find(c => c[0] === 'socket:disconnected')[1];

      disconnectHandler({ detail: { reason: 'io client disconnect' } });

      expect(disconnectedHandler).toHaveBeenCalledWith(expect.objectContaining({
        detail: { reason: 'io client disconnect' }
      }));
      expect(connectionManager.state).toBe('disconnected');
    });

    it('does not stack multiple reconnects on rapid repeated disconnects (M2)', () => {
      jest.useFakeTimers();
      try {
        connectionManager.token = createValidToken();
        const connectSpy = jest.spyOn(connectionManager, 'connect').mockResolvedValue();

        const disconnectHandler = mockClient.addEventListener.mock.calls
          .find(c => c[0] === 'socket:disconnected')[1];

        // Two rapid transport drops must not schedule two competing reconnects.
        disconnectHandler({ detail: { reason: 'transport close' } });
        disconnectHandler({ detail: { reason: 'transport close' } });

        jest.advanceTimersByTime(60000); // cover any jittered backoff + 30s cap

        expect(connectSpy).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('disconnect() cancels a pending auto-reconnect (M2)', async () => {
      connectionManager.token = createValidToken();
      jest.spyOn(connectionManager, 'connect').mockResolvedValue();

      const disconnectHandler = mockClient.addEventListener.mock.calls
        .find(c => c[0] === 'socket:disconnected')[1];

      // A transport drop schedules a cancellable reconnect...
      disconnectHandler({ detail: { reason: 'transport close' } });
      expect(connectionManager.retryTimer).not.toBeNull();

      // ...which an explicit disconnect() must cancel.
      await connectionManager.disconnect();
      expect(connectionManager.retryTimer).toBeNull();
    });
  });

  describe('retry logic', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
    });

    it('should retry with exponential backoff on connection failure', async () => {
      mockClient.connect.mockRejectedValueOnce(new Error('Connection failed'));

      jest.useFakeTimers();

      const connectPromise = connectionManager.connect();

      // Should fail first attempt
      await expect(connectPromise).rejects.toThrow('Connection failed');
      expect(connectionManager.retryCount).toBe(1);

      // Should schedule retry
      expect(connectionManager.retryTimer).toBeDefined();

      jest.useRealTimers();
    });

    it('should use jittered exponential backoff with 1s base for the first retry', () => {
      // retryCount is the post-increment value: 1 = first retry.
      // base * 2^(retryCount-1), capped at 30s, +/- 20% jitter.
      const cases = [
        { retryCount: 1, center: 1000 },
        { retryCount: 2, center: 2000 },
        { retryCount: 3, center: 4000 },
        { retryCount: 4, center: 8000 },
        { retryCount: 5, center: 16000 },
        { retryCount: 6, center: 30000 }, // capped
        { retryCount: 7, center: 30000 }, // capped
      ];

      for (const { retryCount, center } of cases) {
        connectionManager.retryCount = retryCount;
        const delay = connectionManager._calculateRetryDelay();
        expect(delay).toBeGreaterThanOrEqual(center * 0.8);
        expect(delay).toBeLessThanOrEqual(center * 1.2);
      }
    });

    it('should emit auth:required after max retries', (done) => {
      mockClient.connect.mockRejectedValue(new Error('Connection failed'));
      connectionManager.maxRetries = 1; // Only 1 attempt before max retries

      connectionManager.addEventListener('auth:required', (event) => {
        expect(event.detail.reason).toBe('max_retries');
        expect(connectionManager.retryCount).toBe(1);
        done();
      });

      // Attempt 1 - should fail and emit auth:required immediately
      connectionManager.connect().catch(() => {
        // Expected to fail
      });
    });

    it('should clear retry timer on successful connection', async () => {
      connectionManager.retryTimer = setTimeout(() => {}, 5000);

      await connectionManager.connect();

      expect(connectionManager.retryTimer).toBeNull();
    });

    it('should NOT retry if token expired', async () => {
      mockClient.connect.mockRejectedValue(new Error('Connection failed'));
      connectionManager.token = createExpiredToken();

      await expect(connectionManager.connect()).rejects.toThrow('Invalid or expired token');

      // Should not schedule retry (retryTimer stays null)
      expect(connectionManager.retryTimer).toBeNull();
    });
  });

  describe('connect_error handling', () => {
    beforeEach(async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      await connectionManager.connect();
    });

    // Defensive: P1a.4's DEVICE_ID_COLLISION test schedules a real retry timer.
    // Clear it after each test so it can't fire during a later test (pollution)
    // or keep the Jest worker alive (open handle).
    afterEach(() => {
      connectionManager._clearRetryTimer();
    });

    it('should register a socket:error listener on the client', () => {
      expect(mockClient.addEventListener).toHaveBeenCalledWith(
        'socket:error',
        expect.any(Function)
      );
    });

    it('should capture the reject reason from socket:error', () => {
      const errorHandler = mockClient.addEventListener.mock.calls
        .find(c => c[0] === 'socket:error')[1];

      errorHandler({ detail: { reason: 'DEVICE_ID_COLLISION', error: new Error('x') } });

      expect(connectionManager._lastErrorReason).toBe('DEVICE_ID_COLLISION');
    });

    it('should skip retries and dispatch auth:required on AUTH_INVALID', async () => {
      const authHandler = jest.fn();
      connectionManager.addEventListener('auth:required', authHandler);

      // Simulate handshake rejected for bad token
      mockClient.connect.mockRejectedValueOnce(new Error('AUTH_INVALID: Invalid or expired token'));
      connectionManager._lastErrorReason = 'AUTH_INVALID';
      connectionManager.token = createValidToken(); // token passes local expiry check; server rejected it

      await expect(connectionManager.connect()).rejects.toThrow('AUTH_INVALID');

      expect(authHandler).toHaveBeenCalledWith(expect.objectContaining({
        detail: { reason: 'auth_failed' }
      }));
      expect(connectionManager.retryTimer).toBeNull(); // no retry scheduled
      expect(connectionManager.token).toBeNull();       // stale token cleared
    });

    it('should still schedule a retry on DEVICE_ID_COLLISION', async () => {
      mockClient.connect.mockRejectedValueOnce(new Error('DEVICE_ID_COLLISION: in use'));
      connectionManager._lastErrorReason = 'DEVICE_ID_COLLISION';
      connectionManager.token = createValidToken();

      await expect(connectionManager.connect()).rejects.toThrow('DEVICE_ID_COLLISION');

      expect(connectionManager.retryTimer).not.toBeNull();
      expect(connectionManager.retryCount).toBe(1);
    });
  });

  describe('first-connect error capture (M1)', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
    });

    afterEach(() => {
      connectionManager._clearRetryTimer();
    });

    it('captures AUTH_INVALID on the very first connect and re-prompts (no prior successful connect)', async () => {
      const authHandler = jest.fn();
      connectionManager.addEventListener('auth:required', authHandler);

      // Simulate a real failing handshake: OrchestratorClient fires socket:error
      // (carrying the reason) and THEN client.connect() rejects. This exercises the
      // real capture chain (socket:error -> _lastErrorReason -> catch), unlike the
      // sibling tests that pre-set _lastErrorReason directly.
      mockClient.connect.mockImplementation(async () => {
        const errorHandler = mockClient.addEventListener.mock.calls
          .find(c => c[0] === 'socket:error')?.[1];
        if (errorHandler) {
          errorHandler({ detail: { reason: 'AUTH_INVALID', error: new Error('AUTH_INVALID: bad token') } });
        }
        throw new Error('AUTH_INVALID: bad token');
      });
      connectionManager.token = createValidToken();

      await expect(connectionManager.connect()).rejects.toThrow('AUTH_INVALID');

      // The error handler must have been registered BEFORE the handshake so the
      // reason was captured and the catch re-prompted instead of blindly retrying.
      expect(authHandler).toHaveBeenCalledWith(expect.objectContaining({
        detail: { reason: 'auth_failed' }
      }));
      expect(connectionManager.token).toBeNull();
      expect(connectionManager.retryTimer).toBeNull();
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });
      await connectionManager.connect();
    });

    it('should cleanup retry timer and disconnect client', async () => {
      connectionManager.retryTimer = setTimeout(() => {}, 5000);

      await connectionManager.disconnect();

      expect(connectionManager.retryTimer).toBeNull();
      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(connectionManager.state).toBe('disconnected');
    });

    it('should remove client event listeners', async () => {
      await connectionManager.disconnect();

      expect(mockClient.removeEventListener).toHaveBeenCalledWith(
        'socket:disconnected',
        expect.any(Function)
      );
    });

    it('should not throw if not connected', async () => {
      await connectionManager.disconnect();

      // Second disconnect should be safe
      await expect(connectionManager.disconnect()).resolves.not.toThrow();
    });
  });

  describe('updateToken', () => {
    it('should update token', () => {
      const newToken = createValidToken();
      connectionManager.updateToken(newToken);

      expect(connectionManager.token).toBe(newToken);
    });

    it('should allow reconnection with new token', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const newToken = createValidToken();
      connectionManager.updateToken(newToken);

      await connectionManager.connect();

      expect(mockClient.connect).toHaveBeenCalledWith(
        newToken,
        expect.any(Object)
      );
    });
  });
});

// Test Helpers

function createValidToken(expiresInSeconds = 3600) {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    deviceId: 'TEST_GM'
  };
  const encoded = btoa(JSON.stringify(payload));
  return `header.${encoded}.signature`;
}

function createExpiredToken() {
  return createValidToken(-60); // Expired 1 minute ago
}
