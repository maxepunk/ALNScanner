import { escapeHtml } from '../../utils/escapeHtml.js';

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
      spotify: 'Spotify Music',
      sound: 'Sound Effects'
    };

    // Cached state for differential updates
    this._sceneEls = null;        // { sceneId: buttonEl }
    this._activeSceneId = null;
    this._lastSinkKey = null;     // serialized sink names for change detection
    this._lastDeviceKey = null;   // serialized device addresses for change detection
    this._deviceEls = null;       // { address: { item, statusEl, actionsEl } }
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
    const newActiveId = activeScene?.id || null;
    if (newActiveId !== this._activeSceneId) {
      this._updateActiveScene(newActiveId);
    }
  }

  _buildSceneGrid(scenes, activeScene) {
    this.sceneGrid.innerHTML = scenes.map(scene => {
      const isActive = activeScene && (scene.id === activeScene.id);
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
      const btn = this.sceneGrid.querySelector(`[data-scene-id="${scene.id}"]`);
      if (btn) this._sceneEls[scene.id] = btn;
    }
    this._activeSceneId = activeScene?.id || null;
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
    const { routes, availableSinks } = audioState;

    // Build dropdowns if sinks available and changed
    if (availableSinks && availableSinks.length > 0 && this.audioRoutingContainer) {
      const sinkKey = availableSinks.map(s => s.name).join(',');
      if (sinkKey !== this._lastSinkKey) {
        this._renderAudioDropdowns(availableSinks);
        this._lastSinkKey = sinkKey;
      }
    }

    // Update selection values (differential — only change if different)
    if (routes) {
      Object.entries(routes).forEach(([stream, sink]) => {
        const dropdown = this.audioRoutingContainer?.querySelector(`select[data-stream="${stream}"]`);
        if (dropdown && dropdown.value !== sink) {
          dropdown.value = sink;
          // Fallback if sink doesn't match any option
          if (!dropdown.value && dropdown.options.length > 0) {
            dropdown.value = dropdown.options[0].value;
          }
        }
      });
    }

    // Hide fallback warning
    if (this.btWarning) this.btWarning.style.display = 'none';
  }

  _renderAudioDropdowns(sinks) {
    if (!this.audioRoutingContainer) return;

    const streams = [
      { id: 'video', label: this.STREAM_LABELS.video },
      { id: 'spotify', label: this.STREAM_LABELS.spotify },
      { id: 'sound', label: this.STREAM_LABELS.sound }
    ];

    this.audioRoutingContainer.innerHTML = streams.map(stream => `
      <div class="audio-control-item">
        <label>${stream.label}</label>
        <select class="form-select" data-stream="${stream.id}" data-action="admin.setAudioRoute">
          ${sinks.map(sink => `
            <option value="${escapeHtml(sink.name)}">${escapeHtml(sink.label || sink.description || sink.name)}</option>
          `).join('')}
        </select>
      </div>
    `).join('');
  }

  // ─── Bluetooth ────────────────────────────────────────────────

  /**
   * Render Bluetooth State (differential)
   * @param {Object} btState - { scanning, discoveredDevices, connectedDevices, pairedDevices }
   * @param {Object|null} prev - Previous bluetooth state
   */
  renderBluetooth(btState, prev = null) {
    const { scanning, discoveredDevices = [], connectedDevices = [] } = btState;

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

    const allDevices = this._mergeDevices(connectedDevices, btState.pairedDevices, discoveredDevices);

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

  _mergeDevices(connectedDevices, pairedDevices, discoveredDevices) {
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

    // Discovered (not already known)
    discoveredDevices.forEach(d => {
      if (!allDevices.some(ad => ad.address === d.address)) {
        allDevices.push({ ...d, status: 'discovered' });
      }
    });

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
    } else if (isPaired) {
      actionBtn = `
        <button class="btn btn-xs btn-primary"
                data-action="admin.connectBtDevice"
                data-bt-address="${safeAddress}">
          Connect
        </button>
      `;
    } else {
      actionBtn = `
        <button class="btn btn-xs btn-outline"
                data-action="admin.pairBtDevice"
                data-bt-address="${safeAddress}">
          Pair
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
