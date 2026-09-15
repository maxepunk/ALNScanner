import { escapeHtml } from '../../utils/escapeHtml.js';
import { escapeCssAttrValue } from '../../utils/escapeCssAttrValue.js';
import Debug from '../../utils/debug.js';

/**
 * EnvironmentRenderer - Differential DOM Rendering for Environment State
 *
 * Three sub-domains: Lighting, Audio, Bluetooth.
 * Lighting: builds scene grid once, toggles active class differentially.
 * Audio: builds dropdowns once per sink set, updates selection values differentially.
 * Bluetooth: rebuilds device list on device set change, updates status in-place.
 *
 * @module ui/renderers/EnvironmentRenderer
 */

export class EnvironmentRenderer {
  /**
   * @param {Object} elements - DOM elements map (for DI/testing)
   */
  constructor(elements = {}) {
    // Lighting Elements
    this.lightingSection = elements.lightingSection || document.getElementById('lighting-section');
    this.sceneGrid = elements.sceneGrid || document.getElementById('lighting-scenes');

    // Audio Elements
    this.audioRoutingContainer = elements.audioRoutingContainer || document.getElementById('audio-routing-dropdowns');
    this.btWarning = elements.btWarning || document.getElementById('bt-warning');

    // Bluetooth Elements
    this.btDeviceList = elements.btDeviceList || document.getElementById('bt-device-list');
    this.btSpeakerCount = elements.btSpeakerCount || document.getElementById('bt-speaker-count');
    this.btScanBtn = elements.btScanBtn || document.getElementById('btn-bt-scan');
    this.btScanStatus = elements.btScanStatus || document.getElementById('bt-scan-status');

    // Constants
    this.STREAM_LABELS = {
      video: 'Video Audio',
      music: 'Music',
      sound: 'Sound Effects'
    };

    // Cached state for differential updates
    this._sceneEls = null;        // { sceneId: buttonEl }
    this._activeSceneId = null;
    this._lastSinkKey = null;     // serialized sink names for change detection
    this._lastDeviceKey = null;   // serialized device addresses for change detection
    this._deviceEls = null;       // { address: { item, statusEl, actionsEl } }
    this._volumeValues = { video: 100, music: 100, sound: 100 }; // Track last-known slider values
    this._loggedUnknownSinks = new Set(); // Dedup Debug.log for unmatched route values (B-1)
    this._dragging = {};        // { [stream]: true } while the user is dragging that slider (B-7)
    this._pendingVolumes = {};  // { [stream]: value } latest push received during a drag, applied on release
  }

  /**
   * Render full environment state (differential)
   * @param {Object} state - { lighting, audio, bluetooth }
   * @param {Object|null} prev - Previous state (null on first render)
   */
  render(state, prev = null) {
    if (!state) return;

    if (state.lighting) this.renderLighting(state.lighting, prev?.lighting);
    if (state.audio) this.renderAudio(state.audio, prev?.audio);
    if (state.bluetooth) this.renderBluetooth(state.bluetooth, prev?.bluetooth);
  }

  // ─── Lighting ─────────────────────────────────────────────────

  /**
   * Render Lighting State (differential)
   * @param {Object} lightingState - { connected, activeScene, scenes }
   * @param {Object|null} prev - Previous lighting state
   */
  renderLighting(lightingState, prev = null) {
    if (!this.lightingSection) return;

    const { connected, activeScene, scenes } = lightingState;

    this.lightingSection.style.display = '';

    if (!connected) {
      if (this.sceneGrid) {
        this.sceneGrid.style.display = 'grid';
        this.sceneGrid.innerHTML = '<p class="empty-state">Lighting unavailable</p>';
      }
      this._sceneEls = null;
      this._activeSceneId = null;
      return;
    }

    if (!this.sceneGrid) return;
    this.sceneGrid.style.display = 'grid';

    // Build scene tiles once (scenes don't change during session)
    if (!this._sceneEls) {
      this._buildSceneGrid(scenes, activeScene);
      return;
    }

    // Differential: only toggle active class
    const newActiveId = activeScene || null;
    if (newActiveId !== this._activeSceneId) {
      this._updateActiveScene(newActiveId);
    }
  }

  _buildSceneGrid(scenes, activeScene) {
    this.sceneGrid.innerHTML = scenes.map(scene => {
      const isActive = activeScene && (scene.id === activeScene);
      const safeId = escapeHtml(scene.id);
      const safeName = escapeHtml(scene.name);

      return `
        <button class="scene-tile ${isActive ? 'scene-tile--active' : ''}"
                data-scene-id="${safeId}"
                data-action="admin.activateScene">
          ${safeName}
        </button>
      `;
    }).join('');

    // Cache element references
    this._sceneEls = {};
    for (const scene of scenes) {
      const btn = this.sceneGrid.querySelector(`[data-scene-id="${escapeCssAttrValue(scene.id)}"]`);
      if (btn) this._sceneEls[scene.id] = btn;
    }
    this._activeSceneId = activeScene || null;
  }

