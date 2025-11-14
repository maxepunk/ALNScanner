/**
 * Admin Module - Unified Admin Functionality
 * ES6 Module Exports
 *
 * CRITICAL: Uses WebSocket gm:command events per AsyncAPI contract
 * NOT HTTP fetch - admin commands via WebSocket only
 *
 * ARCHITECTURE: Uses EventTarget API (browser DOM standard)
 * - Listen via: client.addEventListener('message:received', handler)
 * - Send via: client.send(eventType, data)
 * - Filter messages by event.detail.type
 *
 * Classes:
 * - SessionManager: Session CRUD operations
 * - VideoController: Video playback control
 * - SystemMonitor: Health checks and monitoring
 * - AdminOperations: System-level commands
 * - MonitoringDisplay: DOM updates (event-driven)
 */

/**
 * SessionManager - Session Lifecycle Management
 * Handles create/pause/resume/end via WebSocket commands
 */
export class SessionManager {
  constructor(connection) {
    this.connection = connection; // OrchestratorClient instance (EventTarget)
    this.currentSession = null;

    // Bind handler for cleanup
    this._messageHandler = this._handleMessage.bind(this);

    // Listen to all messages and filter for session-related events
    this.connection.addEventListener('message:received', this._messageHandler);
  }

  /**
   * Handle incoming messages
   * @private
   */
  _handleMessage(event) {
    const { type, payload } = event.detail;

    // Listen to session:update broadcasts for state (event-driven)
    if (type === 'session:update') {
      this.currentSession = payload;
    }

    // Update from sync:full for initial state on connection
    if (type === 'sync:full') {
      if (payload.session) {
        this.currentSession = payload.session;
      }
    }
  }

  async createSession(name, teams = ['001', '002', '003']) {
    return this._sendCommand('session:create', { name, teams });
  }

  async pauseSession() {
    if (!this.currentSession) return;
    return this._sendCommand('session:pause', {});
  }

  async resumeSession() {
    if (!this.currentSession) return;
    return this._sendCommand('session:resume', {});
  }

  async endSession() {
    if (!this.currentSession) return;
    return this._sendCommand('session:end', {});
  }

  /**
   * Send admin command and wait for acknowledgment
   * @param {string} action - Command action (e.g., 'session:create')
   * @param {Object} payload - Command payload
   * @returns {Promise} Resolves with response data
   * @private
   */
  _sendCommand(action, payload) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.connection.removeEventListener('message:received', ackHandler);
        reject(new Error(`${action} timeout`));
      }, 5000);

      // One-time handler for gm:command:ack
      const ackHandler = (event) => {
        const { type, payload: response } = event.detail;

        // Only process gm:command:ack events
        if (type !== 'gm:command:ack') return;

        // Cleanup
        clearTimeout(timeout);
        this.connection.removeEventListener('message:received', ackHandler);

        // Check response
        if (response.data.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.data.message || `Failed: ${action}`));
        }
      };

      // Register one-time listener
      this.connection.addEventListener('message:received', ackHandler);

      // Send command via OrchestratorClient (uses AsyncAPI envelope wrapper)
      this.connection.send('gm:command', {
        action: action,
        payload: payload
      });
    });
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

/**
 * VideoController - Video Playback Control
 * Manages video queue and playback commands
 */
export class VideoController {
  constructor(connection) {
    this.connection = connection;
    this.currentVideo = null;
    this.queueLength = 0;
  }

  async playVideo() {
    return this._sendVideoCommand('video:play');
  }

  async pauseVideo() {
    return this._sendVideoCommand('video:pause');
  }

  async stopVideo() {
    return this._sendVideoCommand('video:stop');
  }

  async skipVideo() {
    return this._sendVideoCommand('video:skip');
  }

  async addToQueue(videoFile) {
    return this._sendCommand('video:queue:add', { videoFile });
  }

  async reorderQueue(fromIndex, toIndex) {
    return this._sendCommand('video:queue:reorder', { fromIndex, toIndex });
  }

