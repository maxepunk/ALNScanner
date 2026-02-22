import { MonitoringDisplay } from '../../../src/admin/MonitoringDisplay.js';
import { cueStateFromSync } from './helpers/cueTestUtils.js';

describe('MonitoringDisplay - Show Control', () => {
  let display, mockClient, mockDataManager;

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

    // Mock DataManager (real EventTarget so _wireDataManagerEvents() wiring works)
    mockDataManager = new EventTarget();

    // Create display instance
    display = new MonitoringDisplay(mockClient, mockDataManager);
  });

  afterEach(() => {
    display.destroy();
    document.body.innerHTML = '';
  });

  describe('Quick Fire grid', () => {
    it('should render tiles for cues with quickFire: true', () => {
      const cueEngine = {
        loaded: true,
        cues: [
          { id: 'tension-hit', label: 'Tension Hit', icon: 'warning', quickFire: true, enabled: true },
          { id: 'business-sale', label: 'Business Deal', icon: 'dollar', quickFire: true, enabled: true },
          { id: 'standing-cue', label: 'Standing Cue', quickFire: false, triggerType: 'event', enabled: true }
        ]
      };

      // Simulate DM cue-state:updated event (what NetworkedSession → DM.syncCueState() triggers)
      mockDataManager.dispatchEvent(new CustomEvent('cue-state:updated', {
        detail: cueStateFromSync(cueEngine)
      }));

      const grid = document.getElementById('quick-fire-grid');
      const tiles = grid.querySelectorAll('[data-action="admin.fireCue"]');

      expect(tiles.length).toBe(2); // Only quickFire cues
      expect(tiles[0].dataset.cueId).toBe('tension-hit');
      expect(tiles[1].dataset.cueId).toBe('business-sale');
    });

    it('should show "No Quick Fire cues" message when grid is empty', () => {
      const cueEngine = {
        loaded: true,
        cues: [
          { id: 'standing-only', label: 'Standing Only', quickFire: false, triggerType: 'event' }
        ]
      };

      mockDataManager.dispatchEvent(new CustomEvent('cue-state:updated', {
        detail: cueStateFromSync(cueEngine)
      }));

      const grid = document.getElementById('quick-fire-grid');
      expect(grid.textContent).toContain('No Quick Fire cues');
    });

    it('should not render anything when cueEngine is not loaded', () => {
      const cueEngine = {
        loaded: false,
        cues: []
      };

      mockDataManager.dispatchEvent(new CustomEvent('cue-state:updated', {
        detail: cueStateFromSync(cueEngine)
      }));

      const grid = document.getElementById('quick-fire-grid');
      // Empty cues map → "No Quick Fire cues" message
      expect(grid.textContent).toContain('No Quick Fire cues');
    });
  });

  describe('Standing Cues list', () => {
    it('should render standing cues with enable/disable toggles', () => {
      const cueEngine = {
        loaded: true,
        cues: [
          { id: 'tech-discovered', label: 'Tech Discovered', triggerType: 'event', enabled: true },
          { id: 'group-complete', label: 'Group Complete', triggerType: 'event', enabled: false }
        ],
        disabledCues: ['group-complete']
      };

      mockDataManager.dispatchEvent(new CustomEvent('cue-state:updated', {
        detail: cueStateFromSync(cueEngine)
      }));

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
      const cueEngine = {
        loaded: true,
        cues: [
          { id: 'quick-fire-only', label: 'Quick Fire Only', quickFire: true }
        ]
      };

      mockDataManager.dispatchEvent(new CustomEvent('cue-state:updated', {
        detail: cueStateFromSync(cueEngine)
      }));

      const list = document.getElementById('standing-cues-list');
      expect(list.textContent).toContain('No standing cues');
    });

    it('should highlight disabled cues differently', () => {
      const cueEngine = {
        loaded: true,
        cues: [
          { id: 'enabled-cue', label: 'Enabled Cue', triggerType: 'event', enabled: true },
          { id: 'disabled-cue', label: 'Disabled Cue', triggerType: 'event', enabled: false }
        ],
        disabledCues: ['disabled-cue']
      };

      mockDataManager.dispatchEvent(new CustomEvent('cue-state:updated', {
        detail: cueStateFromSync(cueEngine)
      }));

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
    it('should handle cue-state:updated event with cue data', () => {
      const cueEngine = {
        loaded: true,
        cues: [
          { id: 'quick-1', label: 'Quick 1', quickFire: true },
          { id: 'standing-1', label: 'Standing 1', triggerType: 'event' }
        ]
      };

      // Should not throw
      expect(() => mockDataManager.dispatchEvent(new CustomEvent('cue-state:updated', {
        detail: cueStateFromSync(cueEngine)
      }))).not.toThrow();

      const grid = document.getElementById('quick-fire-grid');
      const list = document.getElementById('standing-cues-list');

      expect(grid.children.length).toBeGreaterThan(0);
      expect(list.children.length).toBeGreaterThan(0);
    });
  });
});
