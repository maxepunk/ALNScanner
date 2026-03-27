/**
 * MonitoringDisplay - Phase 3 Audio Routing Tests
 * Per-stream routing dropdowns (Video Audio, Spotify Music, Sound Effects)
 *
 * Tests:
 * - Rendering per-stream dropdowns from store audio state
 * - Setting correct selected option from route state
 * - Updating dropdowns via store audio updates
 * - Handling edge cases
 * - Ducking indicator forwarding
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

describe('MonitoringDisplay - Phase 3 Audio Routing', () => {
  let display;
  let mockClient;
  let store;

  const availableSinks = [
    { name: 'hdmi', label: 'HDMI' },
    { name: 'bluez_output.AA', label: 'BT Speaker 1' },
    { name: 'bluez_output.BB', label: 'BT Speaker 2' },
    { name: 'combine-bt', label: 'Both BT Speakers' }
  ];

  const defaultRoutes = {
    video: 'combine-bt',
    spotify: 'combine-bt',
    sound: 'combine-bt'
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock client that acts as an EventTarget
    mockClient = new EventTarget();
    mockClient.isConnected = true;
    mockClient.socket = { connected: true, emit: jest.fn() };
    mockClient.config = { url: 'http://localhost:3000' };

    // Set up DOM with required elements
    document.body.innerHTML = `
      <div id="session-status-container"></div>
      <div id="audio-routing-dropdowns"></div>
      <div id="bt-warning" style="display:none;"></div>
    `;

    // Real StateStore
    store = new StateStore();

    // Create the MonitoringDisplay instance
    display = new MonitoringDisplay(mockClient, store, null);
  });

  afterEach(() => {
    display.destroy();
    document.body.innerHTML = '';
  });

  /**
   * Helper to update audio state via store
   */
  function updateAudioState(routes = defaultRoutes, sinks = availableSinks) {
    store.update('audio', {
      routes,
      availableSinks: sinks,
      ducking: {}
    });
  }

  // ============================================
  // RENDERING PER-STREAM DROPDOWNS
  // ============================================

  describe('per-stream dropdown rendering', () => {
    it('should render per-stream routing dropdowns from store', () => {
      updateAudioState();

      const videoDropdown = document.querySelector('[data-stream="video"]');
      const spotifyDropdown = document.querySelector('[data-stream="spotify"]');
      const soundDropdown = document.querySelector('[data-stream="sound"]');

      expect(videoDropdown).toBeTruthy();
      expect(spotifyDropdown).toBeTruthy();
      expect(soundDropdown).toBeTruthy();
    });

    it('should populate dropdowns with available sinks', () => {
      updateAudioState();

      const videoDropdown = document.querySelector('[data-stream="video"]');
      expect(videoDropdown).toBeTruthy();
      expect(videoDropdown.options.length).toBe(4);
    });

    it('should set correct option labels from availableSinks', () => {
      updateAudioState();

      const videoDropdown = document.querySelector('[data-stream="video"]');
      const labels = Array.from(videoDropdown.options).map(o => o.textContent);

      expect(labels).toContain('HDMI');
      expect(labels).toContain('BT Speaker 1');
      expect(labels).toContain('BT Speaker 2');
      expect(labels).toContain('Both BT Speakers');
    });

    it('should set correct option values from availableSinks', () => {
      updateAudioState();

      const videoDropdown = document.querySelector('[data-stream="video"]');
      const values = Array.from(videoDropdown.options).map(o => o.value);

      expect(values).toContain('hdmi');
      expect(values).toContain('bluez_output.AA');
      expect(values).toContain('bluez_output.BB');
      expect(values).toContain('combine-bt');
    });

    it('should select the current sink for each stream', () => {
      updateAudioState({
        video: 'hdmi',
        spotify: 'bluez_output.AA',
        sound: 'combine-bt'
      });

      const videoDropdown = document.querySelector('[data-stream="video"]');
      const spotifyDropdown = document.querySelector('[data-stream="spotify"]');
      const soundDropdown = document.querySelector('[data-stream="sound"]');

      expect(videoDropdown.value).toBe('hdmi');
      expect(spotifyDropdown.value).toBe('bluez_output.AA');
      expect(soundDropdown.value).toBe('combine-bt');
    });

    it('should use data-action="admin.setAudioRoute" on dropdowns', () => {
      updateAudioState();

      const dropdowns = document.querySelectorAll('select[data-stream]');
      dropdowns.forEach(dropdown => {
        expect(dropdown.dataset.action).toBe('admin.setAudioRoute');
      });
    });

    it('should render stream labels for each dropdown', () => {
      updateAudioState();

      const container = document.getElementById('audio-routing-dropdowns');
      expect(container.textContent).toContain('Video Audio');
      expect(container.textContent).toContain('Spotify Music');
      expect(container.textContent).toContain('Sound Effects');
    });
  });

  // ============================================
  // UPDATING DROPDOWNS FROM STORE UPDATES
  // ============================================

  describe('audio store updates change dropdown selection', () => {
    beforeEach(() => {
      // First render the dropdowns
      updateAudioState();
    });

    it('should update video dropdown when audio store updated', () => {
      store.update('audio', { routes: { video: 'bluez_output.AA' } });

      const videoDropdown = document.querySelector('[data-stream="video"]');
      expect(videoDropdown.value).toBe('bluez_output.AA');
    });

    it('should update spotify dropdown when audio store updated', () => {
      store.update('audio', { routes: { spotify: 'hdmi' } });

      const spotifyDropdown = document.querySelector('[data-stream="spotify"]');
      expect(spotifyDropdown.value).toBe('hdmi');
    });

    it('should update sound dropdown when audio store updated', () => {
      store.update('audio', { routes: { sound: 'bluez_output.BB' } });

      const soundDropdown = document.querySelector('[data-stream="sound"]');
      expect(soundDropdown.value).toBe('bluez_output.BB');
    });

    it('should not throw when stream dropdown does not exist', () => {
      expect(() => {
        store.update('audio', { routes: { nonexistent: 'hdmi' } });
      }).not.toThrow();
    });

    it('should hide fallback warning when routing succeeds', () => {
      const btWarning = document.getElementById('bt-warning');
      btWarning.style.display = 'block';

      store.update('audio', { routes: { video: 'combine-bt' } });

      expect(btWarning.style.display).toBe('none');
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('edge cases', () => {
    it('should handle sync:full without environment field', () => {
      expect(() => {
        mockClient.dispatchEvent(new CustomEvent('message:received', {
          detail: { type: 'sync:full', payload: { session: null } }
        }));
      }).not.toThrow();
    });

    it('should handle store update with no availableSinks', () => {
      expect(() => {
        updateAudioState(defaultRoutes, []);
      }).not.toThrow();

      // No dropdowns rendered when no sinks available
      const videoDropdown = document.querySelector('[data-stream="video"]');
      expect(videoDropdown).toBeFalsy();
    });

    it('should not throw when audio-routing-dropdowns container missing', () => {
      document.getElementById('audio-routing-dropdowns').remove();

      expect(() => {
        updateAudioState();
      }).not.toThrow();
    });

    it('should update dropdowns on subsequent store updates', () => {
      // First update with combine-bt selected
      updateAudioState();

      let videoDropdown = document.querySelector('[data-stream="video"]');
      expect(videoDropdown.value).toBe('combine-bt');

      // Second update with hdmi selected
      updateAudioState({
        video: 'hdmi',
        spotify: 'hdmi',
        sound: 'hdmi'
      });

      videoDropdown = document.querySelector('[data-stream="video"]');
      expect(videoDropdown.value).toBe('hdmi');
    });

    it('should handle sink value not in availableSinks gracefully', () => {
      expect(() => {
        updateAudioState({
          video: 'nonexistent_sink',
          spotify: 'combine-bt',
          sound: 'combine-bt'
        });
      }).not.toThrow();
    });
  });

  // ============================================
  // DUCKING FORWARDING
  // ============================================

  describe('ducking indicator wiring', () => {
    it('should transform backend ducking array to renderer shape', () => {
      const renderDuckingSpy = jest.spyOn(display.spotifyRenderer, 'renderDucking');

      store.update('audio', {
        routes: {},
        availableSinks: [],
        ducking: {
          spotify: ['video', 'sound']
        }
      });

      expect(renderDuckingSpy).toHaveBeenCalledWith({ ducked: true, activeSources: ['video', 'sound'] });
    });

    it('should call renderDucking with ducked:false when no spotify ducking sources', () => {
      const renderDuckingSpy = jest.spyOn(display.spotifyRenderer, 'renderDucking');

      store.update('audio', {
        routes: {},
        availableSinks: [],
        ducking: {}
      });

      expect(renderDuckingSpy).toHaveBeenCalledWith({ ducked: false, activeSources: [] });
    });

    it('should call renderDucking with ducked:false when spotify ducking is empty array', () => {
      const renderDuckingSpy = jest.spyOn(display.spotifyRenderer, 'renderDucking');

      store.update('audio', {
        routes: {},
        availableSinks: [],
        ducking: { spotify: [] }
      });

      expect(renderDuckingSpy).toHaveBeenCalledWith({ ducked: false, activeSources: [] });
    });
  });

  describe('backward compatibility with Phase 0 audio format', () => {
    it('should still handle sync:full with Phase 0 audio format (no availableSinks)', () => {
      expect(() => {
        mockClient.dispatchEvent(new CustomEvent('message:received', {
          detail: {
            type: 'sync:full',
            payload: {
              session: null,
              environment: {
                audio: {
                  routes: { video: 'bluetooth' }
                }
              }
            }
          }
        }));
      }).not.toThrow();
    });
  });
});