  _updateActiveScene(newActiveId) {
    // Remove old active
    if (this._activeSceneId && this._sceneEls[this._activeSceneId]) {
      this._sceneEls[this._activeSceneId].classList.remove('scene-tile--active');
    }
    // Add new active
    if (newActiveId && this._sceneEls[newActiveId]) {
      this._sceneEls[newActiveId].classList.add('scene-tile--active');
    }
    this._activeSceneId = newActiveId;
  }

  // ─── Audio Routing ────────────────────────────────────────────

  /**
   * Render Audio Routing State (differential)
   * @param {Object} audioState - { routes, availableSinks, ducking }
   * @param {Object|null} prev - Previous audio state
   */
  renderAudio(audioState, prev = null) {
    const { routes, availableSinks, volumes } = audioState;

    // Seed slider cache + live DOM from persisted volumes (orchestrator owns
    // per-stream volume state — see audioRoutingService.getState()). Done
    // before the sink-change rebuild so new dropdowns pick up fresh values.
    this._applyVolumes(volumes);

    // F-GMCMD-02: derive the HDMI-fallback warning from the audio snapshot —
    // a route requesting bluetooth with no bluetooth sink available means the
    // backend fell back to HDMI (routing:fallback pushes this domain). The
    // old code unconditionally hid #bt-warning on every render.
    this._updateBtWarning(routes, availableSinks);

    // Build dropdowns if sinks available and changed
    if (availableSinks && availableSinks.length > 0 && this.audioRoutingContainer) {
      const sinkKey = availableSinks.map(s => s.name).join(',');
      if (sinkKey !== this._lastSinkKey) {
        this._renderAudioDropdowns(availableSinks);
        this._lastSinkKey = sinkKey;
        // Re-apply routes after rebuilding dropdowns (they were wiped by rebuild).
        // Iterate the known stream ids — NOT Object.keys(routes) — so a stream
        // absent from the payload still gets a value applied instead of
        // falling through to the HTML default (L-1: the browser auto-selects
        // the first non-disabled option, i.e. a real sink, when nothing is
        // explicitly selected — the disabled placeholder is skipped).
        Object.keys(this.STREAM_LABELS).forEach((stream) => {
          const dropdown = this.audioRoutingContainer?.querySelector(`select[data-stream="${escapeCssAttrValue(stream)}"]`);
          if (dropdown) this._applyRouteValue(dropdown, routes?.[stream]);
        });
        return; // Routes already applied above — skip duplicate application below
      }
    }

    // Update selection values (differential — only change if different)
    Object.keys(this.STREAM_LABELS).forEach((stream) => {
      const sink = routes?.[stream];
      const compareValue = typeof sink === 'string' ? sink : '';
      const dropdown = this.audioRoutingContainer?.querySelector(`select[data-stream="${escapeCssAttrValue(stream)}"]`);
      if (dropdown && dropdown.value !== compareValue) {
        this._applyRouteValue(dropdown, sink);
      }
    });

  }

  /**
   * Apply a backend-reported route (a concrete sink name, per B-1) to a
   * dropdown. If it matches no option — the sink vanished, or the backend
   * fell back to an alias with nothing cached — select the disabled
   * "Unknown sink" placeholder instead of silently defaulting to whatever
   * happens to be first in the list (the old options[0] fallback).
   *
   * A missing/non-string sink (L-1: the stream's key absent from `routes`
   * entirely) also selects the placeholder, but is NOT logged as an
   * anomaly — there is no "unknown value" to report, just nothing yet.
   * @param {HTMLSelectElement} dropdown
   * @param {string|undefined|null} sink
   * @private
   */
  _applyRouteValue(dropdown, sink) {
    if (typeof sink !== 'string' || sink === '') {
      dropdown.value = '';
      return;
    }

    dropdown.value = sink;
    if (dropdown.value === sink) return; // matched — done

    // No option has this value: select the placeholder (value="") instead
    // of leaving selectedIndex at -1 or falling back to a real sink.
    dropdown.value = '';

    if (!this._loggedUnknownSinks.has(sink)) {
      this._loggedUnknownSinks.add(sink);
      Debug.log(`EnvironmentRenderer: audio route references unknown sink "${sink}"`, true);
    }
  }

