/**
 * MonitoringDisplay Environment Tests
 *
 * Tests that MonitoringDisplay correctly handles environment state WITHOUT
 * duplicate rendering. Environment rendering is now handled by:
 * NetworkedSession → DataManager.updateXXXState() → event → MonitoringDisplay renderer
 *
 * MonitoringDisplay's updateAllDisplays() should NOT duplicate these renders.
 *
 * NOTE: Individual environment event handler tests (bluetooth:device, lighting:status, etc.)
 * were removed as those handlers no longer exist in MonitoringDisplay. They've been moved
 * to NetworkedSession/DataManager event flow.
 */

// Mock Debug BEFORE importing modules
jest.mock('../../../src/utils/debug.js', () => ({
  default: {
    log: jest.fn()
  },
  __esModule: true
}));

import { MonitoringDisplay } from '../../../src/admin/MonitoringDisplay.js';

describe('MonitoringDisplay - Environment', () => {
  let display;
  let mockClient;
  let mockDataManager;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock client that acts as an EventTarget
    mockClient = new EventTarget();
    mockClient.isConnected = true;
    mockClient.socket = { connected: true, emit: jest.fn() };
    mockClient.config = { url: 'http://localhost:3000' };

    // Mock fetch for loadAvailableVideos
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ tokens: {} })
      })
    );

    // Mock DataManager with required EventTarget methods
    mockDataManager = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      updateAudioState: jest.fn()
    };

    // Create the MonitoringDisplay instance
    display = new MonitoringDisplay(mockClient, mockDataManager, null);
  });

  afterEach(() => {
    if (display) {
      display.destroy();
    }
    document.body.innerHTML = '';
  });

  // ============================================
  // updateAllDisplays - no duplicate environment renders (Task 6)
  // ============================================

  describe('updateAllDisplays - no duplicate environment renders', () => {
    // RATIONALE: NetworkedSession already calls dataManager.updateAudioState,
    // updateLightingState, updateBluetoothState when handling sync:full.
    // These methods trigger events that MonitoringDisplay listens to via
    // _wireDataManagerEvents. updateAllDisplays should NOT duplicate these
    // calls or directly call renderers — that causes double renders.

    beforeEach(() => {
      // Clear mock call history from parent beforeEach
      jest.clearAllMocks();
    });

    it('should NOT call dataManager.updateAudioState from updateAllDisplays', () => {
      // NetworkedSession already calls this — updateAllDisplays should not duplicate
      display.updateAllDisplays({
        session: { id: 's1', status: 'active', name: 'Test' },
        environment: {
          audio: { routes: { video: { sink: 'hdmi' } }, availableSinks: [] },
          lighting: { connected: true, activeScene: null, scenes: [] },
          bluetooth: { scanning: false, pairedDevices: [] }
        }
      });

      expect(mockDataManager.updateAudioState).not.toHaveBeenCalled();
    });

    it('should NOT call envRenderer.renderLighting directly from updateAllDisplays', () => {
      const renderSpy = jest.spyOn(display.envRenderer, 'renderLighting');

      display.updateAllDisplays({
        session: null,
        environment: {
          lighting: { connected: true, activeScene: null, scenes: [] }
        }
      });

      expect(renderSpy).not.toHaveBeenCalled();
    });

    it('should NOT call envRenderer.renderBluetooth directly from updateAllDisplays', () => {
      const renderSpy = jest.spyOn(display.envRenderer, 'renderBluetooth');

      display.updateAllDisplays({
        session: null,
        environment: {
          bluetooth: { scanning: false, pairedDevices: [] }
        }
      });

      expect(renderSpy).not.toHaveBeenCalled();
    });

    it('should NOT have _updateEnvironmentFromSync method anymore', () => {
      // Method was deleted as it's no longer needed - NetworkedSession handles this
      expect(display._updateEnvironmentFromSync).toBeUndefined();
    });
  });
});
