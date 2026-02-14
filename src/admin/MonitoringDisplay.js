/**
 * MonitoringDisplay - Event-Driven DOM Updates
 * Listens to WebSocket events and updates admin panel UI
 *
 * User Stories:
 * - GM sees real-time transaction log updates
 * - GM sees team scores update after each scan
 * - GM sees session status (active/paused/ended)
 * - GM sees video playback progress
 * - GM sees connected devices list
 * - GM sees system health indicators
 *
 * Architecture:
 * - Listens to WebSocket broadcasts via EventTarget pattern
 * - Updates DOM elements directly (admin panel specific)
 * - Coordinates with DataManager for scanner view updates
 *
 * @module admin/MonitoringDisplay
 */

import Debug from '../utils/debug.js';

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
    this.overtimeData = null;
    this._currentSession = null;

    // Display mode state (Phase 4.2)
    this.isVideoPlaying = false;
    this.currentIdleMode = 'IDLE_LOOP';

    // Bind handler for cleanup
    this._messageHandler = this._handleMessage.bind(this);
    this.client.addEventListener('message:received', this._messageHandler);

    // Load available videos for manual queue dropdown
    this.loadAvailableVideos();

    // Request initial state to eliminate race condition
    this._requestInitialState();
  }

  /**
   * Request initial state from backend
   * @private
   */
  _sendMessage(type, payload) {
    if (this.client?.socket?.connected) {
      this.client.socket.emit(type, payload);
    } else {
      console.warn('[MonitoringDisplay] Cannot send message - disconnected');
    }
  }

  /**
   * Request initial state from backend
   * @private
   */
  _requestInitialState() {
    if (this.client?.socket?.connected) {
      this.client.socket.emit('sync:request');
      console.log('[MonitoringDisplay] Requested initial state via sync:request');
    } else {
      console.warn('[MonitoringDisplay] Cannot request state - socket not connected');
    }
  }

  /**
   * Handle incoming WebSocket messages
   * Routes to appropriate display update method
   * @private
   */
  _handleMessage(event) {
    const { type, payload } = event.detail;

    Debug.log(`[MonitoringDisplay] _handleMessage called: ${type}`);

    switch (type) {
      case 'transaction:new':
        this._handleTransactionNew(payload);
        break;

      case 'score:updated':
        this._handleScoreUpdated(payload);
        break;

      case 'session:update':
        this._handleSessionUpdate(payload);
        break;

      case 'session:overtime':
        this._handleSessionOvertime(payload);
        break;

      case 'video:status':
        this.updateVideoDisplay(payload);
        break;

      case 'display:mode':
        this._handleDisplayMode(payload);
        break;

      case 'video:progress':
        this.updateVideoProgress(payload);
        break;

      case 'video:queue:update':
        this.updateQueueDisplay(payload);
        break;

      case 'device:connected':
        this._handleDeviceConnected(payload);
        break;

      case 'device:disconnected':
        this._handleDeviceDisconnected(payload);
        break;

      case 'scores:reset':
        this._handleScoresReset();
        break;

      case 'transaction:deleted':
        this._handleTransactionDeleted(payload);
        break;

      case 'bluetooth:device':
        this._handleBluetoothDevice(payload);
        break;

      case 'bluetooth:scan':
        this._handleBluetoothScan(payload);
        break;

      case 'audio:routing':
        this._handleAudioRouting(payload);
        break;

      case 'audio:routing:fallback':
        this._handleAudioFallback(payload);
        break;

      case 'lighting:scene':
        this._handleLightingScene(payload);
        break;

      case 'lighting:status':
        this._handleLightingStatus(payload);
        break;

      case 'gameclock:status':
        this._updateGameClockDisplay(payload);
        break;

      case 'cue:fired':
        this._handleCueFired(payload);
        break;

      case 'cue:completed':
        this._handleCueCompleted(payload);
        break;

      case 'cue:error':
        this._handleCueError(payload);
        break;

      case 'sound:status':
        this._handleSoundStatus(payload);
        break;

      case 'sync:full':
        this.updateAllDisplays(payload);
        break;

      case 'gm:command:ack':
        // Fallback: If display:mode event is missed, update UI based on ACK
        if (payload.success && payload.action) {
          if (payload.action === 'display:scoreboard') {
            this._handleDisplayMode({ mode: 'SCOREBOARD' });
          } else if (payload.action === 'display:idle-loop') {
            this._handleDisplayMode({ mode: 'IDLE_LOOP' });
          }
        }
        break;
    }
  }

  // ============================================
  // MESSAGE HANDLERS
  // ============================================

  _handleTransactionNew(payload) {
    if (payload?.transaction) {
      Debug.log('[MonitoringDisplay] transaction:new received (UI updates via ScreenUpdateManager)');
      // NOTE: DataManager state update is handled by NetworkedSession global listener
      // NOTE: Game Activity UI updates are handled by ScreenUpdateManager container handlers
      // This method is now a no-op - the transaction:added event from DataManager triggers UI updates
    }
  }

  _handleScoreUpdated(payload) {
    Debug.log('[MonitoringDisplay] Score updated event received');
    // NOTE: DataManager state update is handled by NetworkedSession global listener
    // NOTE: Scoreboard UI updates are handled by container handlers in ScreenUpdateManager
    // This method is now a no-op for score display (UI handled elsewhere)
  }

  _handleSessionUpdate(payload) {
    // Update session display UI
    this.updateSessionDisplay(payload);

    // Update TeamRegistry with latest teams from session (enables cross-GM team sync)
    if (this.teamRegistry) {
      this.teamRegistry.populateFromSession(payload);
    }

    // Handle UI-specific session lifecycle transitions
    // NOTE: DataManager state updates (resetForNewSession) are handled by NetworkedSession global listener
    if (payload.status === 'ended') {
      Debug.log('[MonitoringDisplay] Session ended, clearing admin panel displays');
      this.overtimeData = null;
      this._clearAdminPanelDisplays();
    } else if (payload.status === 'active') {
      // Request fresh state from server to populate UI with new session data
      this.overtimeData = null;
      this._requestInitialState();
    }
  }

  /**
   * Clear admin panel displays (game activity, score board)
   * Called when session ends to ensure no stale data shown
   * @private
   */
  _clearAdminPanelDisplays() {
    const gameActivity = document.getElementById('admin-game-activity');
    if (gameActivity) gameActivity.innerHTML = '';

    const scoreBoard = document.getElementById('admin-score-board');
    if (scoreBoard) scoreBoard.innerHTML = '';

    Debug.log('[MonitoringDisplay] Admin panel displays cleared');
  }

  _handleSessionOvertime(payload) {
    Debug.log('[MonitoringDisplay] Session overtime warning received:', payload);
    this.overtimeData = payload;
    this.updateSessionDisplay(this._currentSession || payload);
  }

  _handleDeviceConnected(payload) {
    // Prevent duplicates (idempotent)
    const existingIndex = this.devices.findIndex(d => d.deviceId === payload.deviceId);
    if (existingIndex === -1) {
      this.devices.push(payload);
    }
    this.updateDeviceList(this.devices);
    this.updateSystemDisplay();
  }

  _handleDeviceDisconnected(payload) {
    this.devices = this.devices.filter(d => d.deviceId !== payload.deviceId);
    this.updateDeviceList(this.devices);
    this.updateSystemDisplay();
  }

  _handleScoresReset() {
    Debug.log('[MonitoringDisplay] Scores reset broadcast received');
    // NOTE: DataManager state update is handled by NetworkedSession global listener
    // NOTE: Scoreboard UI updates are handled by container handlers in ScreenUpdateManager
    // Admin panel clearing is handled by container handler 'scores:cleared' event
  }

  _handleTransactionDeleted(payload) {
    Debug.log('[MonitoringDisplay] Transaction deleted:', payload?.transactionId);
    // NOTE: DataManager state update is handled by NetworkedSession global listener

    // Remove from admin panel transaction log (UI-only update)
    const transactionLog = document.getElementById('admin-transaction-log');
    if (transactionLog && payload?.transactionId) {
      const txElement = transactionLog.querySelector(`[data-transaction-id="${payload.transactionId}"]`);
      if (txElement) txElement.remove();
    }
  }

  /**
   * Handle display:mode event (Phase 4.2)
   * Updates "Now Showing" display and idle mode toggle buttons
   * @private
   */
  _handleDisplayMode(payload) {
    if (!payload?.mode) return;

    const nowShowingValue = document.getElementById('now-showing-value');
    const nowShowingIcon = document.getElementById('now-showing-icon');
    const returnsToContainer = document.getElementById('returns-to-container');
    const btnIdleLoop = document.getElementById('btn-idle-loop');
    const btnScoreboard = document.getElementById('btn-scoreboard');

    // Update toggle button states
    btnIdleLoop?.classList.toggle('active', payload.mode === 'IDLE_LOOP');
    btnScoreboard?.classList.toggle('active', payload.mode === 'SCOREBOARD');

    // Store current idle mode for "returns to" display
    this.currentIdleMode = payload.mode;

    // Update display if no video playing
    if (!this.isVideoPlaying) {
      if (payload.mode === 'IDLE_LOOP') {
        if (nowShowingValue) nowShowingValue.textContent = 'Idle Loop';
        if (nowShowingIcon) nowShowingIcon.textContent = '🔄';
      } else if (payload.mode === 'SCOREBOARD') {
        if (nowShowingValue) nowShowingValue.textContent = 'Scoreboard';
        if (nowShowingIcon) nowShowingIcon.textContent = '🏆';
      }
      if (returnsToContainer) returnsToContainer.style.display = 'none';
    }

    Debug.log(`[MonitoringDisplay] Display mode updated: ${payload.mode}`);
  }

  // ============================================
  // ENVIRONMENT CONTROL HANDLERS
  // ============================================

  /**
   * Handle bluetooth device state change
   * Backend payload shape: { type: 'connected'|'disconnected'|'paired'|'unpaired'|'discovered', device: { address, name } }
   * @param {Object} payload
   */
  _handleBluetoothDevice(payload) {
    if (!payload) return;
    const { type, device } = payload;
    if (!device?.address) return;
    Debug.log(`[MonitoringDisplay] bluetooth:device: ${type} ${device.address}`);

    const list = document.getElementById('bt-device-list');
    if (!list) return;

    if (type === 'paired' || type === 'connected') {
      // Add or update device in list
      let item = list.querySelector(`[data-bt-address="${device.address}"]`);
      if (!item) {
        item = document.createElement('div');
        item.className = 'bt-device-item';
        item.dataset.btAddress = device.address;
        list.appendChild(item);
      }
      const isConnected = type === 'connected';
      item.className = isConnected ? 'bt-device-item bt-device-item--connected' : 'bt-device-item';
      item.innerHTML = `
        <span class="bt-device-name">${this.escapeHtml(device.name || device.address)}</span>
        <span class="bt-device-status">${isConnected ? 'Connected' : 'Paired'}</span>
      `;
    } else if (type === 'disconnected') {
      const item = list.querySelector(`[data-bt-address="${device.address}"]`);
      if (item) {
        item.className = 'bt-device-item';
        const statusEl = item.querySelector('.bt-device-status');
        if (statusEl) statusEl.textContent = 'Paired';
      }
    } else if (type === 'unpaired') {
      const item = list.querySelector(`[data-bt-address="${device.address}"]`);
      if (item) item.remove();
    }
    // 'discovered' events are intentionally ignored in Phase 0 — future scan results UI

    this._updateBtSpeakerCount();
  }

  /**
   * Handle bluetooth scan state change
   * Backend payload shape: { scanning: boolean, timeout?, exitCode? }
   * @param {Object} payload
   */
  _handleBluetoothScan(payload) {
    if (!payload) return;
    Debug.log(`[MonitoringDisplay] bluetooth:scan: scanning=${payload.scanning}`);

    const scanBtn = document.getElementById('btn-bt-scan');
    const scanSpinner = document.getElementById('bt-scan-status');

    if (payload.scanning) {
      if (scanBtn) {
        scanBtn.textContent = 'Stop Scan';
        scanBtn.dataset.action = 'admin.stopBtScan';
      }
      if (scanSpinner) scanSpinner.style.display = 'inline-block';
    } else {
      if (scanBtn) {
        scanBtn.textContent = 'Scan for Speakers';
        scanBtn.dataset.action = 'admin.startBtScan';
      }
      if (scanSpinner) scanSpinner.style.display = 'none';
    }
  }

  /**
   * Handle audio routing change
   * @param {Object} payload - { stream, sink, sinkType? }
   *   routing:changed sends { stream, sink } (user's literal input)
   *   routing:applied sends { stream, sink, sinkType } (resolved)
   */
  _handleAudioRouting(payload) {
    if (!payload) return;
    Debug.log(`[MonitoringDisplay] audio:routing: ${payload.stream} -> ${payload.sink} (type: ${payload.sinkType || 'unknown'})`);

    // Use sinkType when available (from routing:applied), fall back to sink name
    const isBluetooth = payload.sinkType
      ? payload.sinkType === 'bluetooth'
      : payload.sink === 'bluetooth';

    // Update radio button selection
    const radios = document.querySelectorAll('input[name="audioOutput"]');
    radios.forEach(radio => {
      radio.checked = radio.value === (isBluetooth ? 'bluetooth' : 'hdmi');
    });

    // Hide fallback warning when routing succeeds
    const btWarning = document.getElementById('bt-warning');
    if (btWarning) btWarning.style.display = 'none';
  }

  /**
   * Handle audio fallback to HDMI
   * @param {Object} payload - { stream, reason, sink }
   */
  _handleAudioFallback(payload) {
    if (!payload) return;
    Debug.log(`[MonitoringDisplay] audio:routing:fallback: ${payload.reason}`);

    // Show warning toast
    const btWarning = document.getElementById('bt-warning');
    if (btWarning) {
      btWarning.textContent = `Audio fell back to HDMI: ${payload.reason || 'unknown'}`;
      btWarning.style.display = 'block';
    }

    // Reset radio to HDMI
    const hdmiRadio = document.querySelector('input[name="audioOutput"][value="hdmi"]');
    if (hdmiRadio) hdmiRadio.checked = true;
  }

  /**
   * Handle lighting scene activated
   * @param {Object} payload - { sceneId }
   */
  _handleLightingScene(payload) {
    if (!payload) return;
    Debug.log(`[MonitoringDisplay] lighting:scene: ${payload.sceneId}`);

    const tiles = document.querySelectorAll('.scene-tile');
    tiles.forEach(tile => {
      tile.classList.toggle('scene-tile--active', tile.dataset.sceneId === payload.sceneId);
    });
  }

  /**
   * Handle lighting status update (connection change or scene refresh)
   * @param {Object} payload - { connected, scenes, activeScene }
   */
  _handleLightingStatus(payload) {
    if (!payload) return;
    Debug.log(`[MonitoringDisplay] lighting:status: connected=${payload.connected}`);

    const lightingSection = document.getElementById('lighting-section');
    const notConnected = document.getElementById('lighting-not-connected');
    const sceneGrid = document.getElementById('lighting-scenes');

    // Show the lighting section once we receive any status event
    if (lightingSection) lightingSection.style.display = '';

    if (!payload.connected) {
      if (notConnected) notConnected.style.display = 'block';
      if (sceneGrid) sceneGrid.style.display = 'none';
      return;
    }

    if (notConnected) notConnected.style.display = 'none';
    if (sceneGrid) sceneGrid.style.display = 'grid';

    // Rebuild scene grid if scenes provided
    if (payload.scenes && sceneGrid) {
      sceneGrid.innerHTML = payload.scenes.map(scene => {
        const isActive = scene.id === payload.activeScene;
        return `<button class="scene-tile ${isActive ? 'scene-tile--active' : ''}"
                        data-scene-id="${this.escapeHtml(scene.id)}"
                        data-action="admin.activateScene">
                  ${this.escapeHtml(scene.name)}
                </button>`;
      }).join('');
    }
  }

  /**
   * Update BT speaker count badge
   * @private
   */
  _updateBtSpeakerCount() {
    const list = document.getElementById('bt-device-list');
    const badge = document.getElementById('bt-speaker-count');
    if (list && badge) {
      const count = list.querySelectorAll('.bt-device-item').length;
      badge.textContent = count > 0 ? String(count) : '';
    }
  }

  // ============================================
  // PHASE 1: CUE ENGINE - SHOW CONTROL RENDERING
  // ============================================

  /**
   * Render Quick Fire grid from cue data
   * @param {Array} cues - Cue objects from cueEngine
   * @private
   */
  _renderQuickFireGrid(cues) {
    const grid = document.getElementById('quick-fire-grid');
    if (!grid) return;

    const quickFireCues = cues.filter(cue => cue.quickFire === true);

    if (quickFireCues.length === 0) {
      grid.innerHTML = '<p class="empty-state">No Quick Fire cues available</p>';
      return;
    }

    grid.innerHTML = quickFireCues.map(cue => `
      <button
        class="cue-tile cue-tile--${cue.icon || 'default'}"
        data-action="admin.fireCue"
        data-cue-id="${this.escapeHtml(cue.id)}"
        title="${this.escapeHtml(cue.label || cue.id)}"
      >
        <span class="cue-tile__icon cue-icon--${cue.icon || 'default'}"></span>
        <span class="cue-tile__label">${this.escapeHtml(cue.label || cue.id)}</span>
      </button>
    `).join('');
  }

  /**
   * Render Standing Cues list from cue data
   * @param {Array} cues - Cue objects from cueEngine
   * @param {Array} disabledCues - Array of disabled cue IDs
   * @private
   */
  _renderStandingCuesList(cues, disabledCues = []) {
    const list = document.getElementById('standing-cues-list');
    if (!list) return;

    const standingCues = cues.filter(cue => cue.trigger && !cue.quickFire);

    if (standingCues.length === 0) {
      list.innerHTML = '<p class="empty-state">No standing cues configured</p>';
      return;
    }

    list.innerHTML = standingCues.map(cue => {
      const isDisabled = disabledCues.includes(cue.id) || cue.enabled === false;
      const statusClass = isDisabled ? 'standing-cue-item--disabled' : 'standing-cue-item--enabled';

      return `
        <div class="standing-cue-item ${statusClass}">
          <div class="standing-cue-item__info">
            <span class="standing-cue-item__label">${this.escapeHtml(cue.label || cue.id)}</span>
            <span class="standing-cue-item__trigger">${this.escapeHtml(cue.trigger)}</span>
          </div>
          <div class="standing-cue-item__actions">
            ${isDisabled ?
              `<button class="btn btn-sm btn-success" data-action="admin.enableCue" data-cue-id="${this.escapeHtml(cue.id)}">Enable</button>` :
              `<button class="btn btn-sm btn-secondary" data-action="admin.disableCue" data-cue-id="${this.escapeHtml(cue.id)}">Disable</button>`
            }
          </div>
        </div>
      `;
    }).join('');
  }

  // ============================================
  // PHASE 1: CUE ENGINE & GAME CLOCK HANDLERS
  // ============================================

  /**
   * Update game clock display from gameclock:status event
   * @param {Object} payload - {state: 'running'|'paused'|'stopped', elapsed: seconds}
   * @private
   */
  _updateGameClockDisplay(payload) {
    const clockDisplay = document.getElementById('game-clock-display');
    if (!clockDisplay) return;

    const { state, elapsed } = payload;
    const formattedTime = this.formatDuration(elapsed);

    clockDisplay.textContent = formattedTime;

    // Update clock state styling
    clockDisplay.classList.remove('clock-running', 'clock-paused', 'clock-stopped');
    clockDisplay.classList.add(`clock-${state}`);
  }

  /**
   * Handle cue:fired event - show toast notification
   * @param {Object} payload - {cueId, trigger, source}
   * @private
   */
  _handleCueFired(payload) {
    const { cueId, trigger } = payload;
    const message = `Cue Fired: ${cueId}${trigger ? ` (${trigger})` : ''}`;
    this.showToast(message, 'info', 3000);
  }

  /**
   * Handle cue:completed event (silent acknowledgment)
   * @param {Object} payload - {cueId}
   * @private
   */
  _handleCueCompleted(payload) {
    // Cue completion is logged but not shown to user
    Debug.log(`[MonitoringDisplay] Cue completed: ${payload.cueId}`);
  }

  /**
   * Handle cue:error event - show error toast
   * @param {Object} payload - {cueId, action, position, error}
   * @private
   */
  _handleCueError(payload) {
    const { cueId, action, error } = payload;
    const message = `Cue Error: ${cueId} - ${action} failed: ${error}`;
    this.showToast(message, 'error', 5000);
  }

  /**
   * Handle sound:status event - update sound playback indicator
   * @param {Object} payload - {playing: [{file, target, volume, pid}, ...]}
   * @private
   */
  _handleSoundStatus(payload) {
    // Sound status is informational - can be used for future sound indicator UI
    Debug.log(`[MonitoringDisplay] Sound status update:`, payload);
  }

  // ============================================
  // DISPLAY UPDATE METHODS
  // ============================================

  /**
   * Update transaction log display
   */
  updateTransactionDisplay(transaction) {
    if (!transaction) return;

    const transactionLog = document.getElementById('admin-transaction-log');
    if (!transactionLog) return;

    const txTime = transaction.timestamp ? new Date(transaction.timestamp).toLocaleTimeString() : '-';
    const memoryType = transaction.memoryType || 'UNKNOWN';
    const isDuplicate = transaction.status === 'duplicate';
    const duplicateClass = isDuplicate ? ' duplicate' : '';
    const duplicateBadge = isDuplicate ? ' <span class="duplicate-badge-small">DUP</span>' : '';

    const txHtml = `
      <div class="transaction-item${duplicateClass}" data-transaction-id="${transaction.id || ''}">
        <span class="tx-time">${txTime}</span>
        <span class="tx-team">${transaction.teamId || '-'}</span>
        <span class="tx-token">${transaction.tokenId || '-'}${duplicateBadge}</span>
        <span class="tx-type">${memoryType}</span>
      </div>
    `;

    // Prepend new transaction (most recent first)
    transactionLog.innerHTML = txHtml + transactionLog.innerHTML;

    // Keep only last 10 transactions
    const items = transactionLog.querySelectorAll('.transaction-item');
    if (items.length > 10) {
      for (let i = 10; i < items.length; i++) {
        items[i].remove();
      }
    }
  }

  /**
   * Update device list display
   */
  updateDeviceList(devices) {
    if (!Array.isArray(devices)) return;

    this.devices = devices;

    const countElement = document.getElementById('device-count');
    const listElement = document.getElementById('device-list');

    if (countElement) {
      countElement.textContent = String(devices.length);
    }

    if (listElement) {
      if (devices.length === 0) {
        listElement.innerHTML = '<p class="text-muted text-sm">No devices connected</p>';
      } else {
        listElement.innerHTML = devices.map(device => `
          <div class="device-item">
            <span>${device.deviceId || 'Unknown'}</span>
            <span class="device-type">${device.type || '-'}</span>
          </div>
        `).join('');
      }
    }
  }

  // NOTE: updateScoreDisplay() has been removed
  // Scoreboard updates are now handled by:
  // 1. NetworkedSession global listener updates DataManager.backendScores
  // 2. DataManager emits 'team-score:updated'
  // 3. ScreenUpdateManager container handlers render to #admin-score-board

  /**
   * Update session display with rich status UI
   * Renders different UI for each session state: null, active, paused, ended
   */
  updateSessionDisplay(session) {
    const container = document.getElementById('session-status-container');
    if (!container) {
      Debug.log('session-status-container not found in DOM', true);
      return;
    }

    this._currentSession = session;

    // No session state
    if (!session) {
      container.innerHTML = this._renderNoSession();
      return;
    }

    // Ended session state
    if (session.status === 'ended') {
      container.innerHTML = this._renderEndedSession(session);
      return;
    }

    // Setup session state (Phase 1: before game starts)
    if (session.status === 'setup') {
      container.innerHTML = this._renderSetupSession(session);
      return;
    }

    // Paused session state
    if (session.status === 'paused') {
      container.innerHTML = this._renderPausedSession(session);
      return;
    }

    // Active session state (default)
    container.innerHTML = this._renderActiveSession(session);
  }

  _renderNoSession() {
    return `
      <div class="session-status session-status--empty">
        <p class="session-status__message">No Active Session</p>
        <p class="session-status__hint">Create a new session to begin tracking gameplay</p>
        <button class="btn btn-primary" data-action="app.adminCreateSession">
          Create New Session
        </button>
      </div>
    `;
  }

  _renderEndedSession(session) {
    const endTime = session.endTime ? new Date(session.endTime).toLocaleString() : 'Unknown';
    const duration = session.getDuration ? this.formatDuration(session.getDuration()) : 'Unknown';

    return `
      <div class="session-status session-status--ended">
        <h4 class="session-status__header">
          <span class="session-status__icon">⚠️</span>
          <span>Previous Session Ended</span>
        </h4>
        <div class="session-status__details">
          <p class="session-status__name">${this.escapeHtml(session.name || 'Unnamed Session')}</p>
          <p class="session-status__meta">Ended: ${this.escapeHtml(endTime)}</p>
          <p class="session-status__meta">Duration: ${this.escapeHtml(duration)}</p>
          <p class="session-status__meta">Total Scans: ${session.metadata?.totalScans || 0}</p>
        </div>
        <div class="session-status__actions">
          <button class="btn btn-primary" data-action="app.adminResetAndCreateNew">
            Reset & Start New Session
          </button>
          <button class="btn btn-secondary" data-action="app.adminViewSessionDetails">
            View Details
          </button>
        </div>
        <p class="session-status__tip">💡 Start a new session to continue gameplay</p>
      </div>
    `;
  }

  _renderPausedSession(session) {
    const startTime = session.startTime ? new Date(session.startTime).toLocaleString() : 'Unknown';

    return `
      <div class="session-status session-status--paused">
        <h4 class="session-status__header">
          <span class="session-status__icon">⏸️</span>
          <span>Session Paused</span>
        </h4>
        <div class="session-status__details">
          <p class="session-status__name">${this.escapeHtml(session.name || 'Session')}</p>
          <p class="session-status__meta">Started: ${this.escapeHtml(startTime)}</p>
          <p class="session-status__meta">Scans: ${session.metadata?.totalScans || 0}</p>
        </div>
        <div class="session-status__actions">
          <button class="btn btn-primary" data-action="app.adminResumeSession">
            Resume Session
          </button>
          <button class="btn btn-danger" data-action="app.adminEndSession">
            End Session
          </button>
        </div>
      </div>
    `;
  }

  _renderSetupSession(session) {
    const createdTime = session.createdAt ? new Date(session.createdAt).toLocaleString() : 'Unknown';
    const teamCount = session.teams?.length || 0;

    return `
      <div class="session-status session-status--setup">
        <h4 class="session-status__header">
          <span class="session-status__icon">🎬</span>
          <span>Session Ready</span>
        </h4>
        <div class="session-status__details">
          <p class="session-status__name">${this.escapeHtml(session.name || 'Session')}</p>
          <p class="session-status__meta">Created: ${this.escapeHtml(createdTime)}</p>
          <p class="session-status__meta">Teams: ${teamCount}</p>
          <p class="session-status__hint">Ready to start the game</p>
        </div>
        <div class="session-status__actions">
          <button class="btn btn-success" data-action="admin.startGame">
            🚀 Start Game
          </button>
          <button class="btn btn-danger" data-action="app.adminEndSession">
            Cancel Session
          </button>
        </div>
      </div>
    `;
  }

  _renderActiveSession(session) {
    const startTime = session.startTime ? new Date(session.startTime).toLocaleString() : 'Unknown';
    const totalScans = session.metadata?.totalScans || 0;

    // Build overtime warning if applicable
    let overtimeHtml = '';
    if (this.overtimeData) {
      const expectedMin = this.overtimeData.expectedDuration || 120;
      const actualMin = this.overtimeData.actualDuration || expectedMin;
      const overtimeMin = this.overtimeData.overtimeDuration || 0;

      overtimeHtml = `
        <div class="session-overtime-warning">
          <div class="session-overtime-warning__content">
            <span class="session-overtime-warning__icon">⚠️</span>
            <div class="session-overtime-warning__text">
              <strong>Session Running Overtime</strong>
              <p>Expected: ${expectedMin} min | Actual: ${actualMin} min | Overtime: <strong>${overtimeMin} min</strong></p>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="session-status session-status--active">
        <h4 class="session-status__header">
          <span class="session-status__icon">✅</span>
          <span>${this.escapeHtml(session.name || 'Active Session')}</span>
        </h4>
        ${overtimeHtml}
        <div class="session-status__details">
          <p class="session-status__meta">Started: ${this.escapeHtml(startTime)}</p>
          <p class="session-status__meta">Total Scans: ${totalScans}</p>
          <p class="session-status__meta">
            Game Clock: <span id="game-clock-display" class="game-clock">00:00:00</span>
          </p>
          <p class="session-status__meta">Status: <span class="status-active">Active</span></p>
        </div>
        <div class="session-status__actions">
          <button class="btn btn-secondary" data-action="app.adminPauseSession">
            Pause
          </button>
          <button class="btn btn-danger" data-action="app.adminEndSession">
            End Session
          </button>
        </div>
      </div>
    `;
  }

  // ============================================
  // VIDEO DISPLAY METHODS
  // ============================================

  /**
   * Update video display status
   * Also updates "Now Showing" display for Phase 4.2 integration
   */
  updateVideoDisplay(videoStatus) {
    if (!videoStatus) return;

    const currentVideoElem = document.getElementById('admin-current-video');
    const queueLengthElem = document.getElementById('admin-queue-length');

    // Phase 4.2: Integrated display status elements
    const nowShowingValue = document.getElementById('now-showing-value');
    const nowShowingIcon = document.getElementById('now-showing-icon');
    const returnsToContainer = document.getElementById('returns-to-container');
    const returnsToMode = document.getElementById('returns-to-mode');
    const pendingQueueCount = document.getElementById('pending-queue-count');

    if (currentVideoElem) {
      if (videoStatus.status === 'playing' && videoStatus.tokenId) {
        const progress = videoStatus.progress || 0;
        currentVideoElem.textContent = `${videoStatus.tokenId} (${progress}%)`;
      } else {
        currentVideoElem.textContent = videoStatus.tokenId || 'None (idle loop)';
      }
    }

    if (queueLengthElem) {
      queueLengthElem.textContent = String(videoStatus.queueLength || 0);
    }

    // Phase 4.2: Update integrated display status
    if (pendingQueueCount) {
      pendingQueueCount.textContent = String(videoStatus.queueLength || 0);
    }

    if (videoStatus.status === 'playing' && videoStatus.tokenId) {
      // Video is playing - update "Now Showing" to show video
      this.isVideoPlaying = true;
      if (nowShowingValue) nowShowingValue.textContent = `${videoStatus.tokenId}.mp4`;
      if (nowShowingIcon) nowShowingIcon.textContent = '▶️';
      if (returnsToContainer) returnsToContainer.style.display = 'block';
      if (returnsToMode) {
        returnsToMode.textContent = this.currentIdleMode === 'SCOREBOARD' ? 'Scoreboard' : 'Idle Loop';
      }
    } else if (videoStatus.status === 'idle') {
      // Video ended - restore idle mode display
      this.isVideoPlaying = false;
      if (this.currentIdleMode === 'SCOREBOARD') {
        if (nowShowingValue) nowShowingValue.textContent = 'Scoreboard';
        if (nowShowingIcon) nowShowingIcon.textContent = '🏆';
      } else {
        if (nowShowingValue) nowShowingValue.textContent = 'Idle Loop';
        if (nowShowingIcon) nowShowingIcon.textContent = '🔄';
      }
      if (returnsToContainer) returnsToContainer.style.display = 'none';
    }
  }

  /**
   * Update video progress bar (called every 1s during playback)
   */
  updateVideoProgress(progressData) {
    if (!progressData) return;

    const currentVideoElem = document.getElementById('admin-current-video');
    const progressContainer = document.getElementById('video-progress-container');
    const progressFill = document.getElementById('video-progress-fill');
    const progressTime = document.getElementById('video-progress-time');

    if (currentVideoElem && progressData.tokenId && progressData.progress !== undefined) {
      const progress = Math.round(progressData.progress);
      const position = Math.round(progressData.position);
      const duration = Math.round(progressData.duration);
      currentVideoElem.textContent = `${progressData.tokenId} (${progress}% - ${position}s/${duration}s)`;

      if (progressContainer) progressContainer.style.display = 'block';
      if (progressFill) progressFill.style.width = `${progress}%`;
      if (progressTime) progressTime.textContent = `${position}s / ${duration}s`;
    } else {
      if (progressContainer) progressContainer.style.display = 'none';
    }
  }

  /**
   * Update queue display
   */
  updateQueueDisplay(queueData) {
    if (!queueData) return;

    const container = document.getElementById('video-queue-container');
    const list = document.getElementById('video-queue-list');
    const count = document.getElementById('queue-count');

    if (!container || !list || !count) return;

    if (!queueData.items || queueData.items.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    count.textContent = queueData.items.length;
    list.innerHTML = queueData.items.map((item, idx) => `
      <div class="queue-item">
        <span class="queue-item__index">${idx + 1}.</span>
        <span class="queue-item__name">${item.tokenId}</span>
        <span class="queue-item__duration">(${item.duration}s)</span>
      </div>
    `).join('');
  }

  /**
   * Load available videos from server for dropdown
   */
  async loadAvailableVideos() {
    try {
      const baseUrl = this.client?.config?.url || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/tokens`);
      const data = await response.json();

      const datalist = document.getElementById('available-videos');
      if (!datalist) return;

      const videoOptions = Object.entries(data.tokens)
        .filter(([, token]) => token.video)
        .map(([id, token]) => `<option value="${token.video}">${id} - ${token.video}</option>`)
        .join('');

      datalist.innerHTML = videoOptions;
      Debug.log(`Loaded video options: ${Object.keys(data.tokens).filter(id => data.tokens[id].video).length}`);
    } catch (error) {
      Debug.log(`Failed to load available videos: ${error.message}`, true);
    }
  }

  // ============================================
  // SYSTEM DISPLAY METHODS
  // ============================================

  /**
   * Update system status display
   */
  updateSystemDisplay() {
    if (!this.client) return;

    const orchestratorElem = document.getElementById('orchestrator-status');
    if (orchestratorElem) {
      const status = this.client.isConnected ? 'connected' : 'disconnected';
      orchestratorElem.className = `status-dot status-dot--${status}`;
      orchestratorElem.title = status;
    }
  }

  // ============================================
  // AGGREGATE UPDATE METHODS
  // ============================================

  /**
   * Initialize all displays from sync:full event
   * NOTE: DataManager state updates (resetForNewSession, setScannedTokensFromServer)
   * are handled by NetworkedSession global listener
   */
  updateAllDisplays(syncData) {
    if (!syncData) return;

    // Update session display (UI only)
    this.updateSessionDisplay(syncData.session || null);

    // Update TeamRegistry from session data (enables cross-GM team sync on connect)
    if (syncData.session && this.teamRegistry) {
      this.teamRegistry.populateFromSession(syncData.session);
    }

    // Update video
    if (syncData.videoStatus) {
      this.updateVideoDisplay(syncData.videoStatus);
    }

    // NOTE: Score state updates are handled by NetworkedSession global listener
    // NOTE: Scoreboard UI updates are handled by container handlers in ScreenUpdateManager

    // Update transactions - UI only (state handled by NetworkedSession)
    if (syncData.recentTransactions && Array.isArray(syncData.recentTransactions)) {
      // NOTE: DataManager.addTransaction is handled by NetworkedSession global listener
      // Here we only update the admin panel UI
      const transactionLog = document.getElementById('admin-transaction-log');
      if (transactionLog) {
        transactionLog.innerHTML = '';
        const recent = syncData.recentTransactions.slice(-10).reverse();
        recent.forEach(tx => this.updateTransactionDisplay(tx));
      }
    }

    // Update VLC status
    if (syncData.systemStatus) {
      const vlcElement = document.getElementById('vlc-status');
      if (vlcElement) {
        const vlcStatus = syncData.systemStatus.vlc;
        vlcElement.className = `status-dot status-dot--${vlcStatus === 'connected' ? 'connected' : 'disconnected'}`;
        vlcElement.title = vlcStatus;
      }
    }

    // Update devices
    if (syncData.devices && Array.isArray(syncData.devices)) {
      this.updateDeviceList(syncData.devices);
    }

    // Update environment state (Phase 0: Environment Control)
    if (syncData.environment) {
      this._updateEnvironmentFromSync(syncData.environment);
    }

    // Update game clock (Phase 1: Cue Engine)
    if (syncData.gameClock) {
      this._updateGameClockDisplay({
        state: syncData.gameClock.status,
        elapsed: syncData.gameClock.elapsed
      });
    }

    // Update cue engine displays (Phase 1: Show Control)
    if (syncData.cueEngine && syncData.cueEngine.loaded) {
      Debug.log(`[MonitoringDisplay] Cue engine loaded: ${syncData.cueEngine.loaded}, cues: ${syncData.cueEngine.cues?.length || 0}`);
      this._renderQuickFireGrid(syncData.cueEngine.cues || []);
      this._renderStandingCuesList(
        syncData.cueEngine.cues || [],
        syncData.cueEngine.disabledCues || []
      );
    }

    this.updateSystemDisplay();
  }

  /**
   * Update all environment displays from sync:full payload
   * @param {Object} environment - { bluetooth, audio, lighting }
   * @private
   */
  _updateEnvironmentFromSync(environment) {
    // Bluetooth devices
    if (environment.bluetooth) {
      const list = document.getElementById('bt-device-list');
      if (list) {
        list.innerHTML = '';
        const allDevices = environment.bluetooth.pairedDevices || [];
        allDevices.forEach(device => {
          this._handleBluetoothDevice({
            type: device.connected ? 'connected' : 'paired',
            device: { address: device.address, name: device.name }
          });
        });
      }

      // Update scan state
      this._handleBluetoothScan({
        scanning: environment.bluetooth.scanning
      });
    }

    // Audio routing
    if (environment.audio?.routes?.video) {
      this._handleAudioRouting({
        stream: 'video',
        sink: environment.audio.routes.video.sink
      });
    }

    // Lighting
    if (environment.lighting) {
      this._handleLightingStatus({
        connected: environment.lighting.connected,
        scenes: environment.lighting.scenes,
        activeScene: environment.lighting.activeScene
      });
    }
  }

  /**
   * Manually refresh all displays from cached data
   * NOTE: Game Activity is now rendered by app.updateAdminPanel() which calls
   * UIManager.renderGameActivity() for the #admin-game-activity container.
   * Score display is handled by ScreenUpdateManager container handlers.
   */
  refreshAllDisplays() {
    Debug.log('[MonitoringDisplay] refreshAllDisplays called');

    // Refresh session display
    Debug.log(`[MonitoringDisplay] Refreshing session display. Current session: ${this._currentSession ? this._currentSession.id : 'null'}`);
    this.updateSessionDisplay(this._currentSession);

    // Refresh device list
    if (this.devices?.length > 0) {
      this.updateDeviceList(this.devices);
    }

    this.updateSystemDisplay();
    this.loadAvailableVideos();
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

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Format duration in ms to human readable
   * Also handles seconds input for game clock (Phase 1)
   */
  formatDuration(input) {
    if (input === null || input === undefined || input < 0) return 'Unknown';

    // If input is < 10000, treat as seconds (game clock uses seconds)
    // Otherwise treat as milliseconds (session duration)
    const seconds = input < 10000 ? Math.floor(input) : Math.floor(input / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    // For game clock display (HH:MM:SS format)
    if (input < 10000) {
      const h = String(hours).padStart(2, '0');
      const m = String(minutes % 60).padStart(2, '0');
      const s = String(seconds % 60).padStart(2, '0');
      return `${h}:${m}:${s}`;
    }

    // For session duration (human-readable)
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Show a toast notification
   * @param {string} message - Message to display
   * @param {string} type - Toast type ('info', 'error', 'success', 'warning')
   * @param {number} duration - Duration in milliseconds (default: 3000)
   */
  showToast(message, type = 'info', duration = 3000) {
    // Simple toast implementation - creates a temporary div
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : type === 'warning' ? '#ffc107' : '#007bff'};
      color: white;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 10000;
      max-width: 400px;
      animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    if (this.client && this._messageHandler) {
      this.client.removeEventListener('message:received', this._messageHandler);
    }
  }
}

export default MonitoringDisplay;
