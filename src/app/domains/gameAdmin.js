/**
 * Game Admin Domain
 *
 * Owns: session lifecycle (create/pause/resume/end), postgame report download,
 * system reset + new session, session details view, standalone session display
 * refresh, duration formatting.
 *
 * These correspond to app.js lines 982-1339 in the Phase-2 blueprint
 * plus the Game Admin column in the uiManager domain table.
 *
 * @module app/domains/gameAdmin
 */

import { formatDuration } from '../../utils/formatDuration.js';

export class GameAdminDomain {
  /**
   * @param {import('../app.js').App} app - The App instance (provides collaborators)
   */
  constructor(app) {
    this.app = app;
  }

  // ========== Session Lifecycle ==========

  async adminCreateSession() {
    const { sessionModeManager, dataManager, uiManager, viewController, debug } = this.app;
    const name = prompt('Enter session name:');
    if (!name) return;

    if (sessionModeManager?.isStandalone()) {
      try {
        await dataManager.createSession(name.trim(), []);
        debug.log(`Session created (standalone): ${name}`);
        uiManager.showToast('Session created', 'success');
        this._refreshAdminSessionDisplay();
      } catch (error) {
        console.error('Failed to create session (standalone):', error);
        uiManager.showError(`Failed to create session: ${error.message}`);
      }
      return;
    }

    if (!viewController.adminInstances?.sessionManager) {
      alert('Admin functions not available. Please ensure you are connected.');
      return;
    }

    try {
      await viewController.adminInstances.sessionManager.createSession(name);
      debug.log(`Session created: ${name}`);
    } catch (error) {
      console.error('Failed to create session:', error);
      uiManager.showError('Failed to create session. Check connection.');
    }
  }

  async adminPauseSession() {
    const { sessionModeManager, dataManager, uiManager, viewController, debug } = this.app;

    if (sessionModeManager?.isStandalone()) {
      try {
        const result = await dataManager.pauseSession();
        if (result.success) {
          debug.log('Session paused (standalone)');
          uiManager.showToast('Session paused', 'info');
          this._refreshAdminSessionDisplay();
        } else {
          uiManager.showError(result.error || 'Failed to pause session');
        }
      } catch (error) {
        console.error('Failed to pause session (standalone):', error);
        uiManager.showError(`Failed to pause session: ${error.message}`);
      }
      return;
    }

    if (!viewController.adminInstances?.sessionManager) {
      alert('Admin functions not available.');
      return;
    }
    try {
      await viewController.adminInstances.sessionManager.pauseSession();
      debug.log('Session paused');
    } catch (error) {
      console.error('Failed to pause session:', error);
      uiManager.showError('Failed to pause session.');
    }
  }

  async adminResumeSession() {
    const { sessionModeManager, dataManager, uiManager, viewController, debug } = this.app;

    if (sessionModeManager?.isStandalone()) {
      try {
        const result = await dataManager.resumeSession();
        if (result.success) {
          debug.log('Session resumed (standalone)');
          uiManager.showToast('Session resumed', 'success');
          this._refreshAdminSessionDisplay();
        } else {
          uiManager.showError(result.error || 'Failed to resume session');
        }
      } catch (error) {
        console.error('Failed to resume session (standalone):', error);
        uiManager.showError(`Failed to resume session: ${error.message}`);
      }
      return;
    }

    if (!viewController.adminInstances?.sessionManager) {
      alert('Admin functions not available.');
      return;
    }
    try {
      await viewController.adminInstances.sessionManager.resumeSession();
      debug.log('Session resumed');
    } catch (error) {
      console.error('Failed to resume session:', error);
      uiManager.showError('Failed to resume session.');
    }
  }

  async adminEndSession() {
    const { sessionModeManager, dataManager, uiManager, viewController, debug } = this.app;
    if (!confirm('Are you sure you want to end the session?')) return;

    if (sessionModeManager?.isStandalone()) {
      try {
        await dataManager.endSession();
        debug.log('Session ended (standalone)');
        uiManager.showToast('Session ended', 'info');
        this._refreshAdminSessionDisplay();
      } catch (error) {
        console.error('Failed to end session (standalone):', error);
        uiManager.showError(`Failed to end session: ${error.message}`);
      }
      return;
    }

    if (!viewController.adminInstances?.sessionManager) {
      alert('Admin functions not available.');
      return;
    }
    try {
      await viewController.adminInstances.sessionManager.endSession();
      debug.log('Session ended');
    } catch (error) {
      console.error('Failed to end session:', error);
      uiManager.showError('Failed to end session.');
    }
  }

  // ========== Postgame Report ==========

