/**
 * Unit Test: Error Propagation in App.selectGameMode()
 * Verifies that connection errors propagate from NetworkedSession to ConnectionWizard
 */

import { App } from '../../../src/app/app.js';

describe('App - Error Propagation', () => {
  let app;
  let mockDependencies;

  beforeEach(() => {
    // Mock all dependencies
    mockDependencies = {
      debug: {
        log: jest.fn()
      },
      uiManager: {
        showError: jest.fn(),
        showScreen: jest.fn(),
        showToast: jest.fn()
      },
      settings: {
        deviceId: 'TEST_001',
        stationName: 'Test Station',
        save: jest.fn()
      },
      sessionModeManager: {
        setMode: jest.fn(),
        isNetworked: jest.fn(() => false),
        isStandalone: jest.fn(() => false)
      },
      tokenManager: {},
      dataManager: {
        resetForNewSession: jest.fn(),
        networkedSession: null,
        sessionModeManager: null,
        initializeNetworkedMode: jest.fn().mockResolvedValue()
      },
      standaloneDataManager: {
        sessionData: {},
        scannedTokens: new Set()
      }
    };

    // Mock localStorage
    Storage.prototype.getItem = jest.fn();
    Storage.prototype.setItem = jest.fn();
    Storage.prototype.removeItem = jest.fn();

    app = new App(mockDependencies);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should re-throw NetworkedSession initialization errors', async () => {
    // Setup: Valid token in localStorage
    const validToken = createValidJWT();
    Storage.prototype.getItem.mockReturnValue(validToken);

    // Mock NetworkedSession to throw DEVICE_ID_COLLISION error
    const NetworkedSession = require('../../../src/network/networkedSession.js').default;
    const mockInitialize = jest.fn().mockRejectedValue(
      new Error('DEVICE_ID_COLLISION: This device ID is already connected from another location')
    );

    jest.spyOn(NetworkedSession.prototype, 'initialize').mockImplementation(mockInitialize);
    jest.spyOn(NetworkedSession.prototype, 'destroy').mockResolvedValue();

    // Act & Assert: selectGameMode should propagate the error
    await expect(app.selectGameMode('networked')).rejects.toThrow('DEVICE_ID_COLLISION');

    // Verify error was logged and toast shown
    expect(mockDependencies.uiManager.showError).toHaveBeenCalledWith(
      expect.stringContaining('DEVICE_ID_COLLISION')
    );

    // Verify cleanup happened
    expect(NetworkedSession.prototype.destroy).toHaveBeenCalled();
  });

  test('should re-throw AUTH_INVALID errors', async () => {
    const validToken = createValidJWT();
    Storage.prototype.getItem.mockReturnValue(validToken);

    const NetworkedSession = require('../../../src/network/networkedSession.js').default;
    const mockInitialize = jest.fn().mockRejectedValue(
      new Error('AUTH_INVALID: Invalid or expired token')
    );

    jest.spyOn(NetworkedSession.prototype, 'initialize').mockImplementation(mockInitialize);
    jest.spyOn(NetworkedSession.prototype, 'destroy').mockResolvedValue();

    await expect(app.selectGameMode('networked')).rejects.toThrow('AUTH_INVALID');

    expect(mockDependencies.uiManager.showError).toHaveBeenCalledWith(
      expect.stringContaining('AUTH_INVALID')
    );
  });

  test('should re-throw generic connection errors', async () => {
    const validToken = createValidJWT();
    Storage.prototype.getItem.mockReturnValue(validToken);

    const NetworkedSession = require('../../../src/network/networkedSession.js').default;
    const mockInitialize = jest.fn().mockRejectedValue(
      new Error('Connection timeout')
    );

    jest.spyOn(NetworkedSession.prototype, 'initialize').mockImplementation(mockInitialize);
    jest.spyOn(NetworkedSession.prototype, 'destroy').mockResolvedValue();

    await expect(app.selectGameMode('networked')).rejects.toThrow('Connection timeout');

    expect(mockDependencies.uiManager.showError).toHaveBeenCalledWith(
      expect.stringContaining('Connection timeout')
    );
  });
});

/**
 * Helper: Create valid JWT token (not expired)
 */
function createValidJWT(expiresInHours = 24) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + (expiresInHours * 3600),
    iat: Math.floor(Date.now() / 1000),
    role: 'admin'
  }));
  return `${header}.${payload}.test-signature`;
}
