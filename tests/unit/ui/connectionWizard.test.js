/**
 * Unit tests for ConnectionWizard
 * Tests auto-assignment of station names with device ID collision prevention
 *
 * Served over https to match the real GM scanner (NFC requires HTTPS), so
 * window.location.protocol === 'https:' — needed to exercise _normalizeUrl's
 * page-protocol branch (jsdom's location is otherwise non-configurable).
 * @jest-environment-options {"url": "https://localhost:3000/"}
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
        <button id="scanServersBtn"></button>
      </form>
      <div id="connectionModal"></div>
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

  describe('_normalizeUrl()', () => {
    test('leaves a fully-qualified URL untouched', () => {
      expect(wizard._normalizeUrl('https://10.0.0.5:3000')).toBe('https://10.0.0.5:3000');
      expect(wizard._normalizeUrl('http://10.0.0.5:3000')).toBe('http://10.0.0.5:3000');
    });

    test('prepends the page protocol for a bare host:port (HTTPS page)', () => {
      // This file's jsdom env is served over https (see @jest-environment-options),
      // so a bare host:port must become https:// — not the old hardcoded http://.
      expect(window.location.protocol).toBe('https:'); // sanity: env is https
      expect(wizard._normalizeUrl('10.0.0.5:3000')).toBe('https://10.0.0.5:3000');
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

    test('should NOT assign a guessable ID when /api/state is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      Storage.prototype.getItem.mockReturnValue('5'); // stale counter must be ignored

      await wizard.assignStationName('http://localhost:3000');

      const display = document.getElementById('stationNameDisplay');
      // No colliding fallback ID — display/dataset cleared so submit is blocked
      expect(display.dataset.deviceId).toBe('');
      expect(display.textContent).not.toMatch(/GM_Station_\d+/);

      const statusDiv = document.getElementById('connectionStatusMsg');
      expect(statusDiv.textContent).toContain('reach the orchestrator');
    });

    test('blocks submission when /api/state was unreachable (no deviceId assigned)', async () => {
      // First-time assignment fails → no deviceId on the display
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await wizard.assignStationName('http://localhost:3000');

      document.getElementById('serverUrl').value = 'http://localhost:3000';
      document.getElementById('gmPassword').value = 'admin';
      mockFetch.mockClear();

      const event = new Event('submit');
      event.preventDefault = jest.fn();
      await wizard.handleConnectionSubmit(event);

      // No deviceId → submit guard fires, no auth attempt made
      expect(mockFetch).not.toHaveBeenCalled();
      expect(document.getElementById('connectionStatusMsg').textContent)
        .toContain('Please fill in all fields');
    });

    // CC-8b consumer guard: with connectionStatus now present in /api/state
    // (backend exposes it via the syncHelpers device map), the wizard must count
    // only CONNECTED GMs when assigning the next station id. The disconnected GM
    // sits at the SEQUENTIAL id GM_Station_2 ON PURPOSE so this guard is
    // discriminating: the gap-fill (connectionWizard.js _findNextStationId) walks
    // up from 1, so connected={1} → GM_Station_2 (the disconnected slot is free to
    // reuse), but if the consumer stopped filtering on connectionStatus it would
    // see {1,2} → GM_Station_3. Asserting GM_Station_2 therefore FAILS if the
    // connectionStatus filter is removed (verified). A disconnected GM at a
    // gap-creating id like _5 would NOT distinguish (both yield _2) — a phantom.
    test('should filter out non-GM devices and disconnected GMs', async () => {
      const mockState = {
        devices: [
          { deviceId: 'GM_Station_1', type: 'gm', connectionStatus: 'connected' },
          { deviceId: 'GM_Station_2', type: 'gm', connectionStatus: 'disconnected' },
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
      // GM_Station_2 (disconnected) is the freed slot the filter reuses;
      // without the connectionStatus filter this would be GM_Station_3.
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

  describe('displayDiscoveredServers() (AUTH-6/HTTP-7)', () => {
    test('does not allow a quote in the url to break out of the data-arg attribute', () => {
      const evil = 'http://10.0.0.5:3000/"><img src=x onerror=alert(1)>';
      wizard.displayDiscoveredServers([{ url: evil }]);

      const btn = document.querySelector('#discoveredServers button[data-action="connectionWizard.selectServer"]');
      expect(btn).not.toBeNull();
      // The exact url survives intact in the attribute (escaped by the DOM API, not interpolated)
      expect(btn.getAttribute('data-arg')).toBe(evil);
      // No injected <img> element may exist
      expect(document.querySelector('#discoveredServers img')).toBeNull();
    });

    test('renders the url text and never consults the dead server.ip field', () => {
      // Pass BOTH ip and url with differing values: the rendered text must use
      // url (proving the dropped `server.ip ||` branch is truly gone).
      wizard.displayDiscoveredServers([{ ip: '10.0.0.99-SHOULD-NOT-APPEAR', url: 'http://10.0.0.7:3000' }]);
      const span = document.querySelector('#discoveredServers .server-item span');
      expect(span.textContent).toContain('http://10.0.0.7:3000');
      expect(span.textContent).not.toContain('SHOULD-NOT-APPEAR');
    });
  });

  describe('auto-scan gating (HTTP-6)', () => {
    test('does NOT auto-scan when a saved orchestrator URL exists', () => {
      jest.useFakeTimers();
      Storage.prototype.getItem.mockImplementation((k) =>
        k === 'aln_orchestrator_url' ? 'http://10.0.0.9:3000' : null);
      const scanSpy = jest.spyOn(wizard, 'scanForServers').mockResolvedValue();

      wizard.showConnectionWizard();
      jest.advanceTimersByTime(200);

      expect(scanSpy).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    test('still auto-scans when no saved orchestrator URL exists', () => {
      jest.useFakeTimers();
      Storage.prototype.getItem.mockReturnValue(null);
      const scanSpy = jest.spyOn(wizard, 'scanForServers').mockResolvedValue();

      wizard.showConnectionWizard();
      jest.advanceTimersByTime(200);

      expect(scanSpy).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('scan concurrency cap (HTTP-6)', () => {
    test('never has more than the batch size of probes in flight at once', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      mockFetch.mockImplementation(() => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise((resolve) => setTimeout(() => {
          inFlight--;
          resolve({ ok: false });
        }, 0));
      });
      Storage.prototype.getItem.mockReturnValue(null);

      await wizard.scanForServers();

      // Pinned to the batch size (32): catches both the pre-fix unbounded ~509
      // AND a regression that doubled the batch size.
      expect(maxInFlight).toBeLessThanOrEqual(32);
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

    test('should clear the password field after a successful auth (AUTH-3)', async () => {
      const display = document.getElementById('stationNameDisplay');
      display.dataset.deviceId = 'GM_Station_1';
      document.getElementById('serverUrl').value = 'http://localhost:3000';
      document.getElementById('gmPassword').value = 'super-secret';

      mockFetch
        .mockResolvedValueOnce({ ok: true }) // health
        .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'jwt' }) }); // auth

      const event = new Event('submit');
      event.preventDefault = jest.fn();
      await wizard.handleConnectionSubmit(event);

      expect(document.getElementById('gmPassword').value).toBe('');
    });

    test('should clear the password field even when auth fails (AUTH-3)', async () => {
      const display = document.getElementById('stationNameDisplay');
      display.dataset.deviceId = 'GM_Station_1';
      document.getElementById('serverUrl').value = 'http://localhost:3000';
      document.getElementById('gmPassword').value = 'super-secret';

      mockFetch
        .mockResolvedValueOnce({ ok: true }) // health
        .mockResolvedValueOnce({ ok: false }); // auth rejected

      const event = new Event('submit');
      event.preventDefault = jest.fn();
      await wizard.handleConnectionSubmit(event);

      expect(document.getElementById('gmPassword').value).toBe('');
    });

    test('should surface a clear error when auth body is not JSON (AUTH-4/HTTP-2)', async () => {
      const display = document.getElementById('stationNameDisplay');
      display.dataset.deviceId = 'GM_Station_1';
      document.getElementById('serverUrl').value = 'http://localhost:3000';
      document.getElementById('gmPassword').value = 'admin';

      mockFetch
        .mockResolvedValueOnce({ ok: true }) // health
        .mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('Unexpected token <'); } });

      const event = new Event('submit');
      event.preventDefault = jest.fn();
      await wizard.handleConnectionSubmit(event);

      const statusDiv = document.getElementById('connectionStatusMsg');
      expect(statusDiv.textContent).toContain('Invalid auth response');
      expect(Storage.prototype.setItem).not.toHaveBeenCalledWith('aln_auth_token', expect.anything());
      expect(mockApp.selectGameMode).not.toHaveBeenCalled();
    });

    test('should reject an auth body missing the token field (AUTH-4/HTTP-2)', async () => {
      const display = document.getElementById('stationNameDisplay');
      display.dataset.deviceId = 'GM_Station_1';
      document.getElementById('serverUrl').value = 'http://localhost:3000';
      document.getElementById('gmPassword').value = 'admin';

      mockFetch
        .mockResolvedValueOnce({ ok: true }) // health
        .mockResolvedValueOnce({ ok: true, json: async () => ({ expiresIn: 86400 }) }); // no token

      const event = new Event('submit');
      event.preventDefault = jest.fn();
      await wizard.handleConnectionSubmit(event);

      const statusDiv = document.getElementById('connectionStatusMsg');
      expect(statusDiv.textContent).toContain('Invalid auth response');
      expect(Storage.prototype.setItem).not.toHaveBeenCalledWith('aln_auth_token', expect.anything());
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
      // AUTH-3: the typed secret must be cleared even on this validation
      // early-return (deviceId empty when /api/state was unreachable).
      expect(document.getElementById('gmPassword').value).toBe('');
    });

    // AbortSignal.timeout() rejects with a TimeoutError DOMException in spec
    // browsers (Chrome/Edge — the production runtime); undici/Node may surface
    // AbortError. Both must produce the timeout-specific operator message.
    test.each([['TimeoutError'], ['AbortError']])(
      'shows a timeout-specific message when the auth POST aborts with %s',
      async (errorName) => {
        const display = document.getElementById('stationNameDisplay');
        display.textContent = 'GM_Station_1';
        display.dataset.deviceId = 'GM_Station_1';

        document.getElementById('serverUrl').value = 'http://localhost:3000';
        document.getElementById('gmPassword').value = 'admin';

        mockFetch
          .mockResolvedValueOnce({ ok: true }) // health check passes
          .mockRejectedValueOnce(
            Object.assign(new Error('The operation was aborted due to timeout'), { name: errorName })
          ); // auth POST times out

        const event = new Event('submit');
        event.preventDefault = jest.fn();

        await wizard.handleConnectionSubmit(event);

        const statusDiv = document.getElementById('connectionStatusMsg');
        expect(statusDiv.textContent).toContain('timed out');
        // must NOT proceed to networked init on a timeout
        expect(mockApp.selectGameMode).not.toHaveBeenCalled();
      }
    );

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
        // services property: null-safe property path used by lifecycle handlers
        // (getService() throws when services===null — see BFCACHE fix in connectionWizard.js)
        services: { connectionManager: cm, client: client },
        // keep getService so any assertions that still test it continue to work
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

  // BFCACHE fix: getService() throws 'Session not initialized' when services===null.
  // This occurs in two real windows: INIT (networkedSession assigned, services not yet
  // populated by initialize()) and DESTROY (destroy() sets services=null before app
  // nulls networkedSession). The lifecycle handlers must NOT throw in these windows —
  // they should no-op silently so that BFCache eligibility and NFC hooks still work.
  it('does not throw during the init/destroy window (visibilitychange) when networkedSession.services is null', () => {
    const pauseNFC = jest.fn();
    const resumeNFC = jest.fn();
    // Simulate init/destroy window: networkedSession is a live object, services=null,
    // getService() throws synchronously (as the real implementation does).
    const initWindowApp = {
      pauseNFCForBackground: pauseNFC,
      resumeNFCForForeground: resumeNFC,
      networkedSession: {
        services: null,
        getService: jest.fn(() => { throw new Error('Session not initialized'); })
      }
    };
    setupCleanupHandlers(initWindowApp);
    setVisibility('hidden');
    // jsdom propagates a synchronous listener throw out of dispatchEvent — so this
    // assertion is a deterministic fail if closeSocket calls getService().
    expect(() => document.dispatchEvent(new Event('visibilitychange'))).not.toThrow();
    // NFC hook must still fire even when cm lookup is a no-op
    expect(pauseNFC).toHaveBeenCalledTimes(1);
  });

  it('does not throw during the init/destroy window (pagehide) when networkedSession.services is null', () => {
    const pauseNFC = jest.fn();
    const initWindowApp = {
      pauseNFCForBackground: pauseNFC,
      resumeNFCForForeground: jest.fn(),
      networkedSession: {
        services: null,
        getService: jest.fn(() => { throw new Error('Session not initialized'); })
      }
    };
    setupCleanupHandlers(initWindowApp);
    // pagehide fires closeSocket — must not throw even with services=null
    expect(() => window.dispatchEvent(new Event('pagehide'))).not.toThrow();
    // NFC hook must still fire
    expect(pauseNFC).toHaveBeenCalledTimes(1);
  });
});