  async clearQueue() {
    return this._sendVideoCommand('video:queue:clear');
  }

  _sendVideoCommand(action) {
    return this._sendCommand(action, {});
  }

  /**
   * Send admin command and wait for acknowledgment
   * @param {string} action - Command action
   * @param {Object} payload - Command payload
   * @returns {Promise} Resolves with response data
   * @private
   */
  _sendCommand(action, payload) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.connection.removeEventListener('message:received', ackHandler);
        reject(new Error(`${action} timeout`));
      }, 5000);

      // One-time handler for gm:command:ack
      const ackHandler = (event) => {
        const { type, payload: response } = event.detail;

        // Only process gm:command:ack events
        if (type !== 'gm:command:ack') return;

        // Cleanup
        clearTimeout(timeout);
        this.connection.removeEventListener('message:received', ackHandler);

        // Check response
        if (response.data.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.data.message || `Failed: ${action}`));
        }
      };

      // Register one-time listener
      this.connection.addEventListener('message:received', ackHandler);

      // Send command
      this.connection.send('gm:command', {
        action: action,
        payload: payload
      });
    });
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    // VideoController creates temporary listeners per command
    // No persistent listeners to cleanup
  }
}

/**
 * SystemMonitor - Health Monitoring
 * Checks backend and VLC connectivity
 */
export class SystemMonitor {
  constructor(connection) {
    this.connection = connection;
    this.backendHealth = null;
    this.vlcHealth = null;
  }

  async checkHealth() {
    try {
      const response = await fetch(`${this.connection.config.url}/health`);
      this.backendHealth = response.ok ? 'healthy' : 'unhealthy';
      return this.backendHealth;
    } catch (error) {
      this.backendHealth = 'error';
      throw error;
    }
  }

  async checkVLC() {
    try {
      const response = await fetch(`${this.connection.config.url}/api/vlc/status`);
      const data = await response.json();
      this.vlcHealth = data.connected ? 'connected' : 'disconnected';
      return this.vlcHealth;
    } catch (error) {
      this.vlcHealth = 'error';
      throw error;
    }
  }

  async refresh() {
    await Promise.all([
      this.checkHealth().catch(() => 'error'),
      this.checkVLC().catch(() => 'error')
    ]);
    return {
      backend: this.backendHealth,
      vlc: this.vlcHealth
    };
  }

  /**
   * Cleanup (no event listeners)
   */
  destroy() {
    // SystemMonitor uses HTTP fetch only, no WebSocket listeners
  }
}

/**
 * AdminOperations - System Commands
 * Handles system-level operations
 */
export class AdminOperations {
  constructor(connection) {
    this.connection = connection;
  }

  async restartSystem() {
    return this._sendSystemCommand('system:restart');
  }

  async clearData() {
    return this._sendSystemCommand('system:clear');
  }

  _sendSystemCommand(action) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.connection.removeEventListener('message:received', ackHandler);
        reject(new Error(`${action} timeout`));
      }, 5000);

      // One-time handler for gm:command:ack
      const ackHandler = (event) => {
        const { type, payload: response } = event.detail;

        // Only process gm:command:ack events
        if (type !== 'gm:command:ack') return;

        // Cleanup
        clearTimeout(timeout);
        this.connection.removeEventListener('message:received', ackHandler);

        // Check response
        if (response.data.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.data.message || `Failed: ${action}`));
        }
      };

      // Register one-time listener
      this.connection.addEventListener('message:received', ackHandler);

      // Send command
      this.connection.send('gm:command', {
        action: action,
        payload: {}
      });
    });
  }

  /**
   * Cleanup event listeners
   */
  destroy() {
    // AdminOperations creates temporary listeners per command
    // No persistent listeners to cleanup
  }
}

/**
 * MonitoringDisplay - Event-Driven DOM Updates
 * Listens to WebSocket events and updates admin panel UI
 * Follows EventTarget pattern established by SessionManager
 */