  /**
   * Show/hide the "No Bluetooth speaker — audio will use HDMI" warning.
   * Visible iff some stream's configured route requests bluetooth (the
   * 'bluetooth' sink type or a bluez_output.* sink name) but no bluetooth
   * sink is currently available — i.e. audio actually plays over HDMI.
   * @param {Object<string,string>} routes - stream → sink type/name
   * @param {Array<{name: string, type?: string}>} availableSinks
   * @private
   */
  _updateBtWarning(routes, availableSinks) {
    if (!this.btWarning) return;

    const isBtRoute = (route) => typeof route === 'string' &&
      (route === 'bluetooth' || route.startsWith('bluez_output'));
    const wantsBluetooth = !!routes && Object.values(routes).some(isBtRoute);

    const btSinkAvailable = (availableSinks || []).some(s =>
      s.type === 'bluetooth' ||
      (typeof s.name === 'string' && s.name.startsWith('bluez_output')));

    this.btWarning.style.display = (wantsBluetooth && !btSinkAvailable) ? '' : 'none';
  }

  _renderAudioDropdowns(sinks) {
    if (!this.audioRoutingContainer) return;

    // M-1: a rebuild (sink set changed — e.g. BT speaker reconnect) replaces
    // every slider via innerHTML. A drag in progress at that moment can
    // never receive its pointerup/lostpointercapture (the old node is
    // detached), which would leave _dragging stuck true and that stream
    // permanently deaf to backend pushes. Reset both maps unconditionally.
    this._dragging = {};
    this._pendingVolumes = {};

    // Preserve current volume slider values before rebuild
    this.audioRoutingContainer.querySelectorAll('.volume-slider').forEach(slider => {
      const stream = slider.dataset.stream;
      if (stream) this._volumeValues[stream] = parseInt(slider.value, 10) || 100;
    });

    const streams = [
      { id: 'video', label: this.STREAM_LABELS.video },
      { id: 'music', label: this.STREAM_LABELS.music },
      { id: 'sound', label: this.STREAM_LABELS.sound }
    ];

    this.audioRoutingContainer.innerHTML = streams.map(stream => `
      <div class="audio-control-item">
        <label>${stream.label}</label>
        <select class="form-select" data-stream="${stream.id}" data-action="admin.setAudioRoute">
          <option value="" disabled>Unknown sink</option>
          ${sinks.map(sink => `
            <option value="${escapeHtml(sink.name)}">${escapeHtml(sink.label || sink.description || sink.name)}</option>
          `).join('')}
        </select>
        <div class="volume-control">
          <input type="range" min="0" max="100" value="${this._volumeValues[stream.id]}"
                 data-stream="${stream.id}"
                 data-action="admin.setStreamVolume"
                 class="volume-slider" />
          <span class="volume-label">${this._volumeValues[stream.id]}%</span>
        </div>
      </div>
    `).join('');

    // Drag guard (B-7): a service:state push mid-drag must not snap the
    // thumb back under the user's finger. Bound fresh on every rebuild
    // since the sliders themselves are new elements.
    streams.forEach(stream => {
      const slider = this.audioRoutingContainer.querySelector(`input[data-stream="${escapeCssAttrValue(stream.id)}"]`);
      if (!slider) return;

      slider.addEventListener('pointerdown', () => {
        this._dragging[stream.id] = true;
      });

      const release = () => {
        this._dragging[stream.id] = false;
        if (!Object.prototype.hasOwnProperty.call(this._pendingVolumes, stream.id)) return;
        const value = this._pendingVolumes[stream.id];
        delete this._pendingVolumes[stream.id];
        this._volumeValues[stream.id] = value;

        // M-1: look up the LIVE slider by stream, not the `slider` closed
        // over at bind time — if a rebuild happened between pointerdown and
        // this release, that captured element is a detached orphan and
        // writing to it would be invisible to the GM.
        const liveSlider = this.audioRoutingContainer?.querySelector(`input[data-stream="${escapeCssAttrValue(stream.id)}"]`);
        if (!liveSlider) return;
        liveSlider.value = String(value);
        const item = liveSlider.closest('.audio-control-item');
        const label = item && item.querySelector('.volume-label');
        if (label) label.textContent = `${value}%`;
      };
      slider.addEventListener('pointerup', release);
      slider.addEventListener('lostpointercapture', release);
    });
  }

