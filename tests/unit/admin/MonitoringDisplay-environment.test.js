/**
 * MonitoringDisplay Environment Tests
 *
 * Tests that MonitoringDisplay correctly wires store subscriptions to
 * environment renderers. Environment state flows through:
 * service:state → StateStore → MonitoringDisplay store subscriptions → Renderers
 */

// Mock Debug BEFORE importing modules
jest.mock('../../../src/utils/debug.js', () => ({
  default: {
    log: jest.fn()
  },
  __esModule: true
}));

import { MonitoringDisplay } from '../../../src/admin/MonitoringDisplay.js';
import { StateStore } from '../../../src/core/stateStore.js';

describe('MonitoringDisplay - Environment', () => {
  let display;
  let mockClient;
  let store;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock client that acts as an EventTarget
    mockClient = new EventTarget();
    mockClient.isConnected = true;
    mockClient.socket = { connected: true, emit: jest.fn() };
    mockClient.config = { url: 'http://localhost:3000' };

    // Real StateStore
    store = new StateStore();

    // Create the MonitoringDisplay instance
    display = new MonitoringDisplay(mockClient, store, null);
  });

  afterEach(() => {
    if (display) {
      display.destroy();
    }
    document.body.innerHTML = '';
  });

  describe('store subscription wiring', () => {
    it('should route lighting store updates to envRenderer.renderLighting', () => {
      const renderSpy = jest.spyOn(display.envRenderer, 'renderLighting');

      store.update('lighting', { connected: true, activeScene: null, scenes: [] });

      expect(renderSpy).toHaveBeenCalled();
    });

    it('should route audio store updates to envRenderer.renderAudio', () => {
      const renderSpy = jest.spyOn(display.envRenderer, 'renderAudio');

      store.update('audio', { routes: {}, availableSinks: [], ducking: {} });

      expect(renderSpy).toHaveBeenCalled();
    });

    it('should route bluetooth store updates to envRenderer.renderBluetooth', () => {
      const renderSpy = jest.spyOn(display.envRenderer, 'renderBluetooth');

      store.update('bluetooth', { scanning: false, pairedDevices: [] });

      expect(renderSpy).toHaveBeenCalled();
    });
  });

  describe('updateAllDisplays - no duplicate environment renders', () => {
    beforeEach(() => {
      jest.clearAllMocks();
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
      expect(display._updateEnvironmentFromSync).toBeUndefined();
    });

    it('should NOT have _wireDataManagerEvents method anymore', () => {
      expect(display._wireDataManagerEvents).toBeUndefined();
    });
  });
});