export class MonitoringDisplay {
  constructor(connection) {
    this.connection = connection;
    this.devices = [];  // Local cache for device list

    // Bind handler for cleanup
    this._messageHandler = this._handleMessage.bind(this);
    this.connection.addEventListener('message:received', this._messageHandler);

    // Load available videos for manual queue dropdown
    this.loadAvailableVideos();
  }

  /**
   * Handle incoming WebSocket messages
   * @private
   */
  _handleMessage(event) {
    const { type, payload } = event.detail;

    switch (type) {
      case 'transaction:new':
        // CRITICAL: transaction:new payload is { transaction: {...} }, not flat
        if (payload && payload.transaction) {
          this.updateTransactionDisplay(payload.transaction);
        }
        break;

      case 'score:updated':
        this.updateScoreDisplay(payload);
        break;

      case 'session:update':
        this.updateSessionDisplay(payload);
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
        // Prevent duplicates (idempotent)
        const existingIndex = this.devices.findIndex(d => d.deviceId === payload.deviceId);
        if (existingIndex === -1) {
          this.devices.push(payload);
        }
        // Always update UI (even for duplicates)
        this.updateDeviceList(this.devices);
        this.updateSystemDisplay();
        break;

      case 'device:disconnected':
        this.devices = this.devices.filter(d => d.deviceId !== payload.deviceId);
        this.updateDeviceList(this.devices);
        this.updateSystemDisplay();
        break;

      case 'sync:full':
        this.updateAllDisplays(payload);
        break;
    }
  }

