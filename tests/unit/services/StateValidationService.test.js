/**
 * StateValidationService Unit Tests
 *
 * Tests the validation service that checks system state before
 * restoring networked mode on page reload.
 */

// Mock Debug BEFORE importing modules
jest.mock('../../../src/utils/debug.js', () => ({
  default: {
    log: jest.fn()
  },
  __esModule: true
}));

import { StateValidationService } from '../../../src/services/StateValidationService.js';

// Mock fetch globally
global.fetch = jest.fn();

// Mock localStorage
const mockLocalStorage = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => { store[key] = value; }),
    removeItem: jest.fn((key) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; })
  };
})();

Object.defineProperty(global, 'localStorage', { value: mockLocalStorage });

// Helper: Create valid JWT token
function createValidToken(expiresInSeconds = 3600) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    iat: Math.floor(Date.now() / 1000)
  }));
  return `${header}.${payload}.test-signature`;
}

// Helper: Create expired JWT token
function createExpiredToken() {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    iat: Math.floor(Date.now() / 1000) - 7200
  }));
  return `${header}.${payload}.test-signature`;
}

describe('StateValidationService', () => {
  let service;

  beforeEach(() => {
    service = new StateValidationService({ timeout: 1000 });
    jest.clearAllMocks();
    mockLocalStorage.clear();
    global.fetch.mockClear();
  });

  describe('constructor', () => {
    it('should use default timeout of 5000ms', () => {
      const defaultService = new StateValidationService();
      expect(defaultService.timeout).toBe(5000);
    });

    it('should accept custom timeout', () => {
      const customService = new StateValidationService({ timeout: 2000 });
      expect(customService.timeout).toBe(2000);
    });
  });

  describe('isTokenValid', () => {
    it('should return true for valid non-expired token', () => {
      const token = createValidToken(3600);
      expect(service.isTokenValid(token)).toBe(true);
    });

    it('should return false for expired token', () => {
      const token = createExpiredToken();
      expect(service.isTokenValid(token)).toBe(false);
    });

    it('should return false for token expiring within 1-minute buffer', () => {
      const token = createValidToken(30); // 30 seconds until expiry
      expect(service.isTokenValid(token)).toBe(false);
    });

    it('should return false for invalid token format (not 3 parts)', () => {
      expect(service.isTokenValid('invalid-token')).toBe(false);
      expect(service.isTokenValid('part1.part2')).toBe(false);
      expect(service.isTokenValid('')).toBe(false);
    });

    it('should return false for token with invalid payload JSON', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const invalidPayload = 'not-valid-base64!@#$';
      const token = `${header}.${invalidPayload}.signature`;
      expect(service.isTokenValid(token)).toBe(false);
    });

    it('should return false for token without exp claim', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256' }));
      const payload = btoa(JSON.stringify({ iat: Date.now() })); // No exp
      const token = `${header}.${payload}.signature`;
      expect(service.isTokenValid(token)).toBe(false);
    });
  });

  describe('checkOrchestratorHealth', () => {
    it('should return true when health endpoint returns 200', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      const result = await service.checkOrchestratorHealth('https://localhost:3000');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://localhost:3000/health',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return false when health endpoint returns non-200', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const result = await service.checkOrchestratorHealth('https://localhost:3000');

      expect(result).toBe(false);
    });

    it('should return false when fetch throws network error', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.checkOrchestratorHealth('https://localhost:3000');

      expect(result).toBe(false);
    });

    it('should return false when request times out', async () => {
      // Simulate abort by rejecting with AbortError
      global.fetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

      const result = await service.checkOrchestratorHealth('https://localhost:3000');

      expect(result).toBe(false);
    });
  });

  describe('checkSessionExists', () => {
    it('should return true when session endpoint returns valid session', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'session-123', name: 'Test Session' })
      });

      const result = await service.checkSessionExists('https://localhost:3000');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://localhost:3000/api/session',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return false when session endpoint returns empty object', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}) // No id field
      });

      const result = await service.checkSessionExists('https://localhost:3000');

      expect(result).toBe(false);
    });

    it('should return false when session endpoint returns null', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => null
      });

      const result = await service.checkSessionExists('https://localhost:3000');

      expect(result).toBe(false);
    });

    it('should return false when session endpoint returns 404', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const result = await service.checkSessionExists('https://localhost:3000');

      expect(result).toBe(false);
    });

    it('should return false when fetch throws error', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.checkSessionExists('https://localhost:3000');

      expect(result).toBe(false);
    });
  });

  describe('validateAll', () => {
    const orchestratorUrl = 'https://localhost:3000';

    it('should return valid=true when all validations pass', async () => {
      // Setup: valid token, reachable orchestrator, active session
      mockLocalStorage.setItem('aln_auth_token', createValidToken());

      global.fetch
        .mockResolvedValueOnce({ ok: true }) // health
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'session-123' })
        }); // session

      const result = await service.validateAll(orchestratorUrl);

      expect(result.valid).toBe(true);
      expect(result.reason).toBeNull();
      expect(result.details.tokenValid).toBe(true);
      expect(result.details.orchestratorReachable).toBe(true);
      expect(result.details.sessionExists).toBe(true);
    });

    it('should fail early when no token exists', async () => {
      // No token in localStorage
      const result = await service.validateAll(orchestratorUrl);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('No authentication token found');
      expect(result.details.tokenValid).toBe(false);
      // Should not have made any fetch calls
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should fail early when token is expired', async () => {
      mockLocalStorage.setItem('aln_auth_token', createExpiredToken());

      const result = await service.validateAll(orchestratorUrl);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Authentication token expired');
      expect(result.details.tokenValid).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should fail when no orchestrator URL provided', async () => {
      mockLocalStorage.setItem('aln_auth_token', createValidToken());

      const result = await service.validateAll(null);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('No orchestrator URL configured');
      expect(result.details.tokenValid).toBe(true);
    });

    it('should fail when orchestrator is unreachable', async () => {
      mockLocalStorage.setItem('aln_auth_token', createValidToken());
      global.fetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.validateAll(orchestratorUrl);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Orchestrator unreachable');
      expect(result.details.tokenValid).toBe(true);
      expect(result.details.orchestratorReachable).toBe(false);
    });

    it('should fail when no active session exists', async () => {
      mockLocalStorage.setItem('aln_auth_token', createValidToken());
      global.fetch
        .mockResolvedValueOnce({ ok: true }) // health
        .mockResolvedValueOnce({
          ok: true,
          json: async () => null // No session
        });

      const result = await service.validateAll(orchestratorUrl);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('No active session on orchestrator');
      expect(result.details.tokenValid).toBe(true);
      expect(result.details.orchestratorReachable).toBe(true);
      expect(result.details.sessionExists).toBe(false);
    });
  });

  describe('clearStaleState', () => {
    it('should remove auth token from localStorage', () => {
      mockLocalStorage.setItem('aln_auth_token', 'some-token');

      service.clearStaleState();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('aln_auth_token');
    });

    it('should remove game session mode from localStorage', () => {
      mockLocalStorage.setItem('aln_game_session_mode', 'networked');

      service.clearStaleState();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('aln_game_session_mode');
    });

    it('should remove session data from localStorage', () => {
      mockLocalStorage.setItem('aln_session_data', '{}');

      service.clearStaleState();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('aln_session_data');
    });

    it('should NOT remove orchestrator URL (user preference)', () => {
      mockLocalStorage.setItem('aln_orchestrator_url', 'https://localhost:3000');

      service.clearStaleState();

      expect(mockLocalStorage.removeItem).not.toHaveBeenCalledWith('aln_orchestrator_url');
    });
  });
});

// Integration tests for validateAndDetermineInitialScreen are covered in E2E tests
// as they require complex module reloading that doesn't work well with Jest module mocks.
