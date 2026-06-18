/**
 * Unit Test: EnvironmentRenderer
 *
 * Verifies differential rendering for three sub-domains:
 * Lighting, Audio Routing, Bluetooth.
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import { EnvironmentRenderer } from '../../../../src/ui/renderers/EnvironmentRenderer.js';

describe('EnvironmentRenderer', () => {
  let renderer;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="lighting-section" style="display: none;">
        <div id="lighting-scenes" style="display: none;"></div>
      </div>
      <div id="audio-routing-dropdowns"></div>
      <div id="bt-warning" style="display: none;"></div>
      <div id="bt-device-list"></div>
      <div id="bt-speaker-count"></div>
      <button id="btn-bt-scan"></button>
      <div id="bt-scan-status" style="display: none;"></div>
    `;

    renderer = new EnvironmentRenderer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('render() basics', () => {
    it('should handle null state gracefully', () => {
      expect(() => renderer.render(null)).not.toThrow();
    });

    it('should handle empty state gracefully', () => {
      expect(() => renderer.render({})).not.toThrow();
    });

    it('should accept DI elements via constructor', () => {
      const customGrid = document.createElement('div');
      const customSection = document.createElement('div');

      const r = new EnvironmentRenderer({
        lightingSection: customSection,
        sceneGrid: customGrid,
      });

      r.renderLighting({ connected: true, activeScene: null, scenes: [{ id: 's1', name: 'Scene 1' }] });
      expect(customGrid.querySelectorAll('.scene-tile').length).toBe(1);
    });
  });

  describe('Lighting', () => {
    const scenes = [
      { id: 'arrival', name: 'Arrival' },
      { id: 'tension', name: 'Tension' },
      { id: 'blackout', name: 'Blackout' },
    ];

    it('should render scene tiles when connected', () => {
      renderer.renderLighting({ connected: true, activeScene: null, scenes });

      const sceneGrid = document.getElementById('lighting-scenes');
      const tiles = sceneGrid.querySelectorAll('.scene-tile');
      expect(tiles).toHaveLength(3);
    });

    it('should mark active scene tile', () => {
      renderer.renderLighting({
        connected: true,
        activeScene: 'tension',   // backend sends the entity_id string (SR-1)
        scenes,
      });

      const activeTile = document.querySelector('.scene-tile--active');
      expect(activeTile).toBeTruthy();
      expect(activeTile.dataset.sceneId).toBe('tension');
    });

    it('should set data-action on scene tiles', () => {
      renderer.renderLighting({ connected: true, activeScene: null, scenes });

      const tile = document.querySelector('.scene-tile');
      expect(tile.dataset.action).toBe('admin.activateScene');
    });

    it('should show unavailable message when disconnected', () => {
      renderer.renderLighting({ connected: false, activeScene: null, scenes: [] });

      expect(document.getElementById('lighting-scenes').textContent).toContain('Lighting unavailable');
    });

    it('should escape HTML in scene names', () => {
      renderer.renderLighting({
        connected: true,
        activeScene: null,
        scenes: [{ id: 'xss', name: '<img onerror="alert(1)">' }],
      });

      const tile = document.querySelector('.scene-tile');
      expect(tile.innerHTML).not.toContain('<img');
      expect(tile.innerHTML).toContain('&lt;img');
    });

    it('should make lighting section visible', () => {
      const section = document.getElementById('lighting-section');
      expect(section.style.display).toBe('none');

      renderer.renderLighting({ connected: true, activeScene: null, scenes });
      expect(section.style.display).toBe('');
    });
  });

  describe('Lighting - differential updates', () => {
    const scenes = [
      { id: 'arrival', name: 'Arrival' },
      { id: 'tension', name: 'Tension' },
    ];

    it('should toggle active scene without rebuilding grid', () => {
      renderer.renderLighting({
        connected: true,
        activeScene: 'arrival',
        scenes,
      });

      const arrivalTile = document.querySelector('[data-scene-id="arrival"]');
      expect(arrivalTile.classList.contains('scene-tile--active')).toBe(true);

      // Change active scene
      renderer.renderLighting({
        connected: true,
        activeScene: 'tension',   // backend sends the entity_id string (SR-1)
        scenes,
      });

      // Same DOM element preserved
      expect(document.querySelector('[data-scene-id="arrival"]')).toBe(arrivalTile);
      // Active class toggled
      expect(arrivalTile.classList.contains('scene-tile--active')).toBe(false);
      expect(document.querySelector('[data-scene-id="tension"]').classList.contains('scene-tile--active')).toBe(true);
    });

    it('should handle clearing active scene', () => {
      renderer.renderLighting({
        connected: true,
        activeScene: 'arrival',
        scenes,
      });

      renderer.renderLighting({
        connected: true,
        activeScene: null,
        scenes,
      });

      expect(document.querySelectorAll('.scene-tile--active')).toHaveLength(0);
    });

    it('should reset scene cache when disconnected', () => {
      renderer.renderLighting({
        connected: true,
        activeScene: 'arrival',
        scenes,
      });

      // Disconnect
      renderer.renderLighting({ connected: false, activeScene: null, scenes: [] });

      // Reconnect — should rebuild (not reuse stale cache)
      renderer.renderLighting({
        connected: true,
        activeScene: 'tension',   // backend sends the entity_id string (SR-1)
        scenes,
      });

      expect(document.querySelector('.scene-tile--active').dataset.sceneId).toBe('tension');
    });
  });

  describe('Audio Routing', () => {
    const sinks = [
      { name: 'hdmi', label: 'HDMI Output' },
      { name: 'bluetooth', label: 'BT Speaker' },
    ];

    it('should render dropdowns for each stream', () => {
      renderer.renderAudio({ availableSinks: sinks, routes: {} });

      const dropdowns = document.querySelectorAll('select[data-stream]');
      expect(dropdowns).toHaveLength(3);

      const streams = Array.from(dropdowns).map(d => d.dataset.stream);
      expect(streams).toContain('video');
      expect(streams).toContain('music');
      expect(streams).toContain('sound');
    });

    it('should set data-action on dropdowns', () => {
      renderer.renderAudio({ availableSinks: sinks, routes: {} });

      const dropdown = document.querySelector('select[data-stream="video"]');
      expect(dropdown.dataset.action).toBe('admin.setAudioRoute');
    });

    it('should populate options from sinks', () => {
      renderer.renderAudio({ availableSinks: sinks, routes: {} });

      const dropdown = document.querySelector('select[data-stream="video"]');
      expect(dropdown.options).toHaveLength(2);
      expect(dropdown.options[0].value).toBe('hdmi');
      expect(dropdown.options[0].textContent.trim()).toBe('HDMI Output');
    });

    it('should update route selection values', () => {
      renderer.renderAudio({
        availableSinks: sinks,
        routes: { video: 'bluetooth', music: 'hdmi', sound: 'hdmi' },
      });

      expect(document.querySelector('select[data-stream="video"]').value).toBe('bluetooth');
      expect(document.querySelector('select[data-stream="music"]').value).toBe('hdmi');
    });

    it('should hide bt-warning when no route requests bluetooth', () => {
      const warning = document.getElementById('bt-warning');
      warning.style.display = 'block';

      renderer.renderAudio({ availableSinks: sinks, routes: { video: 'hdmi' } });

      expect(warning.style.display).toBe('none');
    });
  });

  describe('Audio Routing - HDMI fallback warning (F-GMCMD-02)', () => {
    const hdmiSink = { name: 'alsa_output.hdmi-stereo', type: 'hdmi', label: 'HDMI' };
    const btSink = { name: 'bluez_output.AA_BB_CC_DD_EE_FF.1', type: 'bluetooth', label: 'BT Speaker (EE:FF)' };

    it('SHOWS the warning when a route requests bluetooth but no bluetooth sink exists (fell back to HDMI)', () => {
      const warning = document.getElementById('bt-warning');

      renderer.renderAudio({
        availableSinks: [hdmiSink],
        routes: { video: 'bluetooth', music: 'hdmi', sound: 'hdmi' }
      });

      expect(warning.style.display).not.toBe('none');
    });

    it('SHOWS the warning when a bluez sink name is routed but that sink vanished', () => {
      const warning = document.getElementById('bt-warning');

      renderer.renderAudio({
        availableSinks: [hdmiSink],
        routes: { video: 'bluez_output.AA_BB_CC_DD_EE_FF.1' }
      });

      expect(warning.style.display).not.toBe('none');
    });

    it('hides the warning when the requested bluetooth sink is available', () => {
      const warning = document.getElementById('bt-warning');
      warning.style.display = 'block';

      renderer.renderAudio({
        availableSinks: [hdmiSink, btSink],
        routes: { video: 'bluetooth' }
      });

      expect(warning.style.display).toBe('none');
    });

    it('shows the warning on the differential path too (BT sink vanished mid-show)', () => {
      const warning = document.getElementById('bt-warning');

      // First render: BT available, video routed to BT — no warning
      renderer.renderAudio({
        availableSinks: [hdmiSink, btSink],
        routes: { video: 'bluetooth' }
      });
      expect(warning.style.display).toBe('none');

      // BT speaker vanishes (routing:fallback pushes a new audio snapshot)
      renderer.renderAudio({
        availableSinks: [hdmiSink],
        routes: { video: 'bluetooth' }
      });
      expect(warning.style.display).not.toBe('none');

      // Speaker returns — warning clears
      renderer.renderAudio({
        availableSinks: [hdmiSink, btSink],
        routes: { video: 'bluetooth' }
      });
      expect(warning.style.display).toBe('none');
    });
  });

  describe('Audio Routing - differential updates', () => {
    const sinks = [
      { name: 'hdmi', label: 'HDMI' },
      { name: 'bluetooth', label: 'BT' },
    ];

    it('should not rebuild dropdowns if sinks unchanged', () => {
      renderer.renderAudio({ availableSinks: sinks, routes: { video: 'hdmi' } });

      const dropdownBefore = document.querySelector('select[data-stream="video"]');

      // Same sinks, different route
      renderer.renderAudio({ availableSinks: sinks, routes: { video: 'bluetooth' } });

      // Same DOM element preserved
      expect(document.querySelector('select[data-stream="video"]')).toBe(dropdownBefore);
      // Value updated
      expect(dropdownBefore.value).toBe('bluetooth');
    });

    it('should rebuild dropdowns if sinks change', () => {
      renderer.renderAudio({ availableSinks: sinks, routes: {} });

      const dropdownBefore = document.querySelector('select[data-stream="video"]');

      // New sink added
      const newSinks = [...sinks, { name: 'bluez_output.CC_DD_EE_FF_00_11.1', label: 'BT Speaker (00:11)' }];
      renderer.renderAudio({ availableSinks: newSinks, routes: {} });

      // Dropdown rebuilt (different element)
      const dropdownAfter = document.querySelector('select[data-stream="video"]');
      expect(dropdownAfter).not.toBe(dropdownBefore);
      expect(dropdownAfter.options).toHaveLength(3);
    });

    it('should re-apply routes after dropdown rebuild', () => {
      renderer.renderAudio({ availableSinks: sinks, routes: { video: 'bluetooth' } });

      // Add new sink — triggers dropdown rebuild
      const newSinks = [...sinks, { name: 'bluez_output.CC_DD_EE_FF_00_11.1', label: 'BT Speaker (00:11)' }];
      renderer.renderAudio({ availableSinks: newSinks, routes: { video: 'bluetooth' } });

      // Route value should be re-applied to the rebuilt dropdown
      const dropdown = document.querySelector('select[data-stream="video"]');
      expect(dropdown.value).toBe('bluetooth');
    });

    it('should not update dropdown value if already correct', () => {
      renderer.renderAudio({ availableSinks: sinks, routes: { video: 'hdmi' } });

      const dropdown = document.querySelector('select[data-stream="video"]');
      expect(dropdown.value).toBe('hdmi');

      // Re-render same route — no unnecessary DOM write
      renderer.renderAudio({ availableSinks: sinks, routes: { video: 'hdmi' } });
      expect(dropdown.value).toBe('hdmi');
    });
  });

  describe('volume slider state from audioState.volumes', () => {
    let renderer;
    let container;

    beforeEach(() => {
      document.body.innerHTML = '<div id="audio-routing-dropdowns"></div>';
      container = document.getElementById('audio-routing-dropdowns');
      renderer = new EnvironmentRenderer({ audioRoutingContainer: container });
    });

    test('seeds slider DOM from audioState.volumes on initial render', () => {
      const sinks = [{ name: 'hdmi-stereo', label: 'HDMI', type: 'hdmi' }];

      renderer.renderAudio({
        availableSinks: sinks,
        routes: { video: 'hdmi-stereo', music: 'hdmi-stereo', sound: 'hdmi-stereo' },
        volumes: { video: 75, music: 40, sound: 90 },
      });

      expect(container.querySelector('input[data-stream="video"]').value).toBe('75');
      expect(container.querySelector('input[data-stream="music"]').value).toBe('40');
      expect(container.querySelector('input[data-stream="sound"]').value).toBe('90');
    });

    test('updates existing slider DOM when volumes change without sink set changing', () => {
      const sinks = [{ name: 'hdmi-stereo', label: 'HDMI', type: 'hdmi' }];

      renderer.renderAudio({ availableSinks: sinks, routes: {}, volumes: {} });
      expect(container.querySelector('input[data-stream="video"]').value).toBe('100');

      renderer.renderAudio({ availableSinks: sinks, routes: {}, volumes: { video: 25 } });

      expect(container.querySelector('input[data-stream="video"]').value).toBe('25');
      expect(container.querySelector('input[data-stream="music"]').value).toBe('100');
    });

    test('updates the volume label text when slider changes', () => {
      const sinks = [{ name: 'hdmi-stereo', label: 'HDMI', type: 'hdmi' }];

      renderer.renderAudio({
        availableSinks: sinks,
        routes: {},
        volumes: { video: 60 },
      });

      const item = container.querySelector('input[data-stream="video"]').closest('.audio-control-item');
      expect(item.querySelector('.volume-label').textContent).toBe('60%');
    });

    test('omitted volumes payload does not overwrite the cache', () => {
      const sinks = [{ name: 'hdmi-stereo', label: 'HDMI', type: 'hdmi' }];

      renderer.renderAudio({ availableSinks: sinks, routes: {}, volumes: { video: 75 } });
      expect(renderer._volumeValues.video).toBe(75);

      renderer.renderAudio({ availableSinks: sinks, routes: {} });

      expect(renderer._volumeValues.video).toBe(75);
      expect(container.querySelector('input[data-stream="video"]').value).toBe('75');
    });
  });

  describe('Bluetooth', () => {
    it('should not render discovered (un-paired) devices — dead path removed (SR-4)', () => {
      // discoveredDevices is NOT part of bluetoothService.getState(); it must be
      // ignored even if present (operational model is pair-then-connect known speakers).
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [],
        pairedDevices: [{ address: 'AA:BB', name: 'MaxEBeats' }],
        discoveredDevices: [{ address: 'CC:DD', name: 'StrangerSpeaker' }],
      });

      const list = document.getElementById('bt-device-list');
      expect(list.textContent).toContain('MaxEBeats');
      expect(list.textContent).not.toContain('StrangerSpeaker');
      expect(list.querySelectorAll('.bt-device-item')).toHaveLength(1);
    });

    it('should render disconnect button for connected devices', () => {
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [{ address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker' }],
        discoveredDevices: [],
      });

      const btn = document.querySelector('[data-action="admin.disconnectBtDevice"]');
      expect(btn).not.toBeNull();
      expect(btn.dataset.btAddress).toBe('AA:BB:CC:DD:EE:FF');
    });

    it('should show connect button for paired but not connected devices', () => {
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [],
        discoveredDevices: [],
        pairedDevices: [{ address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker' }],
      });

      const btn = document.querySelector('[data-action="admin.connectBtDevice"]');
      expect(btn).not.toBeNull();
    });

    it('should show empty state when no devices', () => {
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [],
        discoveredDevices: [],
      });

      expect(document.getElementById('bt-device-list').textContent).toContain('No devices found');
    });

    it('should toggle scan button state', () => {
      const btnScan = document.getElementById('btn-bt-scan');

      renderer.renderBluetooth({
        scanning: true,
        connectedDevices: [],
        discoveredDevices: [],
      });

      expect(btnScan.textContent).toBe('Stop Scan');
      expect(btnScan.dataset.action).toBe('admin.stopBtScan');

      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [],
        discoveredDevices: [],
      });

      expect(btnScan.textContent).toBe('Scan for Speakers');
      expect(btnScan.dataset.action).toBe('admin.startBtScan');
    });

    it('should show scan status indicator when scanning', () => {
      const scanStatus = document.getElementById('bt-scan-status');

      renderer.renderBluetooth({ scanning: true, connectedDevices: [], discoveredDevices: [] });
      expect(scanStatus.style.display).toBe('inline-block');

      renderer.renderBluetooth({ scanning: false, connectedDevices: [], discoveredDevices: [] });
      expect(scanStatus.style.display).toBe('none');
    });

    it('should update speaker count', () => {
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [{ address: 'AA:BB', name: 'S1' }],
        pairedDevices: [{ address: 'CC:DD', name: 'S2' }],
      });

      expect(document.getElementById('bt-speaker-count').textContent).toBe('2');
    });

    it('should clear speaker count when no devices', () => {
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [],
        discoveredDevices: [],
      });

      expect(document.getElementById('bt-speaker-count').textContent).toBe('');
    });

    it('should prioritize connected over paired status for same device', () => {
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [{ address: 'AA:BB', name: 'Speaker' }],
        discoveredDevices: [],
        pairedDevices: [{ address: 'AA:BB', name: 'Speaker' }],
      });

      // Should show disconnect (connected), not connect (paired)
      const items = document.querySelectorAll('.bt-device-item');
      expect(items).toHaveLength(1);
      expect(items[0].classList.contains('bt-device-item--connected')).toBe(true);
    });

    it('should show Connected status text for connected devices', () => {
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [{ address: 'AA:BB', name: 'Speaker' }],
        discoveredDevices: [],
      });

      expect(document.querySelector('.status-connected').textContent).toBe('Connected');
    });

    it('should use address as fallback name', () => {
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [{ address: 'AA:BB:CC:DD:EE:FF' }],
      });

      expect(document.querySelector('.bt-device-name').textContent).toBe('AA:BB:CC:DD:EE:FF');
    });
  });

  describe('Bluetooth - differential updates', () => {
    it('should not rebuild device list if same devices and statuses', () => {
      const state = {
        scanning: false,
        connectedDevices: [{ address: 'AA:BB', name: 'S1' }],
        discoveredDevices: [],
      };

      renderer.renderBluetooth(state);
      const itemBefore = document.querySelector('.bt-device-item');

      // Same state again
      renderer.renderBluetooth(state);

      // Same DOM element (no rebuild)
      expect(document.querySelector('.bt-device-item')).toBe(itemBefore);
    });

    it('should rebuild when device status changes', () => {
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [],
        pairedDevices: [{ address: 'AA:BB', name: 'S1' }],
      });

      expect(document.querySelector('[data-action="admin.connectBtDevice"]')).toBeTruthy();

      // Device now connected
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [{ address: 'AA:BB', name: 'S1' }],
        pairedDevices: [],
      });

      expect(document.querySelector('[data-action="admin.disconnectBtDevice"]')).toBeTruthy();
      expect(document.querySelector('[data-action="admin.connectBtDevice"]')).toBeNull();
    });

    it('should rebuild when new device added', () => {
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [],
        pairedDevices: [{ address: 'AA:BB', name: 'S1' }],
      });

      expect(document.querySelectorAll('.bt-device-item')).toHaveLength(1);

      // New device paired
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [],
        pairedDevices: [
          { address: 'AA:BB', name: 'S1' },
          { address: 'CC:DD', name: 'S2' },
        ],
      });

      expect(document.querySelectorAll('.bt-device-item')).toHaveLength(2);
    });
  });

  describe('Audio Routing - selector escaping', () => {
    // These tests verify that CSS metacharacters in stream keys (routes / volumes)
    // do NOT cause querySelector SyntaxErrors that abort the update loop before
    // reaching legitimate enum keys (video / music / sound).
    //
    // Pre-fix behaviour: `select[data-stream="a"b"]` is invalid CSS — jsdom throws
    // DOMException (SyntaxError), aborting the forEach before 'video' is updated.
    // Post-fix: escapeCssAttrValue escapes the quote, making an invalid-but-safe
    // selector that simply matches nothing; the loop continues to 'video'.

    const sinks = [
      { name: 'hdmi', label: 'HDMI' },
      { name: 'bluetooth', label: 'BT' },
    ];

    it('routes metachar key (rebuild path, ~L163): does not throw and video dropdown is still updated', () => {
      // First call with sinks to prime _lastSinkKey
      renderer.renderAudio({ availableSinks: sinks, routes: { video: 'hdmi' } });

      // New sink set triggers dropdown rebuild; re-apply routes via L163 path.
      // 'a"b' is before 'video' alphabetically in Object.entries order, so if
      // the loop aborts on the bad key, video will never be set to 'bluetooth'.
      const newSinks = [...sinks, { name: 'extra', label: 'Extra' }];
      expect(() => {
        renderer.renderAudio({
          availableSinks: newSinks,
          routes: { 'a"b': 'hdmi', video: 'bluetooth' },
        });
      }).not.toThrow();

      // If loop completed past the bad key, the video dropdown should be 'bluetooth'
      const videoDropdown = document.querySelector('select[data-stream="video"]');
      expect(videoDropdown).not.toBeNull();
      expect(videoDropdown.value).toBe('bluetooth');
    });

    it('routes metachar key (differential path, ~L182): does not throw and video dropdown is still updated', () => {
      // Prime the renderer with sinks so _lastSinkKey is set (differential path)
      renderer.renderAudio({ availableSinks: sinks, routes: { video: 'hdmi' } });

      // Same sinks → goes to differential update path (L182), NOT rebuild.
      // Bad key 'a"b' is processed first; if unescaped it aborts the loop before video.
      expect(() => {
        renderer.renderAudio({
          availableSinks: sinks,
          routes: { 'a"b': 'hdmi', video: 'bluetooth' },
        });
      }).not.toThrow();

      const videoDropdown = document.querySelector('select[data-stream="video"]');
      expect(videoDropdown).not.toBeNull();
      expect(videoDropdown.value).toBe('bluetooth');
    });

    it('volumes metachar key (_applyVolumes, ~L245): does not throw and video slider is still updated', () => {
      // Build dropdowns first so the slider DOM exists
      renderer.renderAudio({ availableSinks: sinks, routes: {}, volumes: { video: 100 } });

      // Pass bad volumes key before 'video' so an unescaped querySelector aborts before updating slider
      expect(() => {
        renderer.renderAudio({
          availableSinks: sinks,
          routes: {},
          volumes: { 'a"b': 50, video: 42 },
        });
      }).not.toThrow();

      const videoSlider = document.querySelector('input[data-stream="video"]');
      expect(videoSlider).not.toBeNull();
      expect(videoSlider.value).toBe('42');
    });
  });

  describe('render() combined', () => {
    it('should render all three sub-domains', () => {
      renderer.render({
        lighting: {
          connected: true,
          activeScene: null,
          scenes: [{ id: 's1', name: 'Scene' }],
        },
        audio: {
          availableSinks: [{ name: 'hdmi', label: 'HDMI' }],
          routes: { video: 'hdmi' },
        },
        bluetooth: {
          scanning: false,
          connectedDevices: [{ address: 'AA:BB', name: 'Speaker' }],
          discoveredDevices: [],
        },
      });

      expect(document.querySelectorAll('.scene-tile')).toHaveLength(1);
      expect(document.querySelectorAll('select[data-stream]')).toHaveLength(3);
      expect(document.querySelectorAll('.bt-device-item')).toHaveLength(1);
    });

    it('should handle partial state (only lighting)', () => {
      renderer.render({
        lighting: {
          connected: true,
          activeScene: null,
          scenes: [{ id: 's1', name: 'Scene' }],
        },
      });

      expect(document.querySelectorAll('.scene-tile')).toHaveLength(1);
      // Audio and BT should be unmodified
      expect(document.getElementById('audio-routing-dropdowns').innerHTML).toBe('');
    });
  });
});