  /**
   * Update transaction log display
   * Shows recent transactions with metadata
   */
  updateTransactionDisplay(transaction) {
    if (!transaction) return;

    const transactionLog = document.getElementById('admin-transaction-log');
    if (!transactionLog) return;

    // Create transaction HTML element
    const txTime = transaction.timestamp ? new Date(transaction.timestamp).toLocaleTimeString() : '-';
    const memoryType = transaction.memoryType || 'UNKNOWN';

    // Add duplicate marker if applicable
    const isDuplicate = transaction.status === 'duplicate';
    const duplicateClass = isDuplicate ? ' duplicate' : '';
    const duplicateBadge = isDuplicate ? ' <span class="duplicate-badge-small">DUP</span>' : '';

    const txHtml = `
      <div class="transaction-item${duplicateClass}">
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
   * Shows connected devices with type indicators
   */
  updateDeviceList(devices) {
    if (!Array.isArray(devices)) return;

    // Store devices array for device:connected/disconnected handlers
    this.devices = devices;

    const countElement = document.getElementById('device-count');
    const listElement = document.getElementById('device-list');

    if (countElement) {
      countElement.textContent = String(devices.length);
    }

    if (listElement) {
      if (devices.length === 0) {
        listElement.innerHTML = '<p style="color: #999; font-size: 12px; margin: 10px 0;">No devices connected</p>';
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
   * Shows all team scores with breakdown
   */
  updateScoreDisplay(scoreData) {
    if (!scoreData) return;

    const scoreBoard = document.getElementById('admin-score-board');
    if (!scoreBoard) return;

    // Build complete score table from DataManager.backendScores
    if (window.DataManager && window.DataManager.backendScores) {
      let html = '<table class="score-table"><tr><th>Team</th><th>Tokens</th><th>Score</th></tr>';

      window.DataManager.backendScores.forEach((teamScore, teamId) => {
        const tokensScanned = teamScore.tokensScanned || 0;
        const currentScore = teamScore.currentScore || 0;

        html += `<tr>
          <td>${teamId}</td>
          <td>${tokensScanned}</td>
          <td>${currentScore.toLocaleString()}</td>
        </tr>`;
      });

      html += '</table>';
      scoreBoard.innerHTML = html;
    }
  }

  /**
   * Update session display with rich status UI
   * Shows different UI for each session state: null, active, paused, ended
   */
  updateSessionDisplay(session) {
    const container = document.getElementById('session-status-container');
    if (!container) {
      console.warn('session-status-container not found in DOM');
      return;
    }

    // STATE: No session
    if (!session) {
      container.innerHTML = `
        <div class="session-status empty" style="text-align: center; padding: 20px; background: #f9f9f9; border-radius: 8px;">
          <p style="color: #666; margin-bottom: 15px; font-size: 14px;">No Active Session</p>
          <p style="color: #999; margin-bottom: 15px; font-size: 12px;">Create a new session to begin tracking gameplay</p>
          <button class="btn btn-primary" data-action="app.adminCreateSession" style="padding: 10px 20px;">
            Create New Session
          </button>
        </div>
      `;
      return;
    }

    // STATE: Ended session
    if (session.status === 'ended') {
      const endTime = session.endTime ? new Date(session.endTime).toLocaleString() : 'Unknown';
      const duration = session.getDuration ? this.formatDuration(session.getDuration()) : 'Unknown';

      container.innerHTML = `
        <div class="session-status ended" style="background: #fff3e0; padding: 15px; border-radius: 8px; border: 2px solid #ff9800;">
          <h4 style="margin: 0 0 10px 0; color: #e65100; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">⚠️</span>
            <span>Previous Session Ended</span>
          </h4>
          <div style="margin-bottom: 12px;">
            <p style="margin: 5px 0; font-weight: bold; color: #333;">${this.escapeHtml(session.name || 'Unnamed Session')}</p>
            <p style="margin: 3px 0; color: #666; font-size: 13px;">Ended: ${this.escapeHtml(endTime)}</p>
            <p style="margin: 3px 0; color: #666; font-size: 13px;">Duration: ${this.escapeHtml(duration)}</p>
            <p style="margin: 3px 0; color: #666; font-size: 13px;">Total Scans: ${session.metadata?.totalScans || 0}</p>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-primary" data-action="app.adminResetAndCreateNew" style="flex: 1; min-width: 150px;">
              Reset & Start New Session
            </button>
            <button class="btn" data-action="app.adminViewSessionDetails" style="flex: 0;">
              View Details
            </button>
          </div>
          <p style="margin: 12px 0 0 0; padding-top: 12px; border-top: 1px solid #ffb74d; color: #e65100; font-size: 12px;">
            💡 Start a new session to continue gameplay
          </p>
        </div>
      `;
      return;
    }

    // STATE: Paused session
    if (session.status === 'paused') {
      const startTime = session.startTime ? new Date(session.startTime).toLocaleString() : 'Unknown';

      container.innerHTML = `
        <div class="session-status paused" style="background: #e3f2fd; padding: 15px; border-radius: 8px; border: 2px solid #2196f3;">
          <h4 style="margin: 0 0 10px 0; color: #1565c0; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">⏸️</span>
            <span>Session Paused</span>
          </h4>
          <div style="margin-bottom: 12px;">
            <p style="margin: 5px 0; font-weight: bold; color: #333;">${this.escapeHtml(session.name || 'Session')}</p>
            <p style="margin: 3px 0; color: #666; font-size: 13px;">Started: ${this.escapeHtml(startTime)}</p>
            <p style="margin: 3px 0; color: #666; font-size: 13px;">Scans: ${session.metadata?.totalScans || 0}</p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-primary" data-action="app.adminResumeSession" style="flex: 1;">
              Resume Session
            </button>
            <button class="btn btn-danger" data-action="app.adminEndSession">
              End Session
            </button>
          </div>
        </div>
      `;
      return;
    }

    // STATE: Active session (default)
    const startTime = session.startTime ? new Date(session.startTime).toLocaleString() : 'Unknown';
    const totalScans = session.metadata?.totalScans || 0;

    container.innerHTML = `
      <div class="session-status active" style="background: #e8f5e9; padding: 15px; border-radius: 8px; border: 2px solid #4caf50;">
        <h4 style="margin: 0 0 10px 0; color: #2e7d32; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">✅</span>
          <span>${this.escapeHtml(session.name || 'Active Session')}</span>
        </h4>
        <div style="margin-bottom: 12px;">
          <p style="margin: 3px 0; color: #666; font-size: 13px;">Started: ${this.escapeHtml(startTime)}</p>
          <p style="margin: 3px 0; color: #666; font-size: 13px;">Total Scans: ${totalScans}</p>
          <p style="margin: 3px 0; color: #666; font-size: 13px;">Status: <span style="color: #2e7d32; font-weight: bold;">Active</span></p>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="btn" data-action="app.adminPauseSession">
            Pause
          </button>
          <button class="btn btn-danger" data-action="app.adminEndSession">
            End Session
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Helper: Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Helper: Format duration in ms to human readable
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
   * Update video display
   * Shows current video and queue length
   */
  updateVideoDisplay(videoStatus) {
    if (!videoStatus) return;

    const currentVideoElem = document.getElementById('admin-current-video');
    const queueLengthElem = document.getElementById('admin-queue-length');

    if (currentVideoElem) {
      // Show video name with progress if playing
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
   * Update video progress (called every 1s during playback)
   * Shows live progress updates with visual progress bar
   */
  updateVideoProgress(progressData) {
    if (!progressData) return;

    const currentVideoElem = document.getElementById('admin-current-video');
    const progressContainer = document.getElementById('video-progress-container');
    const progressFill = document.getElementById('video-progress-fill');
    const progressTime = document.getElementById('video-progress-time');

    // Update text display
    if (currentVideoElem && progressData.tokenId && progressData.progress !== undefined) {
      const progress = Math.round(progressData.progress);
      const position = Math.round(progressData.position);
      const duration = Math.round(progressData.duration);
      currentVideoElem.textContent = `${progressData.tokenId} (${progress}% - ${position}s/${duration}s)`;

      // Show and update progress bar
      if (progressContainer) {
        progressContainer.style.display = 'block';
      }
      if (progressFill) {
        progressFill.style.width = `${progress}%`;
      }
      if (progressTime) {
        progressTime.textContent = `${position}s / ${duration}s`;
      }
    } else {
      // Hide progress bar when not playing
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
    }
  }

  /**
   * Update queue display (shows pending videos)
   */
  updateQueueDisplay(queueData) {
    if (!queueData) return;

    const container = document.getElementById('video-queue-container');
    const list = document.getElementById('video-queue-list');
    const count = document.getElementById('queue-count');

    if (!container || !list || !count) return;

    // Hide if queue is empty
    if (!queueData.items || queueData.items.length === 0) {
      container.style.display = 'none';
      return;
    }

    // Show queue and populate list
    container.style.display = 'block';
    count.textContent = queueData.items.length;
    list.innerHTML = queueData.items.map((item, idx) => `
      <div class="queue-item" style="padding: 8px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between;">
        <span style="color: #666; min-width: 30px;">${idx + 1}.</span>
        <span style="flex: 1; font-weight: 500;">${item.tokenId}</span>
        <span style="color: #888; font-size: 12px;">(${item.duration}s)</span>
      </div>
    `).join('');
  }

  /**
   * Load available videos from server and populate dropdown
   */
  async loadAvailableVideos() {
    try {
      // Use orchestrator URL if available, fallback to localhost
      const baseUrl = this.connection?.config?.url || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/tokens`);
      const data = await response.json();

      const datalist = document.getElementById('available-videos');
      if (!datalist) return;

      const videoOptions = Object.entries(data.tokens)
        .filter(([id, token]) => token.video) // Only tokens with video
        .map(([id, token]) => {
          return `<option value="${token.video}">${id} - ${token.video}</option>`;
        })
        .join('');

      datalist.innerHTML = videoOptions;
      console.log('Loaded video options:', Object.keys(data.tokens).filter(id => data.tokens[id].video).length);
    } catch (error) {
      console.error('Failed to load available videos:', error);
    }
  }

  /**
   * Update system display
   * Shows orchestrator/VLC status and device list
   */
  updateSystemDisplay() {
    // Update orchestrator connection status only
    // Device updates handled by updateAllDisplays() via sync:full → updateDeviceList()

    const orchestratorElem = document.getElementById('orchestrator-status');
    if (orchestratorElem) {
      const status = this.connection.isConnected ? 'connected' : 'disconnected';
      orchestratorElem.className = status === 'connected'
        ? 'status-dot connected'
        : 'status-dot disconnected';
      orchestratorElem.title = status;
    }
  }

  /**
   * Initialize all displays from sync:full event
   * Called on connection/reconnection to populate displays
   */
  updateAllDisplays(syncData) {
    if (!syncData) return;

    // Update session display
    if (syncData.session) {
      this.updateSessionDisplay(syncData.session);
    } else {
      this.updateSessionDisplay(null);
    }

    // Update video display
    if (syncData.videoStatus) {
      this.updateVideoDisplay(syncData.videoStatus);
    }

    // Update all team scores
    if (syncData.scores && Array.isArray(syncData.scores)) {
      // Process each score through DataManager
      syncData.scores.forEach(scoreData => {
        if (window.DataManager) {
          window.DataManager.updateTeamScoreFromBackend(scoreData);
        }
      });

      // Trigger single score display update
      if (syncData.scores.length > 0) {
        this.updateScoreDisplay(syncData.scores[0]);
      }
    }

    // Update transaction log (last 10)
    if (syncData.recentTransactions && Array.isArray(syncData.recentTransactions)) {
      const transactionLog = document.getElementById('admin-transaction-log');
      if (transactionLog) {
        // Clear existing and add last 10 in reverse order (most recent first)
        transactionLog.innerHTML = '';

        const recent = syncData.recentTransactions.slice(-10).reverse();
        recent.forEach(tx => this.updateTransactionDisplay(tx));
      }
    }

    // Update system status (VLC and devices from sync:full data)
    if (syncData.systemStatus) {
      // Update VLC status directly
      const vlcElement = document.getElementById('vlc-status');
      if (vlcElement) {
        const vlcStatus = syncData.systemStatus.vlc; // 'connected' | 'disconnected' | 'error'
        vlcElement.className = vlcStatus === 'connected'
          ? 'status-dot connected'
          : 'status-dot disconnected';
        vlcElement.title = vlcStatus;
      }
    }

    // Update devices from sync:full data
    if (syncData.devices && Array.isArray(syncData.devices)) {
      this.updateDeviceList(syncData.devices);
    }

    // Update system display (orchestrator connection status)
    this.updateSystemDisplay();
  }

  /**
   * Manually refresh all displays from cached data
   * Used when switching to admin view
   */
  refreshAllDisplays() {
    // Refresh from DataManager cached data
    if (window.DataManager) {
      // Trigger score display rebuild
      if (window.DataManager.backendScores && window.DataManager.backendScores.size > 0) {
        const firstScore = Array.from(window.DataManager.backendScores.values())[0];
        this.updateScoreDisplay(firstScore);
      }

      // Refresh transaction log (last 10)
      if (window.DataManager.transactions && window.DataManager.transactions.length > 0) {
        const transactionLog = document.getElementById('admin-transaction-log');
        if (transactionLog) {
          transactionLog.innerHTML = '';
          const recent = window.DataManager.transactions.slice(-10).reverse();
          recent.forEach(tx => this.updateTransactionDisplay(tx));
        }
      }
    }

    // CRITICAL FIX: Refresh device list from cached devices array
    // When switching to admin view, device list needs to be re-rendered
    if (this.devices && this.devices.length > 0) {
      this.updateDeviceList(this.devices);
    }

    // Refresh system display
    this.updateSystemDisplay();

    // Populate video dropdown
    this.loadAvailableVideos();
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

// Default export for convenience
export default {
  SessionManager,
  VideoController,
  SystemMonitor,
  AdminOperations,
  MonitoringDisplay
};