  async downloadSessionReport() {
    const { dataManager, tokenManager, uiManager } = this.app;
    try {
      const { SessionReportGenerator } = await import('../../core/sessionReportGenerator.js');

      const sessionData = dataManager.getSessionData();
      const scores = dataManager.getTeamScores();
      const transactions = dataManager.getTransactions();
      const playerScans = dataManager.getPlayerScans();
      const tokenDatabase = tokenManager?.database || {};

      if (!sessionData) {
        uiManager.showError('No session data available for report.');
        return;
      }

      const generator = new SessionReportGenerator(tokenDatabase);
      const markdown = generator.generate({ session: sessionData, scores, transactions, playerScans });

      const date = sessionData.startTime
        ? new Date(sessionData.startTime).toISOString().split('T')[0]
        : 'unknown';
      const safeName = (sessionData.name || 'session')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const filename = `session-report-${safeName}-${date}.md`;

      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      uiManager.showToast('Report downloaded', 'info');
    } catch (error) {
      console.error('Failed to generate session report:', error);
      uiManager.showError('Failed to generate report.');
    }
  }

  // ========== System Reset ==========

  async adminResetAndCreateNew() {
    const { uiManager, viewController, debug } = this.app;
    const confirmReset = confirm(
      'Reset system and start new session?\n\n' +
      'This will:\n' +
      '• Archive the current completed session\n' +
      '• Clear all current data\n' +
      '• Prepare system for a new game\n\n' +
      'Continue?'
    );

    if (!confirmReset) return;

    const name = prompt('Enter new session name:');
    if (!name || name.trim() === '') {
      alert('Session name is required');
      return;
    }

    if (!viewController.adminInstances?.sessionManager) {
      alert('Admin functions not available. Please ensure you are connected to the orchestrator.');
      return;
    }

    try {
      debug.log('Sending system:reset command...');

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.off('gm:command:ack', ackHandler);
          reject(new Error('System reset timeout (5s)'));
        }, 5000);

        const socket = viewController.adminInstances.sessionManager.connection.socket;

        const ackHandler = (response) => {
          if (response.data?.action !== 'system:reset') {
            socket.once('gm:command:ack', ackHandler);
            return;
          }
          clearTimeout(timeout);
          if (response.data && response.data.success) {
            debug.log('System reset successful');
            resolve();
          } else {
            const errorMsg = response.data?.message || 'Reset failed';
            reject(new Error(errorMsg));
          }
        };

        socket.once('gm:command:ack', ackHandler);

        socket.emit('gm:command', {
          event: 'gm:command',
          data: { action: 'system:reset', payload: {} },
          timestamp: new Date().toISOString(),
        });
      });

      debug.log('System reset complete, creating new session...');
      await viewController.adminInstances.sessionManager.createSession(name.trim());
      debug.log(`New session created: ${name}`);

      if (uiManager.showToast) {
        uiManager.showToast(`Session "${name}" started successfully`, 'success', 5000);
      } else {
        alert(`Session "${name}" created successfully!`);
      }
    } catch (error) {
      console.error('Failed to reset and create session:', error);
      const errorMsg = `Failed to reset and create session: ${error.message}`;
      if (uiManager.showError) {
        uiManager.showError(errorMsg);
      } else {
        alert(errorMsg);
      }
    }
  }

  // ========== Session Details View ==========

  async adminViewSessionDetails() {
    const { dataManager } = this.app;
    const session = dataManager.getSessionData();

    if (!session) {
      alert('No session data available');
      return;
    }

    const startTime = session.startTime ? new Date(session.startTime).toLocaleString() : 'Unknown';
    const endTime = session.endTime ? new Date(session.endTime).toLocaleString() : 'Ongoing';
    const duration = session.getDuration ? this.formatSessionDuration(session.getDuration()) : 'Unknown';

    const details = `
═══════════════════════════════════
SESSION DETAILS
═══════════════════════════════════

Name: ${session.name || 'Unnamed Session'}
ID: ${session.id}
Status: ${session.status.toUpperCase()}

TIMING
──────────────────────────────────
Started: ${startTime}
${session.endTime ? 'Ended: ' + endTime : 'Status: In Progress'}
Duration: ${duration}

STATISTICS
──────────────────────────────────
Total Scans: ${session.metadata?.totalScans || 0}
Unique Tokens: ${session.metadata?.uniqueTokensScanned?.length || 0}
Teams: ${session.scores?.length || 0}
GM Stations: ${session.connectedDevices?.filter(d => d.type === 'gm').length || 0}

═══════════════════════════════════
    `.trim();

    alert(details);
  }

  /**
   * Format a duration in milliseconds to a human-readable string.
   * Delegates to shared formatDuration utility (F-GMS-14 consolidation).
   * @param {number} ms
   * @returns {string}
   */
  formatSessionDuration(ms) {
    return formatDuration(ms, { fallback: 'Unknown' });
  }

  // ========== Admin Session Display ==========

  /**
   * Refresh the standalone admin session display panel.
   * @private
   */
  _refreshAdminSessionDisplay() {
    const { uiManager } = this.app;
    const container = document.getElementById('session-status-container');
    if (container && uiManager) {
      uiManager.renderSessionStatus(container);
    }
  }
}
