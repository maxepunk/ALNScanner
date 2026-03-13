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
        activeScene: { id: 'tension' },
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
        activeScene: { id: 'arrival' },
        scenes,
      });

      const arrivalTile = document.querySelector('[data-scene-id="arrival"]');
      expect(arrivalTile.classList.contains('scene-tile--active')).toBe(true);

      // Change active scene
      renderer.renderLighting({
        connected: true,
        activeScene: { id: 'tension' },
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
        activeScene: { id: 'arrival' },
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
        activeScene: { id: 'arrival' },
        scenes,
      });

      // Disconnect
      renderer.renderLighting({ connected: false, activeScene: null, scenes: [] });

      // Reconnect — should rebuild (not reuse stale cache)
      renderer.renderLighting({
        connected: true,
        activeScene: { id: 'tension' },
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
      expect(streams).toContain('spotify');
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
        routes: { video: 'bluetooth', spotify: 'hdmi', sound: 'hdmi' },
      });

      expect(document.querySelector('select[data-stream="video"]').value).toBe('bluetooth');
      expect(document.querySelector('select[data-stream="spotify"]').value).toBe('hdmi');
    });

    it('should hide bt-warning when rendering audio', () => {
      const warning = document.getElementById('bt-warning');
      warning.style.display = 'block';

      renderer.renderAudio({ availableSinks: sinks, routes: {} });

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
      const newSinks = [...sinks, { name: 'combine-bt', label: 'Dual BT' }];
      renderer.renderAudio({ availableSinks: newSinks, routes: {} });

      // Dropdown rebuilt (different element)
      const dropdownAfter = document.querySelector('select[data-stream="video"]');
      expect(dropdownAfter).not.toBe(dropdownBefore);
      expect(dropdownAfter.options).toHaveLength(3);
    });

    it('should re-apply routes after dropdown rebuild', () => {
      renderer.renderAudio({ availableSinks: sinks, routes: { video: 'bluetooth' } });

      // Add new sink — triggers dropdown rebuild
      const newSinks = [...sinks, { name: 'combine-bt', label: 'Dual BT' }];
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

  describe('Bluetooth', () => {
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

    it('should show pair button for discovered devices', () => {
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [],
        discoveredDevices: [{ address: 'AA:BB:CC:DD:EE:FF', name: 'Speaker' }],
      });

      const btn = document.querySelector('[data-action="admin.pairBtDevice"]');
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
        discoveredDevices: [{ address: 'CC:DD', name: 'S2' }],
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
        connectedDevices: [],
        discoveredDevices: [{ address: 'AA:BB:CC:DD:EE:FF' }],
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
        discoveredDevices: [{ address: 'AA:BB', name: 'S1' }],
      });

      expect(document.querySelector('[data-action="admin.pairBtDevice"]')).toBeTruthy();

      // Device now connected
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [{ address: 'AA:BB', name: 'S1' }],
        discoveredDevices: [],
      });

      expect(document.querySelector('[data-action="admin.disconnectBtDevice"]')).toBeTruthy();
      expect(document.querySelector('[data-action="admin.pairBtDevice"]')).toBeNull();
    });

    it('should rebuild when new device added', () => {
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [],
        discoveredDevices: [{ address: 'AA:BB', name: 'S1' }],
      });

      expect(document.querySelectorAll('.bt-device-item')).toHaveLength(1);

      // New device discovered
      renderer.renderBluetooth({
        scanning: false,
        connectedDevices: [],
        discoveredDevices: [
          { address: 'AA:BB', name: 'S1' },
          { address: 'CC:DD', name: 'S2' },
        ],
      });

      expect(document.querySelectorAll('.bt-device-item')).toHaveLength(2);
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
