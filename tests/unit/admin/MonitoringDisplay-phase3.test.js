/**
 * MonitoringDisplay - Phase 3 Audio Routing Tests
 * Per-stream routing dropdowns (Video Audio, Spotify Music, Sound Effects)
 *
 * Tests:
 * - Rendering per-stream dropdowns from availableSinks
 * - Setting correct selected option from route state
 * - Updating dropdowns via audio:routing events
 * - Handling fallback display
 * - sync:full with Phase 3 environment.audio payload
 */

// Mock Debug BEFORE importing modules
jest.mock('../../../src/utils/debug.js', () => ({
  default: {
    log: jest.fn()
  },
  __esModule: true
}));

import { MonitoringDisplay } from '../../../src/admin/MonitoringDisplay.js';

describe('MonitoringDisplay - Phase 3 Audio Routing', () => {
  let display;
  let mockClient;

  const availableSinks = [
    { name: 'hdmi', label: 'HDMI' },
    { name: 'bluez_output.AA', label: 'BT Speaker 1' },
    { name: 'bluez_output.BB', label: 'BT Speaker 2' },
    { name: 'combine-bt', label: 'Both BT Speakers' }
  ];

  const defaultRoutes = {
    video: { sink: 'combine-bt', fallback: 'hdmi' },
    spotify: { sink: 'combine-bt', fallback: 'hdmi' },
    sound: { sink: 'combine-bt', fallback: 'hdmi' }
  };

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

    // Set up DOM with required elements
    document.body.innerHTML = `
      <div id="session-status-container"></div>
      <div id="audio-routing-dropdowns"></div>
      <div id="bt-warning" style="display:none;"></div>
    `;

    // Create the MonitoringDisplay instance
    display = new MonitoringDisplay(mockClient, {}, null);
  });

  afterEach(() => {
    display.destroy();
    document.body.innerHTML = '';
  });

  /**
   * Helper to dispatch a message:received event on the mock client
   */
  function dispatchMessage(type, payload) {
    mockClient.dispatchEvent(new CustomEvent('message:received', {
      detail: { type, payload }
    }));
  }

  /**
   * Helper to dispatch sync:full with Phase 3 audio data
   */
  function syncWithAudioRouting(routes = defaultRoutes, sinks = availableSinks) {
    dispatchMessage('sync:full', {
      session: null,
      environment: {
        audio: {
          routes,
          availableSinks: sinks
        }
      }
    });
  }

  // ============================================
  // RENDERING PER-STREAM DROPDOWNS
  // ============================================

  describe('per-stream dropdown rendering', () => {
    it('should render per-stream routing dropdowns from sync:full', () => {
      syncWithAudioRouting();

      const videoDropdown = document.querySelector('[data-stream="video"]');
      const spotifyDropdown = document.querySelector('[data-stream="spotify"]');
      const soundDropdown = document.querySelector('[data-stream="sound"]');

      expect(videoDropdown).toBeTruthy();
      expect(spotifyDropdown).toBeTruthy();
      expect(soundDropdown).toBeTruthy();
    });

    it('should populate dropdowns with available sinks', () => {
      syncWithAudioRouting();

      const videoDropdown = document.querySelector('[data-stream="video"]');
      expect(videoDropdown).toBeTruthy();
      expect(videoDropdown.options.length).toBe(4);
    });

    it('should set correct option labels from availableSinks', () => {
      syncWithAudioRouting();

      const videoDropdown = document.querySelector('[data-stream="video"]');
      const labels = Array.from(videoDropdown.options).map(o => o.textContent);

      expect(labels).toContain('HDMI');
      expect(labels).toContain('BT Speaker 1');
      expect(labels).toContain('BT Speaker 2');
      expect(labels).toContain('Both BT Speakers');
    });

    it('should set correct option values from availableSinks', () => {
      syncWithAudioRouting();

      const videoDropdown = document.querySelector('[data-stream="video"]');
      const values = Array.from(videoDropdown.options).map(o => o.value);

      expect(values).toContain('hdmi');
      expect(values).toContain('bluez_output.AA');
      expect(values).toContain('bluez_output.BB');
      expect(values).toContain('combine-bt');
    });

    it('should select the current sink for each stream', () => {
      syncWithAudioRouting({
        video: { sink: 'hdmi', fallback: 'hdmi' },
        spotify: { sink: 'bluez_output.AA', fallback: 'hdmi' },
        sound: { sink: 'combine-bt', fallback: 'hdmi' }
      });

      const videoDropdown = document.querySelector('[data-stream="video"]');
      const spotifyDropdown = document.querySelector('[data-stream="spotify"]');
      const soundDropdown = document.querySelector('[data-stream="sound"]');

      expect(videoDropdown.value).toBe('hdmi');
      expect(spotifyDropdown.value).toBe('bluez_output.AA');
      expect(soundDropdown.value).toBe('combine-bt');
    });

    it('should use data-action="admin.setAudioRoute" on dropdowns', () => {
      syncWithAudioRouting();

      const dropdowns = document.querySelectorAll('[data-stream]');
      dropdowns.forEach(dropdown => {
        expect(dropdown.dataset.action).toBe('admin.setAudioRoute');
      });
    });

    it('should render stream labels for each dropdown', () => {
      syncWithAudioRouting();

      const container = document.getElementById('audio-routing-dropdowns');
      expect(container.textContent).toContain('Video Audio');
      expect(container.textContent).toContain('Spotify Music');
      expect(container.textContent).toContain('Sound Effects');
    });
  });

  // ============================================
  // UPDATING DROPDOWNS FROM audio:routing EVENTS
  // ============================================

  describe('audio:routing event updates dropdown selection', () => {
    beforeEach(() => {
      // First render the dropdowns via sync:full
      syncWithAudioRouting();
    });

    it('should update video dropdown when audio:routing event received', () => {
      dispatchMessage('audio:routing', {
        stream: 'video',
        sink: 'bluez_output.AA'
      });

      const videoDropdown = document.querySelector('[data-stream="video"]');
      expect(videoDropdown.value).toBe('bluez_output.AA');
    });

    it('should update spotify dropdown when audio:routing event received', () => {
      dispatchMessage('audio:routing', {
        stream: 'spotify',
        sink: 'hdmi'
      });

      const spotifyDropdown = document.querySelector('[data-stream="spotify"]');
      expect(spotifyDropdown.value).toBe('hdmi');
    });

    it('should update sound dropdown when audio:routing event received', () => {
      dispatchMessage('audio:routing', {
        stream: 'sound',
        sink: 'bluez_output.BB'
      });

      const soundDropdown = document.querySelector('[data-stream="sound"]');
      expect(soundDropdown.value).toBe('bluez_output.BB');
    });

    it('should not throw when stream dropdown does not exist', () => {
      expect(() => {
        dispatchMessage('audio:routing', {
          stream: 'nonexistent',
          sink: 'hdmi'
        });
      }).not.toThrow();
    });

    it('should hide fallback warning when routing succeeds', () => {
      const btWarning = document.getElementById('bt-warning');
      btWarning.style.display = 'block';

      dispatchMessage('audio:routing', {
        stream: 'video',
        sink: 'combine-bt'
      });

      expect(btWarning.style.display).toBe('none');
    });
  });

  // ============================================
  // FALLBACK HANDLING
  // ============================================

  describe('audio:routing:fallback with dropdowns', () => {
    beforeEach(() => {
      syncWithAudioRouting();
    });

    it('should show fallback warning', () => {
      dispatchMessage('audio:routing:fallback', {
        stream: 'video',
        reason: 'Bluetooth speaker disconnected',
        sink: 'hdmi'
      });

      const btWarning = document.getElementById('bt-warning');
      expect(btWarning.style.display).toBe('block');
      expect(btWarning.textContent).toContain('Bluetooth speaker disconnected');
    });

    it('should update the affected stream dropdown to fallback sink', () => {
      dispatchMessage('audio:routing:fallback', {
        stream: 'video',
        reason: 'Speaker lost',
        sink: 'hdmi'
      });

      const videoDropdown = document.querySelector('[data-stream="video"]');
      expect(videoDropdown.value).toBe('hdmi');
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('edge cases', () => {
    it('should handle sync:full without environment field', () => {
      expect(() => {
        dispatchMessage('sync:full', {
          session: null
        });
      }).not.toThrow();
    });

    it('should handle sync:full with empty audio data', () => {
      expect(() => {
        dispatchMessage('sync:full', {
          session: null,
          environment: {
            audio: {}
          }
        });
      }).not.toThrow();
    });

    it('should handle sync:full with no availableSinks', () => {
      expect(() => {
        syncWithAudioRouting(defaultRoutes, []);
      }).not.toThrow();

      // Dropdowns should exist but have no options
      const videoDropdown = document.querySelector('[data-stream="video"]');
      expect(videoDropdown).toBeTruthy();
      expect(videoDropdown.options.length).toBe(0);
    });

    it('should handle null payload for audio:routing', () => {
      expect(() => {
        dispatchMessage('audio:routing', null);
      }).not.toThrow();
    });

    it('should handle null payload for audio:routing:fallback', () => {
      expect(() => {
        dispatchMessage('audio:routing:fallback', null);
      }).not.toThrow();
    });

    it('should not throw when audio-routing-dropdowns container missing', () => {
      document.getElementById('audio-routing-dropdowns').remove();

      expect(() => {
        syncWithAudioRouting();
      }).not.toThrow();
    });

    it('should update dropdowns on subsequent sync:full events', () => {
      // First sync with combine-bt selected
      syncWithAudioRouting();

      let videoDropdown = document.querySelector('[data-stream="video"]');
      expect(videoDropdown.value).toBe('combine-bt');

      // Second sync with hdmi selected
      syncWithAudioRouting({
        video: { sink: 'hdmi', fallback: 'hdmi' },
        spotify: { sink: 'hdmi', fallback: 'hdmi' },
        sound: { sink: 'hdmi', fallback: 'hdmi' }
      });

      videoDropdown = document.querySelector('[data-stream="video"]');
      expect(videoDropdown.value).toBe('hdmi');
    });

    it('should handle sink value not in availableSinks gracefully', () => {
      // Route points to a sink not in the available list
      expect(() => {
        syncWithAudioRouting({
          video: { sink: 'nonexistent_sink', fallback: 'hdmi' },
          spotify: { sink: 'combine-bt', fallback: 'hdmi' },
          sound: { sink: 'combine-bt', fallback: 'hdmi' }
        });
      }).not.toThrow();
    });
  });

  // ============================================
  // BACKWARD COMPATIBILITY
  // ============================================

  describe('backward compatibility with Phase 0 radio buttons', () => {
    it('should still handle sync:full with Phase 0 audio format (no availableSinks)', () => {
      // Phase 0 format: just routes.video.sink without availableSinks
      expect(() => {
        dispatchMessage('sync:full', {
          session: null,
          environment: {
            audio: {
              routes: {
                video: { sink: 'bluetooth' }
              }
            }
          }
        });
      }).not.toThrow();
    });
  });
});
