import { MonitoringDisplay } from '../../../src/admin/MonitoringDisplay.js';
import { StateStore } from '../../../src/core/stateStore.js';

describe('MonitoringDisplay - Show Control', () => {
  let display, mockClient, store;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <div id="session-status-container"></div>
      <div id="quick-fire-grid"></div>
      <div id="standing-cues-list"></div>
    `;

    // Mock client (EventTarget)
    mockClient = new EventTarget();
    mockClient.socket = { connected: true, emit: jest.fn() };

    // Real StateStore
    store = new StateStore();

    // Create display instance
    display = new MonitoringDisplay(mockClient, store);
  });

  afterEach(() => {
    display.destroy();
    document.body.innerHTML = '';
  });

  describe('Quick Fire grid', () => {
    it('should render tiles for cues with quickFire: true', () => {
      store.update('cueengine', {
        loaded: true,
        cues: [
          { id: 'tension-hit', label: 'Tension Hit', icon: 'warning', quickFire: true, enabled: true },
          { id: 'business-sale', label: 'Business Deal', icon: 'dollar', quickFire: true, enabled: true },
          { id: 'standing-cue', label: 'Standing Cue', quickFire: false, triggerType: 'event', enabled: true }
        ]
      });

      const grid = document.getElementById('quick-fire-grid');
      const tiles = grid.querySelectorAll('[data-action="admin.fireCue"]');

      expect(tiles.length).toBe(2); // Only quickFire cues
      expect(tiles[0].dataset.cueId).toBe('tension-hit');
      expect(tiles[1].dataset.cueId).toBe('business-sale');
    });

    it('should show "No Quick Fire cues" message when grid is empty', () => {
      store.update('cueengine', {
        loaded: true,
        cues: [
          { id: 'standing-only', label: 'Standing Only', quickFire: false, triggerType: 'event' }
        ]
      });

      const grid = document.getElementById('quick-fire-grid');
      expect(grid.textContent).toContain('No Quick Fire cues');
    });

    it('should not render anything when cueEngine is not loaded', () => {
      store.update('cueengine', {
        loaded: false,
        cues: []
      });

      const grid = document.getElementById('quick-fire-grid');
      // Empty cues map -> "No Quick Fire cues" message
      expect(grid.textContent).toContain('No Quick Fire cues');
    });
  });

  describe('Standing Cues list', () => {
    it('should render standing cues with enable/disable toggles', () => {
      store.update('cueengine', {
        loaded: true,
        cues: [
          { id: 'tech-discovered', label: 'Tech Discovered', triggerType: 'event', enabled: true },
          { id: 'group-complete', label: 'Group Complete', triggerType: 'event', enabled: false }
        ],
        disabledCues: ['group-complete']
      });

      const list = document.getElementById('standing-cues-list');
      const cueItems = list.querySelectorAll('.standing-cue-item');

      expect(cueItems.length).toBe(2);
      expect(cueItems[0].textContent).toContain('Tech Discovered');
      expect(cueItems[1].textContent).toContain('Group Complete');

      // Check enable/disable buttons exist
      const enableButtons = list.querySelectorAll('[data-action="admin.enableCue"]');
      const disableButtons = list.querySelectorAll('[data-action="admin.disableCue"]');

      expect(enableButtons.length).toBeGreaterThan(0);
      expect(disableButtons.length).toBeGreaterThan(0);
    });

    it('should show "No standing cues" message when list is empty', () => {
      store.update('cueengine', {
        loaded: true,
        cues: [
          { id: 'quick-fire-only', label: 'Quick Fire Only', quickFire: true }
        ]
      });

      const list = document.getElementById('standing-cues-list');
      expect(list.textContent).toContain('No standing cues');
    });

    it('should highlight disabled cues differently', () => {
      store.update('cueengine', {
        loaded: true,
        cues: [
          { id: 'enabled-cue', label: 'Enabled Cue', triggerType: 'event', enabled: true },
          { id: 'disabled-cue', label: 'Disabled Cue', triggerType: 'event', enabled: false }
        ],
        disabledCues: ['disabled-cue']
      });

      const list = document.getElementById('standing-cues-list');
      const items = list.querySelectorAll('.standing-cue-item');

      // Find the disabled item
      const disabledItem = Array.from(items).find(item =>
        item.querySelector('[data-cue-id="disabled-cue"]')
      );

      expect(disabledItem.classList.contains('standing-cue-item--disabled')).toBe(true);
    });
  });

  describe('cue engine integration', () => {
    it('should handle cueengine store update with cue data', () => {
      expect(() => store.update('cueengine', {
        loaded: true,
        cues: [
          { id: 'quick-1', label: 'Quick 1', quickFire: true },
          { id: 'standing-1', label: 'Standing 1', triggerType: 'event' }
        ]
      })).not.toThrow();

      const grid = document.getElementById('quick-fire-grid');
      const list = document.getElementById('standing-cues-list');

      expect(grid.children.length).toBeGreaterThan(0);
      expect(list.children.length).toBeGreaterThan(0);
    });
  });
});
