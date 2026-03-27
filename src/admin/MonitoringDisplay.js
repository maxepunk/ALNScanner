import Debug from '../utils/debug.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { CueRenderer } from '../ui/renderers/CueRenderer.js';
import { EnvironmentRenderer } from '../ui/renderers/EnvironmentRenderer.js';
import { SessionRenderer } from '../ui/renderers/SessionRenderer.js';
import { VideoRenderer } from '../ui/renderers/VideoRenderer.js';
import { SpotifyRenderer } from '../ui/renderers/SpotifyRenderer.js';
import { HealthRenderer } from '../ui/renderers/HealthRenderer.js';
import { HeldItemsRenderer } from '../ui/renderers/HeldItemsRenderer.js';

export class MonitoringDisplay {
  /**
   * @param {Object} client - OrchestratorClient instance (EventTarget)
   * @param {Object} store - StateStore instance for service domain state
   * @param {Object} teamRegistry - TeamRegistry instance for team dropdown sync (optional)
   */
  constructor(client, store, teamRegistry = null) {
    this.client = client;
    this.store = store;
    this.teamRegistry = teamRegistry;
    this.devices = [];

    // Renderers
    this.cueRenderer = new CueRenderer();
    this.envRenderer = new EnvironmentRenderer();
    this.sessionRenderer = new SessionRenderer();
    this.videoRenderer = new VideoRenderer();
    this.spotifyRenderer = new SpotifyRenderer();
    this.healthRenderer = new HealthRenderer();
    this.heldItemsRenderer = new HeldItemsRenderer();

    // Bind handler for cleanup
    this._messageHandler = this._handleMessage.bind(this);
    this.client.addEventListener('message:received', this._messageHandler);

    // Wire store subscriptions (replaces DataManager event subscriptions)
    this._wireStoreSubscriptions();

    // Request initial state
    this._requestInitialState();
  }

  /**
   * Subscribe renderers to StateStore domains.
   * Store is populated by networkedSession from service:state and sync:full events.
   * @private
   */
  _wireStoreSubscriptions() {
    if (!this.store) return;

    this._storeCallbacks = [];
    const on = (domain, handler) => {
      this.store.on(domain, handler);
      this._storeCallbacks.push({ domain, handler });
    };

    // Cue Engine — transform arrays to Maps/Sets for CueRenderer
    on('cueengine', (state) => {
      const cues = new Map();
      (state.cues || []).forEach(c => cues.set(c.id, c));
      const activeCues = new Map();
      (state.activeCues || []).forEach(ac => activeCues.set(ac.cueId, ac));
      const disabledCues = new Set(state.disabledCues || []);
      this.cueRenderer.render({ cues, activeCues, disabledCues });
    });

    // Held Items — full snapshot from store
    on('held', (state) => {
      this.heldItemsRenderer.renderSnapshot(state?.items || []);
    });

    // Service Health
    on('health', (state, prev) => {
      this.healthRenderer.render(state, prev);
    });

    // Environment: Lighting
    on('lighting', (state, prev) => {
      this.envRenderer.renderLighting(state, prev);
    });

    // Environment: Audio + ducking forwarding
    on('audio', (state, prev) => {
      this.envRenderer.renderAudio(state, prev);
      // Transform backend shape { spotify: ['video'] } → renderer shape { ducked, activeSources }
      const duckingSources = state?.ducking?.spotify;
      this.spotifyRenderer.renderDucking(
        duckingSources && duckingSources.length > 0
          ? { ducked: true, activeSources: duckingSources }
          : { ducked: false, activeSources: [] }
      );
    });

    // Environment: Bluetooth
    on('bluetooth', (state, prev) => {
      this.envRenderer.renderBluetooth(state, prev);
    });

    // Video — transform backend state shape to renderer API
    const mapVideoState = (s) => s ? {
      nowPlaying: s.currentVideo?.filename || null,
      isPlaying: s.status === 'playing',
      progress: s.currentVideo?.position || 0,
      duration: s.currentVideo?.duration || 0,
      queue: s.queue,
    } : null;
    on('video', (state, prev) => {
      this.videoRenderer.render(mapVideoState(state), mapVideoState(prev));
    });

    // Spotify
    on('spotify', (state, prev) => {
      this.spotifyRenderer.render(state, prev);
    });

    // Game Clock — map 'status' field to 'state' for SessionRenderer
    on('gameclock', (state, prev) => {
      this.sessionRenderer.renderGameClock(
        { state: state.status || state.state, elapsed: state.elapsed },
        prev ? { state: prev.status || prev.state, elapsed: prev.elapsed } : null
      );
    });

    // Sound playback status
    on('sound', (state) => {
      const container = document.getElementById('sound-status');
      if (!container) return;
      const playing = state?.playing || [];
      if (playing.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
      }
      container.style.display = '';
      const files = playing.map(p => `<span class="sound-playing__file">${escapeHtml(p.file)}</span>`).join(', ');
      container.innerHTML = `<div class="sound-playing">Playing: ${files}</div>`;
    });
  }

