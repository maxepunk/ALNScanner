import Debug from '../utils/debug.js';
import { CueRenderer } from '../ui/renderers/CueRenderer.js';
import { EnvironmentRenderer } from '../ui/renderers/EnvironmentRenderer.js';
import { SessionRenderer } from '../ui/renderers/SessionRenderer.js';
import { VideoRenderer } from '../ui/renderers/VideoRenderer.js';
import { SpotifyRenderer } from '../ui/renderers/SpotifyRenderer.js';

export class MonitoringDisplay {
  /**
   * @param {Object} connection - OrchestratorClient instance (EventTarget)
   * @param {Object} dataManager - DataManager instance for cross-view data sync
   * @param {Object} teamRegistry - TeamRegistry instance for team dropdown sync (optional)
   */
  constructor(client, dataManager, teamRegistry = null) {
    this.client = client;
    this.dataManager = dataManager;
    this.teamRegistry = teamRegistry;
    this.devices = [];
    this._currentIdleMode = 'IDLE_LOOP';

    // Renderers
    this.cueRenderer = new CueRenderer();
    this.envRenderer = new EnvironmentRenderer();
    this.sessionRenderer = new SessionRenderer();
    this.videoRenderer = new VideoRenderer();
    this.spotifyRenderer = new SpotifyRenderer();

    // Bind handler for cleanup
    this._messageHandler = this._handleMessage.bind(this);
    this.client.addEventListener('message:received', this._messageHandler);

    // Wire Up DataManager Events
    this._wireDataManagerEvents();

    // Request initial state
    this._requestInitialState();
  }

  /**
   * Wire DataManager events to Renderers
   * @private
   */
  _wireDataManagerEvents() {
    // Cue State
    this.dataManager.addEventListener('cue-state:updated', (e) => this.cueRenderer.render(e.detail));
    this.dataManager.addEventListener('cue:conflict', (e) => this.cueRenderer.renderConflict(e.detail));

    // Environment State
    this.dataManager.addEventListener('lighting-state:updated', (e) => this.envRenderer.renderLighting(e.detail.lighting));
    this.dataManager.addEventListener('audio-state:updated', (e) => this.envRenderer.renderAudio(e.detail.audio));
    this.dataManager.addEventListener('bluetooth-state:updated', (e) => this.envRenderer.renderBluetooth(e.detail.bluetooth));

    // Session State
    this.dataManager.addEventListener('session-state:updated', (e) => {
      this.sessionRenderer.render(e.detail.session);
      // Team Registry sync still needed for dropdowns elsewhere
      if (this.teamRegistry) {
        this.teamRegistry.populateFromSession(e.detail.session);
      }
    });

    // Spotify State
    this.dataManager.addEventListener('spotify-state:updated', (e) => this.spotifyRenderer.render(e.detail));
  }

  /**
   * Request initial state from backend
   * @private
   */
  _requestInitialState() {
    if (this.client?.socket?.connected) {
      this.client.socket.emit('sync:request');
      console.log('[MonitoringDisplay] Requested initial state via sync:request');
    }
  }

  /**
   * Handle incoming WebSocket messages
   * @private
   */
  _handleMessage(event) {
    const { type, payload } = event.detail;

    Debug.log(`[MonitoringDisplay] _handleMessage: ${type}`);

    switch (type) {
      // --- Session & System ---
      case 'session:update':
      case 'session:overtime':
        // DM handles state update, which triggers renderer. 
        // Overtime is distinct.
        if (type === 'session:overtime') {
          this.sessionRenderer.renderOvertime(payload);
        }
        break;

      case 'sync:full':
        this.updateAllDisplays(payload);
        break;

      case 'gameclock:status':
        this.sessionRenderer.renderGameClock(payload);
        break;

      case 'device:connected':
      case 'device:disconnected':
        this._updateDeviceList(payload, type);
        break;

      // --- Renderers handled via DataManager Events ---
      // lighting:*, audio:*, bluetooth:*, cue:* -> Handled by NetworkedSession -> DM -> Event -> Renderer

      // --- Toast / Ephemeral Notifications ---
      case 'cue:fired':
        this.showToast(`Cue fired: ${payload.cueId}`, 'info', 3000);
        break;

      case 'cue:error':
        this.showToast(`Cue error: ${payload.cueId} — ${payload.error || payload.action}`, 'error', 5000);
        break;

      case 'cue:conflict':
        this.showToast(
          `Cue conflict: ${payload.cueId} — ${payload.reason || 'Video conflict'}`,
          'warning',
          10000
        );
        break;

      case 'sound:status':
        // Informational only — no-op for now
        break;

      // --- Legacy handlers awaiting Phase 4 DM migration ---
      case 'display:mode':
        this._handleDisplayMode(payload);
        break;

      case 'video:queue:update':
        this.updateQueueDisplay(payload);
        break;

      // spotify:status — Handled by NetworkedSession → DM.updateSpotifyState() → event → SpotifyRenderer
    }
  }

