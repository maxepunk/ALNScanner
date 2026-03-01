import { MonitoringDisplay } from '../../../src/admin/MonitoringDisplay.js';
import { StateStore } from '../../../src/core/stateStore.js';

describe('MonitoringDisplay - Phase 2', () => {
  let display, mockClient, store, container;

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

    // Real StateStore
    store = new StateStore();

    // Create display instance
    display = new MonitoringDisplay(mockClient, store);
    container = document.getElementById('session-status-container');
  });

  afterEach(() => {
    display.destroy();
    document.body.innerHTML = '';
  });

  describe('cue:status (compound cue progress)', () => {
    it('should render active compound cue in Active Cues list', () => {
      store.update('cueengine', {
        loaded: true,
        cues: [{ id: 'opening', label: 'Opening Sequence', quickFire: true }],
        activeCues: [{ cueId: 'opening', state: 'running', progress: 30, duration: 120 }]
      });

      const activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.textContent).toContain('Opening Sequence');
    });

    it('should update compound cue progress from store update', () => {
      // First set up an active cue
      store.update('cueengine', {
        loaded: true,
        cues: [{ id: 'opening', label: 'Opening Sequence', quickFire: true }],
        activeCues: [{ cueId: 'opening', state: 'running', progress: 30, duration: 120 }]
      });

      // Then update progress via store (simulates service:state event)
      store.update('cueengine', {
        activeCues: [{ cueId: 'opening', state: 'running', progress: 0.45, duration: 120 }]
      });

      // Verify progress indicator updated
      const activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.textContent).toContain('45');
    });

    it('should remove compound cue when completed', () => {
      // First add an active cue
      store.update('cueengine', {
        loaded: true,
        cues: [{ id: 'opening', label: 'Opening Sequence', quickFire: true }],
        activeCues: [{ cueId: 'opening', state: 'running', progress: 30, duration: 120 }]
      });

      // Verify it's there
      let activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.textContent).toContain('Opening Sequence');

      // Then complete it (empty activeCues)
      store.update('cueengine', {
        activeCues: []
      });

      // Verify it's removed
      activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.textContent).not.toContain('Opening Sequence');
    });

    it('should show pause/stop/resume buttons for active cues', () => {
      store.update('cueengine', {
        loaded: true,
        cues: [{ id: 'opening', label: 'Opening Sequence', quickFire: true }],
        activeCues: [{ cueId: 'opening', state: 'running', progress: 30, duration: 120 }]
      });

      const activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.querySelector('[data-action="admin.pauseCue"]')).toBeTruthy();
      expect(activeCuesList.querySelector('[data-action="admin.stopCue"]')).toBeTruthy();
    });

    it('should show resume button when cue is paused', () => {
      store.update('cueengine', {
        loaded: true,
        cues: [{ id: 'opening', label: 'Opening Sequence', quickFire: true }],
        activeCues: [{ cueId: 'opening', state: 'paused', progress: 30, duration: 120 }]
      });

      const activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.querySelector('[data-action="admin.resumeCue"]')).toBeTruthy();
      expect(activeCuesList.querySelector('[data-action="admin.pauseCue"]')).toBeFalsy();
    });
  });

  describe('video-state:updated wiring via store', () => {
    it('should route video store update to videoRenderer.render', () => {
      const renderSpy = jest.spyOn(display.videoRenderer, 'render');
      const videoState = { nowPlaying: 'test.mp4', isPlaying: true, progress: 0.5 };

      store.update('video', videoState);

      expect(renderSpy).toHaveBeenCalled();
    });
  });

  describe('Phase 4: HealthRenderer wiring via store', () => {
    it('should create healthRenderer instance', () => {
      expect(display.healthRenderer).toBeDefined();
    });

    it('should route health store update to healthRenderer.render', () => {
      const renderSpy = jest.spyOn(display.healthRenderer, 'render');
      const healthData = { vlc: { status: 'down', message: 'Connection refused' } };

      store.update('health', healthData);

      expect(renderSpy).toHaveBeenCalled();
    });
  });

  describe('Phase 4: HeldItemsRenderer wiring via store', () => {
    it('should create heldItemsRenderer instance', () => {
      expect(display.heldItemsRenderer).toBeDefined();
    });

    it('should route held store update to heldItemsRenderer.renderSnapshot', () => {
      const renderSpy = jest.spyOn(display.heldItemsRenderer, 'renderSnapshot');
      const heldItems = [
        { id: 'held-1', type: 'cue', reason: 'video_busy', cueId: 'opening' }
      ];

      store.update('held', { items: heldItems });

      expect(renderSpy).toHaveBeenCalledWith(heldItems);
    });
  });
});