  /**
   * Request initial state from backend
   * @private
   */
  _requestInitialState() {
    if (this.client?.socket?.connected) {
      this.client.socket.emit('sync:request');
      Debug.log('[MonitoringDisplay] Requested initial state via sync:request');
    }
  }

  /**
   * Handle incoming WebSocket messages
   *
   * Service state (cue, spotify, environment, video, health, gameclock, held)
   * is handled by service:state → StateStore → store subscriptions → Renderers.
   *
   * This handler processes:
   *   1. session:update → SessionRenderer (session is NOT a store domain)
   *   2. session:overtime → SessionRenderer.renderOvertime (ephemeral)
   *   3. sync:full → system status, team registry, devices
   *   4. Ephemeral notifications (toasts for cue:fired/error)
   *   5. Legacy handlers (display:mode, devices, video queue)
   * @private
   */
  _handleMessage(event) {
    const { type, payload } = event.detail;

    Debug.log(`[MonitoringDisplay] _handleMessage: ${type}`);

    switch (type) {
      // --- Session (not a store domain — UDM/transaction boundary) ---
      case 'session:update':
        this.sessionRenderer.render(payload);
        if (this.teamRegistry) {
          this.teamRegistry.populateFromSession(payload);
        }
        break;

      case 'session:overtime':
        this.sessionRenderer.renderOvertime(payload);
        break;

      case 'sync:full':
        this.updateAllDisplays(payload);
        break;

      case 'device:connected':
      case 'device:disconnected':
        this._updateDeviceList(payload, type);
        break;

      // --- Toast / Ephemeral Notifications ---
      case 'cue:fired':
        this.showToast(`Cue fired: ${payload.cueId}`, 'info', 3000);
        break;

      case 'cue:error':
        this.showToast(`Cue error: ${payload.cueId} — ${payload.error || payload.action}`, 'error', 5000);
        break;

      // --- Legacy handlers ---
      case 'display:mode':
        this._handleDisplayMode(payload);
        break;

    }
  }

  // ============================================
  // LEGACY HANDLERS
  // ============================================

  _updateDeviceList(payload, type) {
    if (type === 'device:connected') {
      const idx = this.devices.findIndex(d => d.deviceId === payload.deviceId);
      if (idx === -1) this.devices.push(payload);
    } else {
      this.devices = this.devices.filter(d => d.deviceId !== payload.deviceId);
    }

    this._renderDeviceList();
  }

  _handleDisplayMode(payload) {
    const nowShowingVal = document.getElementById('now-showing-value');
    const nowShowingIcon = document.getElementById('now-showing-icon');
    const btnIdle = document.getElementById('btn-idle-loop');
    const btnScore = document.getElementById('btn-scoreboard');

    if (payload.mode === 'SCOREBOARD') {
      if (nowShowingVal) nowShowingVal.textContent = 'Scoreboard';
      if (nowShowingIcon) nowShowingIcon.textContent = '\uD83C\uDFC6';
    } else if (payload.mode === 'IDLE_LOOP') {
      if (nowShowingVal) nowShowingVal.textContent = 'Idle Loop';
      if (nowShowingIcon) nowShowingIcon.textContent = '\uD83D\uDD04';
    }
    // VIDEO mode: nowPlaying text handled by VideoRenderer via service:state

    if (btnIdle) btnIdle.classList.toggle('active', payload.mode === 'IDLE_LOOP');
    if (btnScore) btnScore.classList.toggle('active', payload.mode === 'SCOREBOARD');
  }