  // ============================================
  // LEGACY / AD-HOC HANDLERS (To be refactored in Phase 4)
  // ============================================

  _updateDeviceList(payload, type) {
    // Simple local list management for now
    // Phase 4: Move Connected Devices to DM
    if (type === 'device:connected') {
      const idx = this.devices.findIndex(d => d.deviceId === payload.deviceId);
      if (idx === -1) this.devices.push(payload);
    } else {
      this.devices = this.devices.filter(d => d.deviceId !== payload.deviceId);
    }

    this._renderDeviceList();
  }

  _handleDisplayMode(payload) {
    this._currentIdleMode = payload.mode;

    const nowShowingVal = document.getElementById('now-showing-value');
    const nowShowingIcon = document.getElementById('now-showing-icon');
    const btnIdle = document.getElementById('btn-idle-loop');
    const btnScore = document.getElementById('btn-scoreboard');

    if (payload.mode === 'SCOREBOARD') {
      if (nowShowingVal) nowShowingVal.textContent = 'Scoreboard';
      if (nowShowingIcon) nowShowingIcon.textContent = '🏆';
    } else {
      if (nowShowingVal) nowShowingVal.textContent = 'Idle Loop';
      if (nowShowingIcon) nowShowingIcon.textContent = '🔄';
    }

    if (btnIdle) btnIdle.classList.toggle('active', payload.mode === 'IDLE_LOOP');
    if (btnScore) btnScore.classList.toggle('active', payload.mode === 'SCOREBOARD');
  }

  updateQueueDisplay(payload) {
    if (this.videoRenderer) {
      this.videoRenderer.renderQueue(payload.items || []);
    }
  }

  // ============================================
  // AGGREGATE UPDATE METHODS
  // ============================================

  /**
   * Initialize all displays from sync:full event
   * NOTE: DataManager state updates (resetForNewSession, setScannedTokensFromServer)
   * are handled by NetworkedSession global listener
   * 
   * This method now delegates PURELY to Renderers for UI updates.
   */
  updateAllDisplays(syncData) {
    if (!syncData) return;

    Debug.log('[MonitoringDisplay] updateAllDisplays (Sync Full)', syncData);

    // 1. Session State
    // Handled by NetworkedSession → DM.updateSessionState() → 'session-state:updated' event → SessionRenderer
    // No direct rendering needed here.

    // 2. Team Registry (Logic)
    if (syncData.session && this.teamRegistry) {
      this.teamRegistry.populateFromSession(syncData.session);
    }

    // 3. Environment State — handled by NetworkedSession → DataManager → event → renderer
    // NetworkedSession.sync:full handler already calls:
    //   dataManager.updateAudioState(), updateLightingState(), updateBluetoothState()
    // which trigger events → MonitoringDisplay._wireDataManagerEvents() → renderers
    // No direct rendering needed here.

    // 4. Cue Engine (Phase 1 & 2)
    // Handled by NetworkedSession → DM.syncCueState() → 'cue-state:updated' event → CueRenderer
    // No direct rendering needed here.

    // 5. Game Clock
    if (syncData.gameClock) {
      this.sessionRenderer.renderGameClock({
        state: syncData.gameClock.status,
        elapsed: syncData.gameClock.elapsed
      });
    }

    // 6. Spotify
    // Handled by NetworkedSession → DM.updateSpotifyState() → 'spotify-state:updated' event → SpotifyRenderer
    // No direct rendering needed here.

    // 7. System Status
    this.updateSystemDisplay();
    if (syncData.systemStatus?.vlc) {
      const vlcElem = document.getElementById('vlc-status');
      if (vlcElem) {
        vlcElem.className = `status-dot status-dot--${syncData.systemStatus.vlc}`;
      }
    }

    // 8. Legacy / Phase 4 TODOs
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

    // DRY: reuse the rendering logic from _updateDeviceList
    // Ideally we should extract the rendering to a separate method, 
    // but for this fix we'll just duplicate the render block or call a render method.
    this._renderDeviceList();
  }

  _renderDeviceList() {
    const countEl = document.getElementById('device-count');
    const listEl = document.getElementById('device-list');

    if (countEl) countEl.textContent = String(this.devices.length);
    if (listEl) {
      if (this.devices.length === 0) listEl.innerHTML = '<p class="text-muted text-sm">No devices</p>';
      else listEl.innerHTML = this.devices.map(d => `
            <div class="device-item"><span>${d.deviceId}</span><span class="device-type">${d.type}</span></div>
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
    // Keep toast logic
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
  }
} // End Class MonitoringDisplay
