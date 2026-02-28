import { MonitoringDisplay } from '../../../src/admin/MonitoringDisplay.js';
import { cueStateFromSync } from './helpers/cueTestUtils.js';

describe('MonitoringDisplay - Phase 2', () => {
  let display, mockClient, mockDataManager, container;

  beforeEach(() => {
    // Setup DOM with Phase 2 elements
    document.body.innerHTML = `
      <div id="session-status-container"></div>
      <div id="active-cues-list"></div>
      <div id="now-playing-section"></div>
      <div id="toast-container"></div>
    `;

    // Mock client (EventTarget)
    mockClient = new EventTarget();
    mockClient.socket = { connected: true, emit: jest.fn() };

    // Mock DataManager (real EventTarget for cue-state:updated wiring)
    mockDataManager = new EventTarget();

    // Create display instance
    display = new MonitoringDisplay(mockClient, mockDataManager);
    container = document.getElementById('session-status-container');
  });

  afterEach(() => {
    display.destroy();
    document.body.innerHTML = '';
  });

  describe('cue:status (compound cue progress)', () => {
    it('should render active compound cue in Active Cues list', () => {
      const cueEngine = {
        loaded: true,
        cues: [{ id: 'opening', label: 'Opening Sequence', quickFire: true }],
        activeCues: [{ cueId: 'opening', state: 'running', progress: 30, duration: 120 }]
      };

      mockDataManager.dispatchEvent(new CustomEvent('cue-state:updated', {
        detail: cueStateFromSync(cueEngine)
      }));

      const activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.textContent).toContain('Opening Sequence');
    });

    it('should update compound cue progress from cue:status event', () => {
      // First set up an active cue via DM event
      const cueEngine = {
        loaded: true,
        cues: [{ id: 'opening', label: 'Opening Sequence', quickFire: true }],
        activeCues: [{ cueId: 'opening', state: 'running', progress: 30, duration: 120 }]
      };
      mockDataManager.dispatchEvent(new CustomEvent('cue-state:updated', {
        detail: cueStateFromSync(cueEngine)
      }));

      // Then update it via DataManager cue-state:updated event
      mockDataManager.dispatchEvent(new CustomEvent('cue-state:updated', {
        detail: {
          cues: new Map([['opening', { id: 'opening', label: 'Opening Sequence', quickFire: true }]]),
          activeCues: new Map([['opening', { cueId: 'opening', state: 'running', progress: 0.45, duration: 120 }]]),
          disabledCues: new Set()
        }
      }));

      // Verify progress indicator updated
      const activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.textContent).toContain('45');
    });

    it('should remove compound cue when cue:completed received', () => {
      // First add an active cue via DM event
      const cueEngine = {
        loaded: true,
        cues: [{ id: 'opening', label: 'Opening Sequence', quickFire: true }],
        activeCues: [{ cueId: 'opening', state: 'running', progress: 30, duration: 120 }]
      };
      mockDataManager.dispatchEvent(new CustomEvent('cue-state:updated', {
        detail: cueStateFromSync(cueEngine)
      }));

      // Verify it's there
      let activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.textContent).toContain('Opening Sequence');

      // Then complete it via DataManager (cue removed from activeCues)
      mockDataManager.dispatchEvent(new CustomEvent('cue-state:updated', {
        detail: {
          cues: new Map([['opening', { id: 'opening', label: 'Opening Sequence', quickFire: true }]]),
          activeCues: new Map(), // Empty = cue completed/removed
          disabledCues: new Set()
        }
      }));

      // Verify it's removed
      activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.textContent).not.toContain('Opening Sequence');
    });

    it('should show pause/stop/resume buttons for active cues', () => {
      const cueEngine = {
        loaded: true,
        cues: [{ id: 'opening', label: 'Opening Sequence', quickFire: true }],
        activeCues: [{ cueId: 'opening', state: 'running', progress: 30, duration: 120 }]
      };

      mockDataManager.dispatchEvent(new CustomEvent('cue-state:updated', {
        detail: cueStateFromSync(cueEngine)
      }));

      const activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.querySelector('[data-action="admin.pauseCue"]')).toBeTruthy();
      expect(activeCuesList.querySelector('[data-action="admin.stopCue"]')).toBeTruthy();
    });

    it('should show resume button when cue is paused', () => {
      const cueEngine = {
        loaded: true,
        cues: [{ id: 'opening', label: 'Opening Sequence', quickFire: true }],
        activeCues: [{ cueId: 'opening', state: 'paused', progress: 30, duration: 120 }]
      };

      mockDataManager.dispatchEvent(new CustomEvent('cue-state:updated', {
        detail: cueStateFromSync(cueEngine)
      }));

      const activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.querySelector('[data-action="admin.resumeCue"]')).toBeTruthy();
      expect(activeCuesList.querySelector('[data-action="admin.pauseCue"]')).toBeFalsy();
    });
  });

  // cue:held toast tests removed — Phase 4 replaces toasts with HeldItemsRenderer
  // spotify:status tests moved to SpotifyRenderer.test.js
  // DM state management tested in UnifiedDataManager-spotify.test.js

  describe('video-state:updated wiring', () => {
    it('should route video-state:updated to videoRenderer.render', () => {
      const renderSpy = jest.spyOn(display.videoRenderer, 'render');
      const videoState = { nowPlaying: 'test.mp4', isPlaying: true, progress: 0.5 };

      mockDataManager.dispatchEvent(new CustomEvent('video-state:updated', {
        detail: videoState
      }));

      expect(renderSpy).toHaveBeenCalledWith(videoState);
    });
  });

  describe('Phase 4: HealthRenderer wiring', () => {
    it('should create healthRenderer instance', () => {
      expect(display.healthRenderer).toBeDefined();
    });

    it('should route service-health:updated to healthRenderer.render', () => {
      const renderSpy = jest.spyOn(display.healthRenderer, 'render');
      const healthData = { serviceHealth: { vlc: { status: 'down', message: 'Connection refused' } } };

      mockDataManager.dispatchEvent(new CustomEvent('service-health:updated', {
        detail: healthData
      }));

      expect(renderSpy).toHaveBeenCalledWith(healthData);
    });
  });

  describe('Phase 4: HeldItemsRenderer wiring', () => {
    it('should create heldItemsRenderer instance', () => {
      expect(display.heldItemsRenderer).toBeDefined();
    });

    it('should route held-items:updated to heldItemsRenderer.render', () => {
      const renderSpy = jest.spyOn(display.heldItemsRenderer, 'render');
      const heldData = { action: 'held', id: 'held-cue-1', type: 'cue', reason: 'video_busy' };

      mockDataManager.dispatchEvent(new CustomEvent('held-items:updated', {
        detail: heldData
      }));

      expect(renderSpy).toHaveBeenCalledWith(heldData);
    });
  });
});
