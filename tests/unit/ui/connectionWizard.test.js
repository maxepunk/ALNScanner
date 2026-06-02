/**
 * Unit tests for ConnectionWizard
 * Tests auto-assignment of station names with device ID collision prevention
 */

import { ConnectionWizard, setupCleanupHandlers } from '../../../src/ui/connectionWizard.js';

describe('ConnectionWizard', () => {
  let wizard;
  let mockApp;
  let mockFetch;

  beforeEach(() => {
    // Mock DOM elements
    document.body.innerHTML = `
      <form id="connectionForm">
        <input type="text" id="serverUrl" />
        <div id="stationNameDisplay" class="station-display" data-device-id=""></div>
        <input type="password" id="gmPassword" />
        <div id="connectionStatusMsg"></div>
        <div id="discoveryStatus"></div>
        <div id="discoveredServers"></div>
      </form>
    `;

    // Mock app with required dependencies
    mockApp = {
      settings: {
        deviceId: '',
        stationName: '',
        save: jest.fn()
      },
      selectGameMode: jest.fn().mockResolvedValue(undefined)
    };

    // Mock fetch
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    // Mock localStorage with jest.spyOn
    Storage.prototype.getItem = jest.fn();
    Storage.prototype.setItem = jest.fn();

    wizard = new ConnectionWizard(mockApp);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('_findNextStationId()', () => {
    test('should return GM_Station_1 when no existing devices', () => {
      const result = wizard._findNextStationId([]);
      expect(result).toBe('GM_Station_1');
    });

    test('should return GM_Station_2 when GM_Station_1 exists', () => {
      const result = wizard._findNextStationId(['GM_Station_1']);
      expect(result).toBe('GM_Station_2');
    });

    test('should fill gaps in numbering (1,3 exists → assign 2)', () => {
      const result = wizard._findNextStationId(['GM_Station_1', 'GM_Station_3']);
      expect(result).toBe('GM_Station_2');
    });

    test('should handle non-sequential IDs (1,2,5 exists → assign 3)', () => {
      const result = wizard._findNextStationId([
        'GM_Station_1',
        'GM_Station_2',
        'GM_Station_5'
      ]);
      expect(result).toBe('GM_Station_3');
    });

    test('should ignore non-GM device IDs', () => {
      const result = wizard._findNextStationId([
        'player_scanner_1',
        'esp32_001',
        'GM_Station_1'
      ]);
      expect(result).toBe('GM_Station_2');
    });

    test('should handle malformed GM IDs gracefully', () => {
      const result = wizard._findNextStationId([
        'GM_Station_',
        'GM_Station_abc',
        'GM_Station_1'
      ]);
      expect(result).toBe('GM_Station_2');
    });

    test('should sort numerically, not lexicographically', () => {
      const result = wizard._findNextStationId([
        'GM_Station_2',
        'GM_Station_10',
        'GM_Station_1'
      ]);
      expect(result).toBe('GM_Station_3');
    });
  });

  describe('assignStationName()', () => {
    test('should query /api/state and assign next available ID', async () => {
      const mockState = {
        devices: [
          { deviceId: 'GM_Station_1', type: 'gm', connectionStatus: 'connected' },
          { deviceId: 'GM_Station_2', type: 'gm', connectionStatus: 'connected' }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockState
      });

      await wizard.assignStationName('http://localhost:3000');

      const display = document.getElementById('stationNameDisplay');
      expect(display.textContent).toBe('GM_Station_3');
      expect(display.dataset.deviceId).toBe('GM_Station_3');
    });

    test('should fallback to localStorage counter on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      Storage.prototype.getItem.mockReturnValue('5');

      await wizard.assignStationName('http://localhost:3000');

      const display = document.getElementById('stationNameDisplay');
      expect(display.textContent).toBe('GM_Station_5');
      expect(display.dataset.deviceId).toBe('GM_Station_5');
    });

    test('should filter out non-GM devices and disconnected GMs', async () => {
      const mockState = {
        devices: [
          { deviceId: 'GM_Station_1', type: 'gm', connectionStatus: 'connected' },
          { deviceId: 'GM_Station_5', type: 'gm', connectionStatus: 'disconnected' },
          { deviceId: 'player_1', type: 'player', connectionStatus: 'connected' },
          { deviceId: 'esp32_001', type: 'esp32', connectionStatus: 'connected' }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockState
      });

      await wizard.assignStationName('http://localhost:3000');

      const display = document.getElementById('stationNameDisplay');
      expect(display.textContent).toBe('GM_Station_2');
    });
  });

  describe('selectServer()', () => {
    test('should populate serverUrl input and call assignStationName()', async () => {
      const assignSpy = jest.spyOn(wizard, 'assignStationName').mockResolvedValue();

      wizard.selectServer('http://10.0.0.100:3000');

      expect(document.getElementById('serverUrl').value).toBe('http://10.0.0.100:3000');
      expect(assignSpy).toHaveBeenCalledWith('http://10.0.0.100:3000');
    });
  });

  describe('handleConnectionSubmit()', () => {
    test('should read deviceId from display dataset, not input field', async () => {
      const display = document.getElementById('stationNameDisplay');
      display.textContent = 'GM_Station_3';
      display.dataset.deviceId = 'GM_Station_3';

      document.getElementById('serverUrl').value = 'http://localhost:3000';
      document.getElementById('gmPassword').value = 'admin';

      mockFetch
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'fake-jwt-token' })
        }); // auth

      const event = new Event('submit');
      event.preventDefault = jest.fn();

      await wizard.handleConnectionSubmit(event);

      expect(mockApp.settings.deviceId).toBe('GM_Station_3');
      expect(mockApp.settings.stationName).toBe('GM_Station_3');
      expect(Storage.prototype.setItem).toHaveBeenCalledWith('aln_station_name', 'GM_Station_3');
    });

    test('should reject submission if display has no deviceId', async () => {
      document.getElementById('serverUrl').value = 'http://localhost:3000';
      document.getElementById('gmPassword').value = 'admin';

      // Display has empty dataset
      const display = document.getElementById('stationNameDisplay');
      display.dataset.deviceId = '';

      const event = new Event('submit');
      event.preventDefault = jest.fn();

      await wizard.handleConnectionSubmit(event);

      const statusDiv = document.getElementById('connectionStatusMsg');
      expect(statusDiv.textContent).toContain('Please fill in all fields');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should show a timeout-specific message when the auth POST aborts', async () => {
      const display = document.getElementById('stationNameDisplay');
      display.textContent = 'GM_Station_1';
      display.dataset.deviceId = 'GM_Station_1';

      document.getElementById('serverUrl').value = 'http://localhost:3000';
      document.getElementById('gmPassword').value = 'admin';

      mockFetch
        .mockResolvedValueOnce({ ok: true }) // health check passes
        .mockRejectedValueOnce(
          Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
        ); // auth POST times out

      const event = new Event('submit');
      event.preventDefault = jest.fn();

      await wizard.handleConnectionSubmit(event);

      const statusDiv = document.getElementById('connectionStatusMsg');
      expect(statusDiv.textContent).toContain('timed out');
      // must NOT proceed to networked init on a timeout
      expect(mockApp.selectGameMode).not.toHaveBeenCalled();
    });

    test('should pass an AbortSignal to the auth POST', async () => {
      const display = document.getElementById('stationNameDisplay');
      display.textContent = 'GM_Station_1';
      display.dataset.deviceId = 'GM_Station_1';

      document.getElementById('serverUrl').value = 'http://localhost:3000';
      document.getElementById('gmPassword').value = 'admin';

      mockFetch
        .mockResolvedValueOnce({ ok: true }) // health check
        .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 't' }) }); // auth

      const event = new Event('submit');
      event.preventDefault = jest.fn();

      await wizard.handleConnectionSubmit(event);

      // 2nd fetch call is the auth POST; assert it carried a signal
      const authCall = mockFetch.mock.calls.find(([url]) =>
        typeof url === 'string' && url.includes('/api/admin/auth')
      );
      expect(authCall).toBeDefined();
      expect(authCall[1].signal).toBeInstanceOf(AbortSignal);
    });
  });
});

