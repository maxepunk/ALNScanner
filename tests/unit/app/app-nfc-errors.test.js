/**
 * Unit Test: NFC Error Handling in App.processNFCRead()
 * Verifies that NFC read errors (from NFCHandler) are handled gracefully
 * without creating junk transactions or confusing the GM.
 */

import { App } from '../../../src/app/app.js';

describe('App - NFC Error Handling', () => {
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
        showToast: jest.fn(),
        updateSessionStats: jest.fn(),
        showTokenResult: jest.fn()
      },
      settings: {
        deviceId: 'TEST_001',
        mode: 'blackmarket',
        save: jest.fn()
      },
      sessionModeManager: {
        setMode: jest.fn(),
        isNetworked: jest.fn(() => false),
        isStandalone: jest.fn(() => true)
      },
      tokenManager: {
        findToken: jest.fn()
      },
      dataManager: {
        isTokenScanned: jest.fn(() => false),
        markTokenAsScanned: jest.fn(),
        addTransaction: jest.fn().mockResolvedValue({ success: true }),
        calculateTokenValue: jest.fn(() => 10000)
      },
      nfcHandler: {
        startScan: jest.fn(),
        stopScan: jest.fn()
      },
      config: {
        SCAN_SIMULATION_DELAY: 1000
      }
    };

    // Setup minimal DOM
    document.body.innerHTML = `
      <div id="scanButton">Start Scanning</div>
      <div id="scanStatus"></div>
      <div id="currentTeam"></div>
    `;

    app = new App(mockDependencies);
    app.currentTeamId = 'TestTeam'; // Required for processNFCRead
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processNFCRead error handling', () => {
    it('should show error and return early when result.source is "error" with no-ndef-records', async () => {
      const errorResult = {
        id: null,
        source: 'error',
        error: 'no-ndef-records',
        raw: 'serial123'
      };

      await app.processNFCRead(errorResult);

      // Should log the error
      expect(mockDependencies.debug.log).toHaveBeenCalledWith(
        'NFC read failed: no-ndef-records',
        true
      );

      // Should show user-friendly error message
      expect(mockDependencies.uiManager.showError).toHaveBeenCalledWith(
        'Could not read token - please re-tap'
      );

      // Should NOT try to process the token (early return)
      expect(mockDependencies.tokenManager.findToken).not.toHaveBeenCalled();
      expect(mockDependencies.dataManager.isTokenScanned).not.toHaveBeenCalled();
      expect(mockDependencies.dataManager.addTransaction).not.toHaveBeenCalled();
    });

    it('should show error and return early when result.source is "error" with unreadable-records', async () => {
      const errorResult = {
        id: null,
        source: 'error',
        error: 'unreadable-records',
        raw: 'fallback789'
      };

      await app.processNFCRead(errorResult);

      // Should log the error
      expect(mockDependencies.debug.log).toHaveBeenCalledWith(
        'NFC read failed: unreadable-records',
        true
      );

      // Should show user-friendly error message
      expect(mockDependencies.uiManager.showError).toHaveBeenCalledWith(
        'Could not read token - please re-tap'
      );

      // Should NOT try to process the token
      expect(mockDependencies.tokenManager.findToken).not.toHaveBeenCalled();
      expect(mockDependencies.dataManager.addTransaction).not.toHaveBeenCalled();
    });

    it('should NOT call showError for successful reads with text-record source', async () => {
      const successResult = {
        id: 'token123',
        source: 'text-record',
        raw: 'token123'
      };

      // Token not found - will be treated as unknown
      mockDependencies.tokenManager.findToken.mockReturnValue(null);

      await app.processNFCRead(successResult);

      // Should NOT show error for successful read
      expect(mockDependencies.uiManager.showError).not.toHaveBeenCalled();

      // SHOULD proceed with token processing
      expect(mockDependencies.tokenManager.findToken).toHaveBeenCalledWith('token123');
    });

    it('should NOT call showError for successful reads with url-record source', async () => {
      const successResult = {
        id: 'https://example.com/token456',
        source: 'url-record',
        raw: 'https://example.com/token456'
      };

      mockDependencies.tokenManager.findToken.mockReturnValue(null);

      await app.processNFCRead(successResult);

      // Should NOT show error for successful read
      expect(mockDependencies.uiManager.showError).not.toHaveBeenCalled();

      // SHOULD proceed with token processing
      expect(mockDependencies.tokenManager.findToken).toHaveBeenCalled();
    });

    it('should NOT call showError for successful reads with generic-decode source', async () => {
      const successResult = {
        id: 'generic-token',
        source: 'generic-decode',
        raw: 'generic-token'
      };

      mockDependencies.tokenManager.findToken.mockReturnValue(null);

      await app.processNFCRead(successResult);

      // Should NOT show error for successful read
      expect(mockDependencies.uiManager.showError).not.toHaveBeenCalled();

      // SHOULD proceed with token processing
      expect(mockDependencies.tokenManager.findToken).toHaveBeenCalled();
    });

    it('should check error condition BEFORE accessing result.id', async () => {
      // Error result has null id - accessing id.trim() would throw
      const errorResult = {
        id: null,
        source: 'error',
        error: 'no-ndef-records',
        raw: 'serial123'
      };

      // This should NOT throw an error
      await expect(app.processNFCRead(errorResult)).resolves.not.toThrow();

      // Should have handled the error gracefully
      expect(mockDependencies.uiManager.showError).toHaveBeenCalled();
    });

    it('should check error condition BEFORE team validation', async () => {
      // Clear team to trigger team validation error if reached
      app.currentTeamId = '';

      const errorResult = {
        id: null,
        source: 'error',
        error: 'no-ndef-records',
        raw: 'serial123'
      };

      await app.processNFCRead(errorResult);

      // Should show the NFC error, NOT the "Please select a team" error
      expect(mockDependencies.uiManager.showError).toHaveBeenCalledWith(
        'Could not read token - please re-tap'
      );

      // Should NOT have logged the team selection error
      expect(mockDependencies.debug.log).not.toHaveBeenCalledWith(
        'ERROR: No team selected - cannot process token',
        true
      );
    });
  });
});