  /**
   * Merge incoming persisted volumes into the cache and update live sliders
   * in place. Safe to call when no slider DOM exists (cache update only).
   * @param {Object<string, number>} volumes
   * @private
   */
  _applyVolumes(volumes) {
    if (!volumes || typeof volumes !== 'object') return;

    for (const [stream, value] of Object.entries(volumes)) {
      if (typeof value !== 'number') continue;

      if (this._dragging[stream]) {
        // B-7: don't fight the user's drag — stash it, apply on release.
        this._pendingVolumes[stream] = value;
        continue;
      }

      this._volumeValues[stream] = value;

      if (!this.audioRoutingContainer) continue;
      const slider = this.audioRoutingContainer.querySelector(`input[data-stream="${escapeCssAttrValue(stream)}"]`);
      if (slider && String(slider.value) !== String(value)) {
        slider.value = String(value);
        const item = slider.closest('.audio-control-item');
        const label = item && item.querySelector('.volume-label');
        if (label) label.textContent = `${value}%`;
      }
    }
  }

  // ─── Bluetooth ────────────────────────────────────────────────

  /**
   * Render Bluetooth State (differential)
   * @param {Object} btState - { scanning, connectedDevices, pairedDevices }
   * @param {Object|null} prev - Previous bluetooth state
   */
  renderBluetooth(btState, prev = null) {
    // SR-4: bluetoothService.getState() supplies only connected + paired devices
    // (single A2DP stream on the Pi; pair-then-connect known speakers). There is
    // no discoveredDevices over service:state, so we don't render arbitrary
    // discovered devices.
    const { scanning, connectedDevices = [] } = btState;

    // Scan button state
    if (this.btScanBtn) {
      if (scanning) {
        this.btScanBtn.textContent = 'Stop Scan';
        this.btScanBtn.dataset.action = 'admin.stopBtScan';
      } else {
        this.btScanBtn.textContent = 'Scan for Speakers';
        this.btScanBtn.dataset.action = 'admin.startBtScan';
      }
    }

    if (this.btScanStatus) {
      this.btScanStatus.style.display = scanning ? 'inline-block' : 'none';
    }

    // Device list
    if (!this.btDeviceList) return;

    const allDevices = this._mergeDevices(connectedDevices, btState.pairedDevices);

    if (allDevices.length === 0) {
      if (this._lastDeviceKey !== '') {
        this.btDeviceList.innerHTML = '<p class="empty-state">No devices found</p>';
        this._deviceEls = null;
        this._lastDeviceKey = '';
      }
    } else {
      // Rebuild on any device set or status change. BT status changes are infrequent
      // (user-initiated pair/connect), so full rebuild is acceptable here.
      const deviceKey = allDevices.map(d => `${d.address}:${d.status}`).sort().join(',');
      if (deviceKey !== this._lastDeviceKey) {
        this.btDeviceList.innerHTML = allDevices.map(d => this._renderDeviceItem(d)).join('');
        this._lastDeviceKey = deviceKey;
      }
    }

    // Count
    if (this.btSpeakerCount) {
      this.btSpeakerCount.textContent = allDevices.length > 0 ? String(allDevices.length) : '';
    }
  }

  _mergeDevices(connectedDevices, pairedDevices) {
    const allDevices = [];

    // Connected devices first
    connectedDevices.forEach(d => {
      allDevices.push({ ...d, status: 'connected' });
    });

    // Paired (not already connected)
    if (pairedDevices) {
      pairedDevices.forEach(d => {
        if (!allDevices.some(ad => ad.address === d.address)) {
          allDevices.push({ ...d, status: 'paired' });
        }
      });
    }

    return allDevices;
  }

  _renderDeviceItem(device) {
    const safeName = escapeHtml(device.name || device.address);
    const safeAddress = escapeHtml(device.address);
    const isConnected = device.status === 'connected';
    const isPaired = device.status === 'paired' || isConnected;

    let itemClass = 'bt-device-item';
    if (isConnected) itemClass += ' bt-device-item--connected';
    else if (isPaired) itemClass += ' bt-device-item--paired';

    let actionBtn = '';
    if (isConnected) {
      actionBtn = `
        <span class="bt-device-status status-connected">Connected</span>
        <button class="btn btn-xs btn-outline-danger"
                data-action="admin.disconnectBtDevice"
                data-bt-address="${safeAddress}">
          Disconnect
        </button>
      `;
    } else {
      // Non-connected devices are always 'paired' now (discovered path removed, SR-4).
      actionBtn = `
        <button class="btn btn-xs btn-primary"
                data-action="admin.connectBtDevice"
                data-bt-address="${safeAddress}">
          Connect
        </button>
      `;
    }

    return `
      <div class="${itemClass}" data-bt-address="${safeAddress}">
        <div class="bt-device-info">
          <span class="bt-device-name">${safeName}</span>
          <span class="bt-device-mac">${safeAddress}</span>
        </div>
        <div class="bt-device-actions">
          ${actionBtn}
        </div>
      </div>
    `;
  }
}