describe('setupCleanupHandlers() — page lifecycle (RL-2)', () => {
  let lifecycleApp;
  let mockClient;
  let mockConnectionManager;

  const setVisibility = (state) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state
    });
  };

  beforeEach(() => {
    // Capture per-test consts in the closure. setupCleanupHandlers adds anonymous
    // document/window listeners that can't be removed, so they accumulate across
    // tests in this describe; binding each test's listener to its OWN mocks (not
    // the shared describe-level lets, which getService would read lazily at fire
    // time) keeps the per-test call counts correct.
    const client = { disconnect: jest.fn().mockResolvedValue(undefined) };
    const cm = { connect: jest.fn().mockResolvedValue(undefined), disconnect: jest.fn().mockResolvedValue(undefined) };
    mockClient = client;
    mockConnectionManager = cm;
    lifecycleApp = {
      networkedSession: {
        getService: jest.fn((name) =>
          name === 'client' ? client
            : name === 'connectionManager' ? cm
            : null)
      }
    };
    setupCleanupHandlers(lifecycleApp);
  });

  it('closes the socket via ConnectionManager.disconnect when hidden (clears reconnect timer + frees deviceId)', () => {
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    // cm.disconnect() (not client.disconnect()) so a pending reconnect timer is
    // cancelled — else it would fire while backgrounded and defeat BFCache (RL-2).
    expect(mockConnectionManager.disconnect).toHaveBeenCalledTimes(1);
  });

  it('reconnects via ConnectionManager when the page becomes visible again', () => {
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(mockConnectionManager.connect).toHaveBeenCalledTimes(1);
  });

  it('closes the socket on pagehide (BFCache-friendly replacement for beforeunload)', () => {
    window.dispatchEvent(new Event('pagehide'));
    expect(mockConnectionManager.disconnect).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no active networked session', () => {
    const standaloneApp = { networkedSession: null };
    setupCleanupHandlers(standaloneApp);
    setVisibility('hidden');
    expect(() => document.dispatchEvent(new Event('visibilitychange'))).not.toThrow();
  });

  it('pauses NFC on background via the app hook (NFC-3 wiring, end-to-end)', () => {
    // Guards the closeSocket -> app.pauseNFCForBackground() wiring, which the
    // other tests' NFC-less mocks would let pass even if the hook were deleted.
    const pauseNFC = jest.fn();
    const nfcApp = {
      pauseNFCForBackground: pauseNFC,
      resumeNFCForForeground: jest.fn(),
      networkedSession: null
    };
    setupCleanupHandlers(nfcApp);
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pauseNFC).toHaveBeenCalledTimes(1);
  });
});