  // ============================================
  // AGGREGATE UPDATE METHODS
  // ============================================

  /**
   * Initialize displays from sync:full event.
   * Service state (gameclock, cue, spotify, environment, video, health, held)
   * is handled by StateStore subscriptions — sync:full populates the store
   * in networkedSession, which triggers subscriptions automatically.
   *
   * This method handles non-store concerns only:
   * - Session rendering (session is not a store domain)
   * - Team registry population
   * - System status display (connection dot)
   * - Device list
   */
  updateAllDisplays(syncData) {
    if (!syncData) return;

    Debug.log('[MonitoringDisplay] updateAllDisplays (Sync Full)', syncData);

    // Session rendering (not a store domain)
    // Always render — SessionRenderer handles null (shows "No Active Session")
    this.sessionRenderer.render(syncData.session);
    if (syncData.session && this.teamRegistry) {
      this.teamRegistry.populateFromSession(syncData.session);
    }

    // Orchestrator connection dot
    this.updateSystemDisplay();

    // Devices
    if (syncData.devices) {
      this._setDeviceList(syncData.devices);
    }
  }

  /**
   * Set the full list of connected devices
   * @param {Array} devices
   * @private
   */
  _setDeviceList(devices) {
    if (!devices) return;
    this.devices = [...devices];
    this._renderDeviceList();
  }

  _renderDeviceList() {
    const countEl = document.getElementById('device-count');
    const listEl = document.getElementById('device-list');

    if (countEl) countEl.textContent = String(this.devices.length);
    if (listEl) {
      if (this.devices.length === 0) listEl.innerHTML = '<p class="text-muted text-sm">No devices</p>';
      else listEl.innerHTML = this.devices.map(d => `
            <div class="device-item"><span>${escapeHtml(d.deviceId)}</span><span class="device-type">${escapeHtml(d.type)}</span></div>
         `).join('');
    }
  }


  /**
   * Manually refresh all displays from cached data
   */
  refreshAllDisplays() {
    Debug.log('[MonitoringDisplay] refreshAllDisplays called');
    this.updateSystemDisplay();
    this._requestInitialState();
  }

  /**
   * Resume monitoring (socket reconnected)
   */
  resume() {
    console.log('[MonitoringDisplay] Resuming monitoring...');
    this._requestInitialState();
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  updateSystemDisplay() {
    if (!this.client) return;
    const orchestratorElem = document.getElementById('orchestrator-status');
    if (orchestratorElem) {
      const status = this.client.isConnected ? 'connected' : 'disconnected';
      orchestratorElem.className = `status-dot status-dot--${status}`;
      orchestratorElem.title = status;
    }
  }

  showToast(message, type = 'info', duration = 3000) {
    const colors = {
      error: 'var(--color-accent-danger, #dc3545)',
      success: 'var(--color-accent-success, #28a745)',
      warning: 'var(--color-accent-warning, #ffc107)',
      info: 'var(--color-accent-info, #007bff)'
    };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; top: 20px; right: 20px; padding: 12px 20px;
        background: ${colors[type] || colors.info}; color: white;
        border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10000;
      `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  destroy() {
    if (this.client && this._messageHandler) {
      this.client.removeEventListener('message:received', this._messageHandler);
    }
    if (this._storeCallbacks && this.store) {
      for (const { domain, handler } of this._storeCallbacks) {
        this.store.off(domain, handler);
      }
      this._storeCallbacks = null;
    }
    if (this.heldItemsRenderer) {
      this.heldItemsRenderer.destroy();
    }
    if (this.sessionRenderer) {
      this.sessionRenderer.destroy();
    }
    if (this.videoRenderer) {
      this.videoRenderer.destroy();
    }
  }
} // End Class MonitoringDisplay
