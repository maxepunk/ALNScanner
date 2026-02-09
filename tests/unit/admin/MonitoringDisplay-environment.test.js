/**
 * MonitoringDisplay Environment Event Handler Tests
 * Phase 0: Environment Control
 *
 * Tests the 6 new environment event handlers added to MonitoringDisplay:
 * - bluetooth:device
 * - bluetooth:scan
 * - audio:routing
 * - audio:routing:fallback
 * - lighting:scene
 * - lighting:status
 *
 * Also tests _updateEnvironmentFromSync() for sync:full payloads.
 */

// Mock Debug BEFORE importing modules
jest.mock('../../../src/utils/debug.js', () => ({
  default: {
    log: jest.fn()
  },
  __esModule: true
}));

import { MonitoringDisplay } from '../../../src/admin/MonitoringDisplay.js';
import Debug from '../../../src/utils/debug.js';

describe('MonitoringDisplay - Environment Event Handlers', () => {
  let display;
  let mockClient;
  let container;

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

    // Set up DOM container for test elements
    container = document.createElement('div');
    document.body.appendChild(container);

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

  // ============================================
  // bluetooth:device HANDLER
  // ============================================

  describe('bluetooth:device handler', () => {
    let btDeviceList;

    beforeEach(() => {
      btDeviceList = document.createElement('div');
      btDeviceList.id = 'bt-device-list';
      document.body.appendChild(btDeviceList);
    });

    it('should add a device on "paired" event', () => {
      dispatchMessage('bluetooth:device', {
        type: 'paired',
        device: { address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker 1' }
      });

      const item = btDeviceList.querySelector('[data-bt-address="AA:BB:CC:DD:EE:FF"]');
      expect(item).not.toBeNull();
      expect(item.querySelector('.bt-device-name').textContent).toBe('Speaker 1');
      expect(item.querySelector('.bt-device-status').textContent).toBe('Paired');
    });

    it('should add a device on "connected" event with connected class', () => {
      dispatchMessage('bluetooth:device', {
        type: 'connected',
        device: { address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker 1' }
      });

      const item = btDeviceList.querySelector('[data-bt-address="AA:BB:CC:DD:EE:FF"]');
      expect(item).not.toBeNull();
      expect(item.querySelector('.bt-device-name').classList.contains('bt-connected')).toBe(true);
      expect(item.querySelector('.bt-device-status').textContent).toBe('Connected');
    });

    it('should update existing device instead of creating duplicate', () => {
      // First pair
      dispatchMessage('bluetooth:device', {
        type: 'paired',
        device: { address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker 1' }
      });

      // Then connect same device
      dispatchMessage('bluetooth:device', {
        type: 'connected',
        device: { address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker 1' }
      });

      const items = btDeviceList.querySelectorAll('[data-bt-address="AA:BB:CC:DD:EE:FF"]');
      expect(items.length).toBe(1);
      expect(items[0].querySelector('.bt-device-status').textContent).toBe('Connected');
    });

    it('should update device status to "Paired" on disconnect', () => {
      // First add device
      dispatchMessage('bluetooth:device', {
        type: 'connected',
        device: { address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker 1' }
      });

      // Then disconnect
      dispatchMessage('bluetooth:device', {
        type: 'disconnected',
        device: { address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker 1' }
      });

      const item = btDeviceList.querySelector('[data-bt-address="AA:BB:CC:DD:EE:FF"]');
      expect(item).not.toBeNull();
      expect(item.querySelector('.bt-device-status').textContent).toBe('Paired');
      expect(item.querySelector('.bt-device-name').classList.contains('bt-connected')).toBe(false);
    });

    it('should remove device on "unpaired" event', () => {
      // First add device
      dispatchMessage('bluetooth:device', {
        type: 'paired',
        device: { address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker 1' }
      });

      expect(btDeviceList.querySelector('[data-bt-address="AA:BB:CC:DD:EE:FF"]')).not.toBeNull();

      // Then unpair
      dispatchMessage('bluetooth:device', {
        type: 'unpaired',
        device: { address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker 1' }
      });

      expect(btDeviceList.querySelector('[data-bt-address="AA:BB:CC:DD:EE:FF"]')).toBeNull();
    });

    it('should use address as name when name is missing', () => {
      dispatchMessage('bluetooth:device', {
        type: 'paired',
        device: { address: 'AA:BB:CC:DD:EE:FF', name: null }
      });

      const item = btDeviceList.querySelector('[data-bt-address="AA:BB:CC:DD:EE:FF"]');
      expect(item.querySelector('.bt-device-name').textContent).toBe('AA:BB:CC:DD:EE:FF');
    });

    it('should not throw with null payload', () => {
      expect(() => {
        dispatchMessage('bluetooth:device', null);
      }).not.toThrow();
    });

    it('should not throw when bt-device-list element is missing', () => {
      btDeviceList.remove();

      expect(() => {
        dispatchMessage('bluetooth:device', {
          type: 'paired',
          device: { address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker' }
        });
      }).not.toThrow();
    });

    it('should handle disconnect for non-existent device gracefully', () => {
      expect(() => {
        dispatchMessage('bluetooth:device', {
          type: 'disconnected',
          device: { address: 'XX:XX:XX:XX:XX:XX', name: 'Ghost' }
        });
      }).not.toThrow();
    });
  });

  // ============================================
  // _updateBtSpeakerCount HELPER
  // ============================================

  describe('_updateBtSpeakerCount', () => {
    let btDeviceList;
    let btSpeakerCount;

    beforeEach(() => {
      btDeviceList = document.createElement('div');
      btDeviceList.id = 'bt-device-list';
      document.body.appendChild(btDeviceList);

      btSpeakerCount = document.createElement('span');
      btSpeakerCount.id = 'bt-speaker-count';
      document.body.appendChild(btSpeakerCount);
    });

    it('should update badge count after adding devices', () => {
      dispatchMessage('bluetooth:device', {
        type: 'paired',
        device: { address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker 1' }
      });

      expect(btSpeakerCount.textContent).toBe('1');
    });

    it('should show empty string for zero devices', () => {
      // Add then remove device
      dispatchMessage('bluetooth:device', {
        type: 'paired',
        device: { address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker 1' }
      });

      dispatchMessage('bluetooth:device', {
        type: 'unpaired',
        device: { address: 'AA:BB:CC:DD:EE:FF' }
      });

      expect(btSpeakerCount.textContent).toBe('');
    });

    it('should count multiple devices correctly', () => {
      dispatchMessage('bluetooth:device', {
        type: 'paired',
        device: { address: 'AA:BB:CC:DD:EE:01', name: 'Speaker 1' }
      });

      dispatchMessage('bluetooth:device', {
        type: 'paired',
        device: { address: 'AA:BB:CC:DD:EE:02', name: 'Speaker 2' }
      });

      expect(btSpeakerCount.textContent).toBe('2');
    });
  });

  // ============================================
  // bluetooth:scan HANDLER
  // ============================================

  describe('bluetooth:scan handler', () => {
    let scanBtn;
    let scanSpinner;

    beforeEach(() => {
      scanBtn = document.createElement('button');
      scanBtn.id = 'btn-bt-scan';
      scanBtn.textContent = 'Scan for Speakers';
      scanBtn.dataset.action = 'admin.startBtScan';
      document.body.appendChild(scanBtn);

      scanSpinner = document.createElement('span');
      scanSpinner.id = 'bt-scan-status';
      scanSpinner.style.display = 'none';
      document.body.appendChild(scanSpinner);
    });

    it('should update button to "Stop Scan" when scanning starts', () => {
      dispatchMessage('bluetooth:scan', {
        scanning: true
      });

      expect(scanBtn.textContent).toBe('Stop Scan');
      expect(scanBtn.dataset.action).toBe('admin.stopBtScan');
    });

    it('should show spinner when scanning starts', () => {
      dispatchMessage('bluetooth:scan', {
        scanning: true
      });

      expect(scanSpinner.style.display).toBe('inline-block');
    });

    it('should update button to "Scan for Speakers" when scanning stops', () => {
      // Start scan first
      dispatchMessage('bluetooth:scan', {
        scanning: true
      });

      // Stop scan
      dispatchMessage('bluetooth:scan', {
        scanning: false
      });

      expect(scanBtn.textContent).toBe('Scan for Speakers');
      expect(scanBtn.dataset.action).toBe('admin.startBtScan');
    });

    it('should hide spinner when scanning stops', () => {
      dispatchMessage('bluetooth:scan', {
        scanning: true
      });

      dispatchMessage('bluetooth:scan', {
        scanning: false
      });

      expect(scanSpinner.style.display).toBe('none');
    });

    it('should not throw with null payload', () => {
      expect(() => {
        dispatchMessage('bluetooth:scan', null);
      }).not.toThrow();
    });

    it('should not throw when DOM elements are missing', () => {
      scanBtn.remove();
      scanSpinner.remove();

      expect(() => {
        dispatchMessage('bluetooth:scan', {
          scanning: true,
          event: 'started'
        });
      }).not.toThrow();
    });
  });

  // ============================================
  // audio:routing HANDLER
  // ============================================

  describe('audio:routing handler', () => {
    let hdmiRadio;
    let btRadio;
    let btWarning;

    beforeEach(() => {
      // Create radio buttons
      hdmiRadio = document.createElement('input');
      hdmiRadio.type = 'radio';
      hdmiRadio.name = 'audioOutput';
      hdmiRadio.value = 'hdmi';
      hdmiRadio.checked = true;
      document.body.appendChild(hdmiRadio);

      btRadio = document.createElement('input');
      btRadio.type = 'radio';
      btRadio.name = 'audioOutput';
      btRadio.value = 'bluetooth';
      btRadio.checked = false;
      document.body.appendChild(btRadio);

      btWarning = document.createElement('div');
      btWarning.id = 'bt-warning';
      btWarning.style.display = 'none';
      document.body.appendChild(btWarning);
    });

    it('should select bluetooth radio when sink is a bluez sink', () => {
      dispatchMessage('audio:routing', {
        stream: 'video',
        sink: 'bluez_sink.AA_BB_CC_DD_EE_FF.a2dp_sink'
      });

      expect(btRadio.checked).toBe(true);
      expect(hdmiRadio.checked).toBe(false);
    });

    it('should select hdmi radio when sink is not a bluez sink', () => {
      // First switch to bluetooth
      dispatchMessage('audio:routing', {
        stream: 'video',
        sink: 'bluez_sink.AA_BB_CC_DD_EE_FF.a2dp_sink'
      });

      // Then switch to HDMI
      dispatchMessage('audio:routing', {
        stream: 'video',
        sink: 'alsa_output.hdmi-stereo'
      });

      expect(hdmiRadio.checked).toBe(true);
      expect(btRadio.checked).toBe(false);
    });

    it('should hide fallback warning when routing succeeds', () => {
      btWarning.style.display = 'block';

      dispatchMessage('audio:routing', {
        stream: 'video',
        sink: 'bluez_sink.AA_BB_CC_DD_EE_FF.a2dp_sink'
      });

      expect(btWarning.style.display).toBe('none');
    });

    it('should not throw with null payload', () => {
      expect(() => {
        dispatchMessage('audio:routing', null);
      }).not.toThrow();
    });

    it('should handle null sink gracefully', () => {
      expect(() => {
        dispatchMessage('audio:routing', {
          stream: 'video',
          sink: null
        });
      }).not.toThrow();

      // Should default to HDMI when sink is null
      expect(hdmiRadio.checked).toBe(true);
    });
  });

  // ============================================
  // audio:routing:fallback HANDLER
  // ============================================

  describe('audio:routing:fallback handler', () => {
    let btWarning;
    let hdmiRadio;
    let btRadio;

    beforeEach(() => {
      btWarning = document.createElement('div');
      btWarning.id = 'bt-warning';
      btWarning.style.display = 'none';
      document.body.appendChild(btWarning);

      hdmiRadio = document.createElement('input');
      hdmiRadio.type = 'radio';
      hdmiRadio.name = 'audioOutput';
      hdmiRadio.value = 'hdmi';
      document.body.appendChild(hdmiRadio);

      btRadio = document.createElement('input');
      btRadio.type = 'radio';
      btRadio.name = 'audioOutput';
      btRadio.value = 'bluetooth';
      btRadio.checked = true;
      document.body.appendChild(btRadio);
    });

    it('should show warning with reason text', () => {
      dispatchMessage('audio:routing:fallback', {
        stream: 'video',
        reason: 'Bluetooth speaker disconnected',
        sink: 'alsa_output.hdmi-stereo'
      });

      expect(btWarning.style.display).toBe('block');
      expect(btWarning.textContent).toContain('Bluetooth speaker disconnected');
    });

    it('should show "unknown" when reason is missing', () => {
      dispatchMessage('audio:routing:fallback', {
        stream: 'video',
        reason: null,
        sink: 'alsa_output.hdmi-stereo'
      });

      expect(btWarning.textContent).toContain('unknown');
    });

    it('should reset radio selection to HDMI', () => {
      dispatchMessage('audio:routing:fallback', {
        stream: 'video',
        reason: 'Speaker lost',
        sink: 'alsa_output.hdmi-stereo'
      });

      expect(hdmiRadio.checked).toBe(true);
    });

    it('should not throw with null payload', () => {
      expect(() => {
        dispatchMessage('audio:routing:fallback', null);
      }).not.toThrow();
    });

    it('should not throw when DOM elements are missing', () => {
      btWarning.remove();
      hdmiRadio.remove();
      btRadio.remove();

      expect(() => {
        dispatchMessage('audio:routing:fallback', {
          stream: 'video',
          reason: 'test',
          sink: 'hdmi'
        });
      }).not.toThrow();
    });
  });

  // ============================================
  // lighting:scene HANDLER
  // ============================================

  describe('lighting:scene handler', () => {
    let tiles;

    beforeEach(() => {
      // Create scene tiles
      const grid = document.createElement('div');
      grid.id = 'lighting-scenes';

      const tile1 = document.createElement('button');
      tile1.className = 'scene-tile scene-tile--active';
      tile1.dataset.sceneId = 'scene_pregame';
      tile1.textContent = 'Pre-Game';
      grid.appendChild(tile1);

      const tile2 = document.createElement('button');
      tile2.className = 'scene-tile';
      tile2.dataset.sceneId = 'scene_gameplay';
      tile2.textContent = 'Gameplay';
      grid.appendChild(tile2);

      const tile3 = document.createElement('button');
      tile3.className = 'scene-tile';
      tile3.dataset.sceneId = 'scene_endgame';
      tile3.textContent = 'End Game';
      grid.appendChild(tile3);

      document.body.appendChild(grid);
      tiles = grid.querySelectorAll('.scene-tile');
    });

    it('should activate the correct scene tile', () => {
      dispatchMessage('lighting:scene', {
        sceneId: 'scene_gameplay'
      });

      tiles = document.querySelectorAll('.scene-tile');
      expect(tiles[0].classList.contains('scene-tile--active')).toBe(false);
      expect(tiles[1].classList.contains('scene-tile--active')).toBe(true);
      expect(tiles[2].classList.contains('scene-tile--active')).toBe(false);
    });

    it('should deactivate all tiles when scene does not match', () => {
      dispatchMessage('lighting:scene', {
        sceneId: 'nonexistent_scene'
      });

      tiles = document.querySelectorAll('.scene-tile');
      tiles.forEach(tile => {
        expect(tile.classList.contains('scene-tile--active')).toBe(false);
      });
    });

    it('should not throw with null payload', () => {
      expect(() => {
        dispatchMessage('lighting:scene', null);
      }).not.toThrow();
    });
  });

  // ============================================
  // lighting:status HANDLER
  // ============================================

  describe('lighting:status handler', () => {
    let lightingSection;
    let notConnected;
    let sceneGrid;

    beforeEach(() => {
      lightingSection = document.createElement('div');
      lightingSection.id = 'lighting-section';
      lightingSection.style.display = 'none'; // Hidden by default in HTML
      document.body.appendChild(lightingSection);

      notConnected = document.createElement('div');
      notConnected.id = 'lighting-not-connected';
      notConnected.style.display = 'none';
      lightingSection.appendChild(notConnected);

      sceneGrid = document.createElement('div');
      sceneGrid.id = 'lighting-scenes';
      sceneGrid.style.display = 'grid';
      lightingSection.appendChild(sceneGrid);
    });

    it('should make lighting section visible on any status event', () => {
      expect(lightingSection.style.display).toBe('none');

      dispatchMessage('lighting:status', {
        connected: false,
        scenes: [],
        activeScene: null
      });

      expect(lightingSection.style.display).toBe('');
    });

    it('should show "not connected" message when disconnected', () => {
      dispatchMessage('lighting:status', {
        connected: false,
        scenes: [],
        activeScene: null
      });

      expect(notConnected.style.display).toBe('block');
      expect(sceneGrid.style.display).toBe('none');
    });

    it('should hide "not connected" and show scene grid when connected', () => {
      dispatchMessage('lighting:status', {
        connected: true,
        scenes: [
          { id: 'scene_pregame', name: 'Pre-Game' },
          { id: 'scene_gameplay', name: 'Gameplay' }
        ],
        activeScene: 'scene_pregame'
      });

      expect(notConnected.style.display).toBe('none');
      expect(sceneGrid.style.display).toBe('grid');
    });

    it('should render scene tiles from scenes array', () => {
      dispatchMessage('lighting:status', {
        connected: true,
        scenes: [
          { id: 'scene_pregame', name: 'Pre-Game' },
          { id: 'scene_gameplay', name: 'Gameplay' }
        ],
        activeScene: 'scene_pregame'
      });

      const tiles = sceneGrid.querySelectorAll('.scene-tile');
      expect(tiles.length).toBe(2);
      expect(tiles[0].textContent.trim()).toBe('Pre-Game');
      expect(tiles[1].textContent.trim()).toBe('Gameplay');
    });

    it('should mark active scene tile with active class', () => {
      dispatchMessage('lighting:status', {
        connected: true,
        scenes: [
          { id: 'scene_pregame', name: 'Pre-Game' },
          { id: 'scene_gameplay', name: 'Gameplay' }
        ],
        activeScene: 'scene_gameplay'
      });

      const tiles = sceneGrid.querySelectorAll('.scene-tile');
      expect(tiles[0].classList.contains('scene-tile--active')).toBe(false);
      expect(tiles[1].classList.contains('scene-tile--active')).toBe(true);
    });

    it('should set data-action on scene tiles', () => {
      dispatchMessage('lighting:status', {
        connected: true,
        scenes: [{ id: 'scene_1', name: 'Scene 1' }],
        activeScene: null
      });

      const tile = sceneGrid.querySelector('.scene-tile');
      expect(tile.dataset.action).toBe('admin.activateScene');
    });

    it('should set data-scene-id on scene tiles', () => {
      dispatchMessage('lighting:status', {
        connected: true,
        scenes: [{ id: 'scene_pregame', name: 'Pre-Game' }],
        activeScene: null
      });

      const tile = sceneGrid.querySelector('.scene-tile');
      expect(tile.dataset.sceneId).toBe('scene_pregame');
    });

    it('should not throw with null payload', () => {
      expect(() => {
        dispatchMessage('lighting:status', null);
      }).not.toThrow();
    });

    it('should handle missing DOM elements gracefully', () => {
      lightingSection.remove();

      expect(() => {
        dispatchMessage('lighting:status', {
          connected: true,
          scenes: [],
          activeScene: null
        });
      }).not.toThrow();
    });
  });

  // ============================================
  // _updateEnvironmentFromSync
  // ============================================

  describe('_updateEnvironmentFromSync (via sync:full)', () => {
    let btDeviceList;
    let btSpeakerCount;
    let scanBtn;
    let scanSpinner;
    let sceneGrid;
    let notConnected;
    let hdmiRadio;
    let btRadio;

    beforeEach(() => {
      // BT device list
      btDeviceList = document.createElement('div');
      btDeviceList.id = 'bt-device-list';
      document.body.appendChild(btDeviceList);

      btSpeakerCount = document.createElement('span');
      btSpeakerCount.id = 'bt-speaker-count';
      document.body.appendChild(btSpeakerCount);

      // BT scan controls
      scanBtn = document.createElement('button');
      scanBtn.id = 'btn-bt-scan';
      scanBtn.textContent = 'Scan for Speakers';
      document.body.appendChild(scanBtn);

      scanSpinner = document.createElement('span');
      scanSpinner.id = 'bt-scan-status';
      scanSpinner.style.display = 'none';
      document.body.appendChild(scanSpinner);

      // Audio radios
      hdmiRadio = document.createElement('input');
      hdmiRadio.type = 'radio';
      hdmiRadio.name = 'audioOutput';
      hdmiRadio.value = 'hdmi';
      hdmiRadio.checked = true;
      document.body.appendChild(hdmiRadio);

      btRadio = document.createElement('input');
      btRadio.type = 'radio';
      btRadio.name = 'audioOutput';
      btRadio.value = 'bluetooth';
      document.body.appendChild(btRadio);

      // Lighting section
      const lightingSection = document.createElement('div');
      lightingSection.id = 'lighting-section';
      document.body.appendChild(lightingSection);

      notConnected = document.createElement('div');
      notConnected.id = 'lighting-not-connected';
      notConnected.style.display = 'none';
      lightingSection.appendChild(notConnected);

      sceneGrid = document.createElement('div');
      sceneGrid.id = 'lighting-scenes';
      lightingSection.appendChild(sceneGrid);

      // Session status container (needed by updateAllDisplays)
      const sessionContainer = document.createElement('div');
      sessionContainer.id = 'session-status-container';
      document.body.appendChild(sessionContainer);
    });

    it('should populate BT devices from sync:full environment data', () => {
      dispatchMessage('sync:full', {
        session: null,
        environment: {
          bluetooth: {
            pairedDevices: [
              { address: 'AA:BB:CC:DD:EE:01', name: 'Speaker 1', connected: true },
              { address: 'AA:BB:CC:DD:EE:02', name: 'Speaker 2', connected: false }
            ],
            scanning: false
          },
          audio: {
            routes: {
              video: { sink: 'bluez_sink.AA_BB_CC_DD_EE_01.a2dp_sink' }
            }
          },
          lighting: {
            connected: true,
            scenes: [{ id: 'scene_1', name: 'Scene 1' }],
            activeScene: 'scene_1'
          }
        }
      });

      const devices = btDeviceList.querySelectorAll('.bt-device-item');
      expect(devices.length).toBe(2);
      expect(btSpeakerCount.textContent).toBe('2');
    });

    it('should update audio routing radio from sync:full', () => {
      dispatchMessage('sync:full', {
        session: null,
        environment: {
          audio: {
            routes: {
              video: { sink: 'bluez_sink.AA_BB_CC_DD_EE_01.a2dp_sink' }
            }
          }
        }
      });

      expect(btRadio.checked).toBe(true);
      expect(hdmiRadio.checked).toBe(false);
    });

    it('should update lighting status from sync:full', () => {
      dispatchMessage('sync:full', {
        session: null,
        environment: {
          lighting: {
            connected: true,
            scenes: [
              { id: 'scene_pregame', name: 'Pre-Game' },
              { id: 'scene_gameplay', name: 'Gameplay' }
            ],
            activeScene: 'scene_gameplay'
          }
        }
      });

      expect(notConnected.style.display).toBe('none');
      expect(sceneGrid.style.display).toBe('grid');
      const tiles = sceneGrid.querySelectorAll('.scene-tile');
      expect(tiles.length).toBe(2);
      expect(tiles[1].classList.contains('scene-tile--active')).toBe(true);
    });

    it('should update bluetooth scan state from sync:full', () => {
      dispatchMessage('sync:full', {
        session: null,
        environment: {
          bluetooth: {
            pairedDevices: [],
            scanning: true
          }
        }
      });

      expect(scanBtn.textContent).toBe('Stop Scan');
      expect(scanSpinner.style.display).toBe('inline-block');
    });

    it('should handle sync:full without environment field', () => {
      expect(() => {
        dispatchMessage('sync:full', {
          session: null
          // no environment field
        });
      }).not.toThrow();
    });

    it('should handle sync:full with partial environment data', () => {
      expect(() => {
        dispatchMessage('sync:full', {
          session: null,
          environment: {
            bluetooth: {
              pairedDevices: [],
              scanning: false
            }
            // no audio, no lighting
          }
        });
      }).not.toThrow();
    });

    it('should show lighting disconnected when connected is false in sync:full', () => {
      dispatchMessage('sync:full', {
        session: null,
        environment: {
          lighting: {
            connected: false,
            scenes: [],
            activeScene: null
          }
        }
      });

      expect(notConnected.style.display).toBe('block');
      expect(sceneGrid.style.display).toBe('none');
    });

    it('should clear BT device list before populating from sync:full', () => {
      // Pre-populate with stale data
      const staleItem = document.createElement('div');
      staleItem.className = 'bt-device-item';
      staleItem.dataset.btAddress = 'STALE:DEVICE';
      btDeviceList.appendChild(staleItem);

      dispatchMessage('sync:full', {
        session: null,
        environment: {
          bluetooth: {
            pairedDevices: [
              { address: 'AA:BB:CC:DD:EE:01', name: 'Fresh Speaker', connected: false }
            ],
            scanning: false
          }
        }
      });

      const devices = btDeviceList.querySelectorAll('.bt-device-item');
      expect(devices.length).toBe(1);
      expect(btDeviceList.querySelector('[data-bt-address="STALE:DEVICE"]')).toBeNull();
      expect(btDeviceList.querySelector('[data-bt-address="AA:BB:CC:DD:EE:01"]')).not.toBeNull();
    });
  });

  // ============================================
  // Debug logging
  // ============================================

  describe('Debug logging', () => {
    it('should log bluetooth:device events', () => {
      const btDeviceList = document.createElement('div');
      btDeviceList.id = 'bt-device-list';
      document.body.appendChild(btDeviceList);

      dispatchMessage('bluetooth:device', {
        type: 'paired',
        device: { address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker' }
      });

      expect(Debug.log).toHaveBeenCalledWith(
        expect.stringContaining('bluetooth:device')
      );
    });

    it('should log bluetooth:scan events', () => {
      dispatchMessage('bluetooth:scan', {
        scanning: true
      });

      expect(Debug.log).toHaveBeenCalledWith(
        expect.stringContaining('bluetooth:scan')
      );
    });

    it('should log audio:routing events', () => {
      dispatchMessage('audio:routing', {
        stream: 'video',
        sink: 'test_sink'
      });

      expect(Debug.log).toHaveBeenCalledWith(
        expect.stringContaining('audio:routing')
      );
    });

    it('should log lighting:scene events', () => {
      dispatchMessage('lighting:scene', {
        sceneId: 'test_scene'
      });

      expect(Debug.log).toHaveBeenCalledWith(
        expect.stringContaining('lighting:scene')
      );
    });

    it('should log lighting:status events', () => {
      dispatchMessage('lighting:status', {
        connected: true,
        scenes: [],
        activeScene: null
      });

      expect(Debug.log).toHaveBeenCalledWith(
        expect.stringContaining('lighting:status')
      );
    });
  });
});
