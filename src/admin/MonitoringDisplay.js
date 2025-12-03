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
   */
  constructor(connection, dataManager) {
    this.connection = connection;
    this.dataManager = dataManager;
    this.devices = [];
    this.overtimeData = null;
    this._currentSession = null;

    // Bind handler for cleanup
    this._messageHandler = this._handleMessage.bind(this);
    this.connection.addEventListener('message:received', this._messageHandler);

    // Load available videos for manual queue dropdown
    this.loadAvailableVideos();

    // Request initial state to eliminate race condition
    this._requestInitialState();
  }

  /**
   * Request initial state from backend
   * @private
   */
  _requestInitialState() {
    if (this.connection?.socket?.connected) {
      this.connection.socket.emit('sync:request');
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

      case 'sync:full':
        this.updateAllDisplays(payload);
        break;
    }
  }

  // ============================================
  // MESSAGE HANDLERS
  // ============================================

  _handleTransactionNew(payload) {
    if (payload?.transaction) {
      Debug.log('[MonitoringDisplay] Calling updateTransactionDisplay');

      // Add to DataManager for scanner view history
      if (this.dataManager) {
        this.dataManager.addTransaction(payload.transaction);
      }

      // Update admin panel transaction log
      this.updateTransactionDisplay(payload.transaction);
    }
  }

  _handleScoreUpdated(payload) {
    Debug.log('[MonitoringDisplay] Calling updateScoreDisplay');

    // Update DataManager cache BEFORE displaying
    if (this.dataManager && payload) {
      this.dataManager.updateTeamScoreFromBackend(payload);
    }
    this.updateScoreDisplay(payload);
  }

  _handleSessionUpdate(payload) {
    this.updateSessionDisplay(payload);

    // Handle session lifecycle transitions
    if (this.dataManager) {
      if (payload.status === 'ended') {
        Debug.log('[MonitoringDisplay] Session ended, clearing DataManager');
        this.dataManager.resetForNewSession(null);
        this.overtimeData = null;
      } else if (payload.status === 'active' && payload.id) {
        Debug.log('[MonitoringDisplay] New session started, resetting with ID:', payload.id);
        this.dataManager.resetForNewSession(payload.id);
        this.overtimeData = null;
      }
    }
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

    if (this.dataManager) {
      this.dataManager.clearBackendScores();
    }

    // Clear admin panel score board
    const scoreBoard = document.getElementById('admin-score-board');
    if (scoreBoard) {
      const tbody = scoreBoard.querySelector('tbody');
      if (tbody) tbody.innerHTML = '';
    }
  }

  _handleTransactionDeleted(payload) {
    Debug.log('[MonitoringDisplay] Transaction deleted:', payload?.transactionId);

    if (this.dataManager && payload?.transactionId) {
      this.dataManager.removeTransaction(payload.transactionId);
    }

    // Remove from admin panel transaction log
    const transactionLog = document.getElementById('admin-transaction-log');
    if (transactionLog && payload?.transactionId) {
      const txElement = transactionLog.querySelector(`[data-transaction-id="${payload.transactionId}"]`);
      if (txElement) txElement.remove();
    }
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

  /**
   * Update score board display
   */
  updateScoreDisplay(scoreData) {
    Debug.log('[MonitoringDisplay] updateScoreDisplay called');

    if (!scoreData) {
      Debug.log('[MonitoringDisplay] updateScoreDisplay: no scoreData provided', true);
      return;
    }

    const scoreBoard = document.getElementById('admin-score-board');
    if (!scoreBoard) {
      Debug.log('[MonitoringDisplay] updateScoreDisplay: #admin-score-board not found', true);
      return;
    }

    // Build score table from DataManager.backendScores
    if (this.dataManager?.backendScores) {
      Debug.log(`[MonitoringDisplay] DataManager.backendScores size: ${this.dataManager.backendScores.size}`);

      let html = '<table class="score-table"><tr><th>Team</th><th>Tokens</th><th>Score</th></tr>';

      this.dataManager.backendScores.forEach((teamScore, teamId) => {
        const tokensScanned = teamScore.tokensScanned || 0;
        const currentScore = teamScore.currentScore || 0;

        html += `<tr>
          <td class="team-link" data-action="app.showTeamDetails" data-arg="${teamId}">
            ${teamId}
          </td>
          <td>${tokensScanned}</td>
          <td>${currentScore.toLocaleString()}</td>
        </tr>`;
      });

      html += '</table>';
      scoreBoard.innerHTML = html;
      Debug.log('[MonitoringDisplay] Updated #admin-score-board');
    } else {
      Debug.log('[MonitoringDisplay] DataManager.backendScores not available', true);
    }
  }

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
   */
  updateVideoDisplay(videoStatus) {
    if (!videoStatus) return;

    const currentVideoElem = document.getElementById('admin-current-video');
    const queueLengthElem = document.getElementById('admin-queue-length');

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
      const baseUrl = this.connection?.config?.url || 'http://localhost:3000';
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
    if (!this.connection) return;

    const orchestratorElem = document.getElementById('orchestrator-status');
    if (orchestratorElem) {
      const status = this.connection.isConnected ? 'connected' : 'disconnected';
      orchestratorElem.className = `status-dot status-dot--${status}`;
      orchestratorElem.title = status;
    }
  }

  // ============================================
  // AGGREGATE UPDATE METHODS
  // ============================================

  /**
   * Initialize all displays from sync:full event
   */
  updateAllDisplays(syncData) {
    if (!syncData) return;

    // Detect session boundary changes
    if (this.dataManager) {
      const newSessionId = syncData.session?.id;
      const currentSessionId = this.dataManager.currentSessionId;

      if (newSessionId !== currentSessionId) {
        Debug.log(`[MonitoringDisplay] Session boundary: ${currentSessionId} → ${newSessionId}`);

        if (!newSessionId) {
          this.dataManager.resetForNewSession(null);
        } else {
          this.dataManager.resetForNewSession(newSessionId);
        }
      }
    }

    // Update session
    this.updateSessionDisplay(syncData.session || null);

    // Update video
    if (syncData.videoStatus) {
      this.updateVideoDisplay(syncData.videoStatus);
    }

    // Update scores
    if (syncData.scores && Array.isArray(syncData.scores)) {
      syncData.scores.forEach(scoreData => {
        if (this.dataManager) {
          this.dataManager.updateTeamScoreFromBackend(scoreData);
        }
      });

      if (syncData.scores.length > 0) {
        this.updateScoreDisplay(syncData.scores[0]);
      }
    }

    // Update transactions
    if (syncData.recentTransactions && Array.isArray(syncData.recentTransactions)) {
      if (this.dataManager && syncData.session?.id) {
        Debug.log(`[MonitoringDisplay] Populating DataManager with ${syncData.recentTransactions.length} transactions`);
        syncData.recentTransactions.forEach(tx => {
          this.dataManager.addTransaction(tx);
        });
      }

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

    this.updateSystemDisplay();
  }

  /**
   * Manually refresh all displays from cached data
   */
  refreshAllDisplays() {
    if (this.dataManager) {
      // Refresh score display
      if (this.dataManager.backendScores?.size > 0) {
        const firstScore = Array.from(this.dataManager.backendScores.values())[0];
        this.updateScoreDisplay(firstScore);
      }

      // Refresh transaction log
      if (this.dataManager.transactions?.length > 0) {
        const transactionLog = document.getElementById('admin-transaction-log');
        if (transactionLog) {
          transactionLog.innerHTML = '';
          const recent = this.dataManager.transactions.slice(-10).reverse();
          recent.forEach(tx => this.updateTransactionDisplay(tx));
        }
      }
    }

    // Refresh device list
    if (this.devices?.length > 0) {
      this.updateDeviceList(this.devices);
    }

    this.updateSystemDisplay();
    this.loadAvailableVideos();
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
   */
  formatDuration(ms) {
    if (!ms || ms < 0) return 'Unknown';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    if (this.connection && this._messageHandler) {
      this.connection.removeEventListener('message:received', this._messageHandler);
    }
  }
}

export default MonitoringDisplay;
