/**
 * Unit tests for ConnectionWizard
 * Tests auto-assignment of station names with device ID collision prevention
 */

import { ConnectionWizard } from '../../../src/ui/connectionWizard.js';

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
          { deviceId: 'GM_Station_1', type: 'gm' },
          { deviceId: 'GM_Station_2', type: 'gm' }
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

    test('should filter out non-GM devices', async () => {
      const mockState = {
        devices: [
          { deviceId: 'GM_Station_1', type: 'gm' },
          { deviceId: 'player_1', type: 'player' },
          { deviceId: 'esp32_001', type: 'esp32' }
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
  });
});
