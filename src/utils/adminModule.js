/**
 * Admin Module - Unified Admin Functionality
 * ES6 Module Exports
 *
 * CRITICAL: Uses WebSocket gm:command events per AsyncAPI contract
 * NOT HTTP fetch - admin commands via WebSocket only
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
    this.connection = connection; // OrchestratorClient instance with socket
    this.currentSession = null;

    // Listen to session:update broadcasts for state (event-driven)
    this.connection.on('session:update', (session) => {
      this.currentSession = session;
    });

    // Update from sync:full for initial state on connection
    this.connection.on('sync:full', (data) => {
      if (data.session) {
        this.currentSession = data.session;
      }
    });
  }

  async createSession(name, teams = ['001', '002', '003']) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Session creation timeout'));
      }, 5000);

      // Listen for acknowledgment
      this.connection.socket.once('gm:command:ack', (response) => {
        clearTimeout(timeout);
        if (response.data.success) {
          resolve(response.data.session);
        } else {
          reject(new Error(response.data.message || 'Failed to create session'));
        }
      });

      // Send command via WebSocket (per AsyncAPI contract)
      this.connection.socket.emit('gm:command', {
        event: 'gm:command',
        data: {
          action: 'session:create',
          payload: { name, teams }
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  async pauseSession() {
    if (!this.currentSession) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

      this.connection.socket.once('gm:command:ack', (response) => {
        clearTimeout(timeout);
        if (response.data.success) {
          resolve(response.data.session);
        } else {
          reject(new Error(response.data.message || 'Failed to pause session'));
        }
      });

      this.connection.socket.emit('gm:command', {
        event: 'gm:command',
        data: {
          action: 'session:pause',
          payload: {}
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  async resumeSession() {
    if (!this.currentSession) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

      this.connection.socket.once('gm:command:ack', (response) => {
        clearTimeout(timeout);
        if (response.data.success) {
          resolve(response.data.session);
        } else {
          reject(new Error(response.data.message || 'Failed to resume session'));
        }
      });

      this.connection.socket.emit('gm:command', {
        event: 'gm:command',
        data: {
          action: 'session:resume',
          payload: {}
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  async endSession() {
    if (!this.currentSession) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

      this.connection.socket.once('gm:command:ack', (response) => {
        clearTimeout(timeout);
        if (response.data.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.data.message || 'Failed to end session'));
        }
      });

      this.connection.socket.emit('gm:command', {
        event: 'gm:command',
        data: {
          action: 'session:end',
          payload: {}
        },
        timestamp: new Date().toISOString()
      });
    });
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
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

      this.connection.socket.once('gm:command:ack', (response) => {
        clearTimeout(timeout);
        if (response.data.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.data.message || 'Failed to add to queue'));
        }
      });

      this.connection.socket.emit('gm:command', {
        event: 'gm:command',
        data: {
          action: 'video:queue:add',
          payload: { videoFile }
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  async reorderQueue(fromIndex, toIndex) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

      this.connection.socket.once('gm:command:ack', (response) => {
        clearTimeout(timeout);
        if (response.data.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.data.message || 'Failed to reorder queue'));
        }
      });

      this.connection.socket.emit('gm:command', {
        event: 'gm:command',
        data: {
          action: 'video:queue:reorder',
          payload: { fromIndex, toIndex }
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  async clearQueue() {
    return this._sendVideoCommand('video:queue:clear');
  }

  _sendVideoCommand(action) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

      this.connection.socket.once('gm:command:ack', (response) => {
        clearTimeout(timeout);
        if (response.data.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.data.message || `Failed: ${action}`));
        }
      });

      this.connection.socket.emit('gm:command', {
        event: 'gm:command',
        data: {
          action: action,
          payload: {}
        },
        timestamp: new Date().toISOString()
      });
    });
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
      const response = await fetch(`${this.connection.url}/health`);
      this.backendHealth = response.ok ? 'healthy' : 'unhealthy';
      return this.backendHealth;
    } catch (error) {
      this.backendHealth = 'error';
      throw error;
    }
  }

  async checkVLC() {
    try {
      const response = await fetch(`${this.connection.url}/api/vlc/status`);
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
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

      this.connection.socket.once('gm:command:ack', (response) => {
        clearTimeout(timeout);
        if (response.data.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.data.message || `Failed: ${action}`));
        }
      });

      this.connection.socket.emit('gm:command', {
        event: 'gm:command',
        data: {
          action: action,
          payload: {}
        },
        timestamp: new Date().toISOString()
      });
    });
  }
}

/**
 * MonitoringDisplay - DOM Updates
 * Event-driven display updates (separation from business logic)
 */
export class MonitoringDisplay {
  updateSessionDisplay(session) {
    const nameElement = document.getElementById('admin-session-name');
    const statusElement = document.getElementById('admin-session-status');
    const teamsElement = document.getElementById('admin-session-teams');

    if (nameElement) nameElement.textContent = session?.name || 'No active session';
    if (statusElement) statusElement.textContent = session?.status || 'N/A';
    if (teamsElement) teamsElement.textContent = session?.teams?.length || 0;
  }

  updateVideoDisplay(videoStatus) {
    const currentElement = document.getElementById('admin-current-video');
    const queueElement = document.getElementById('admin-queue-length');

    if (currentElement) {
      currentElement.textContent = videoStatus?.current || 'None';
    }
    if (queueElement) {
      queueElement.textContent = videoStatus?.queue?.length || 0;
    }
  }

  updateHealthDisplay(health) {
    const backendElement = document.getElementById('admin-backend-status');
    const vlcElement = document.getElementById('admin-vlc-status');

    if (backendElement) {
      backendElement.textContent = health.backend || 'Unknown';
      backendElement.className = health.backend === 'healthy' ? 'status-ok' : 'status-error';
    }
    if (vlcElement) {
      vlcElement.textContent = health.vlc || 'Unknown';
      vlcElement.className = health.vlc === 'connected' ? 'status-ok' : 'status-error';
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
