import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  SessionManager,
  VideoController,
  SystemMonitor,
  AdminOperations,
  MonitoringDisplay
} from '../../../src/utils/adminModule.js';

/**
 * Testing Anti-Pattern Avoidance:
 * ✅ Test REAL behavior (promises resolve/reject, state updates)
 * ✅ Only mock external dependencies (socket, fetch)
 * ✅ Watch tests fail first (TDD)
 * ❌ DON'T test that mocks were called (test outcomes, not interactions)
 */

describe('AdminModule - ES6 Exports', () => {
  let mockConnection;
  let mockSocket;

  beforeEach(() => {
    // Mock socket.io client (external dependency)
    mockSocket = {
      emit: jest.fn(),
      once: jest.fn(),
      on: jest.fn()
    };

    // Mock OrchestratorClient using EventTarget API (matches ES6 implementation)
    mockConnection = new EventTarget();
    mockConnection.url = 'https://localhost:3000';
    mockConnection.socket = mockSocket;
    mockConnection.send = jest.fn();
    mockConnection.config = {
      url: 'https://localhost:3000'
    };
  });

  describe('SessionManager', () => {
    it('should initialize with null session', () => {
      const manager = new SessionManager(mockConnection);
      expect(manager.currentSession).toBeNull();
    });

    it('should update currentSession from session:update events', () => {
      const manager = new SessionManager(mockConnection);
      const sessionData = { name: 'Test Session', status: 'active' };

      // Simulate broadcast event using EventTarget API
      mockConnection.dispatchEvent(new CustomEvent('message:received', {
        detail: {
          type: 'session:update',
          payload: sessionData
        }
      }));

      // Verify REAL behavior: state updated
      expect(manager.currentSession).toEqual(sessionData);
    });

    it('should update currentSession from sync:full events', () => {
      const manager = new SessionManager(mockConnection);
      const syncData = { session: { name: 'Synced Session' } };

      // Simulate sync:full event using EventTarget API
      mockConnection.dispatchEvent(new CustomEvent('message:received', {
        detail: {
          type: 'sync:full',
          payload: syncData
        }
      }));

      // Verify REAL behavior: state updated
      expect(manager.currentSession).toEqual(syncData.session);
    });

    describe('createSession', () => {
      it('should resolve when acknowledgment indicates success', async () => {
        const manager = new SessionManager(mockConnection);
        const expectedSession = { name: 'New Session', teams: ['001'] };

        // Simulate successful acknowledgment using EventTarget API
        setTimeout(() => {
          mockConnection.dispatchEvent(new CustomEvent('message:received', {
            detail: {
              type: 'gm:command:ack',
              payload: { success: true, session: expectedSession }
            }
          }));
        }, 10);

        // Test REAL behavior: promise resolves with full response object
        const result = await manager.createSession('New Session', ['001']);
        expect(result).toEqual({ success: true, session: expectedSession });
      });

      it('should reject when acknowledgment indicates failure', async () => {
        const manager = new SessionManager(mockConnection);

        // Simulate failed acknowledgment using EventTarget API
        setTimeout(() => {
          mockConnection.dispatchEvent(new CustomEvent('message:received', {
            detail: {
              type: 'gm:command:ack',
              payload: { success: false, message: 'Session already exists' }
            }
          }));
        }, 10);

        // Test REAL behavior: promise rejects with error
        await expect(manager.createSession('Duplicate')).rejects.toThrow(
          'Session already exists'
        );
      });

      it('should timeout after 5 seconds without acknowledgment', async () => {
        const manager = new SessionManager(mockConnection);

        // Don't dispatch any event - simulate timeout

        // Test REAL behavior: timeout rejection
        await expect(manager.createSession('Timeout Test')).rejects.toThrow(
          'session:create timeout'
        );
      }, 6000);
    });

    describe('pauseSession', () => {
      it('should return early if no current session', async () => {
        const manager = new SessionManager(mockConnection);
        manager.currentSession = null;

        const result = await manager.pauseSession();
        expect(result).toBeUndefined();
        expect(mockConnection.send).not.toHaveBeenCalled();
      });

      it('should resolve when pause succeeds', async () => {
        const manager = new SessionManager(mockConnection);
        manager.currentSession = { name: 'Active' };

        setTimeout(() => {
          mockConnection.dispatchEvent(
            new CustomEvent('message:received', {
              detail: {
                type: 'gm:command:ack',
                payload: { success: true, session: { status: 'paused' } }
              }
            })
          );
        }, 10);

        const result = await manager.pauseSession();
        expect(result).toEqual({ success: true, session: { status: 'paused' } });
      });
    });
  });

  describe('VideoController', () => {
    it('should initialize with null video and zero queue', () => {
      const controller = new VideoController(mockConnection);
      expect(controller.currentVideo).toBeNull();
      expect(controller.queueLength).toBe(0);
    });

    describe('playVideo', () => {
      it('should resolve when command succeeds', async () => {
        const controller = new VideoController(mockConnection);

        setTimeout(() => {
          mockConnection.dispatchEvent(
            new CustomEvent('message:received', {
              detail: {
                type: 'gm:command:ack',
                payload: { success: true }
              }
            })
          );
        }, 10);

        await expect(controller.playVideo()).resolves.toEqual({ success: true });
      });

      it('should reject when command fails', async () => {
        const controller = new VideoController(mockConnection);

        setTimeout(() => {
          mockConnection.dispatchEvent(
            new CustomEvent('message:received', {
              detail: {
                type: 'gm:command:ack',
                payload: { success: false, message: 'VLC not connected' }
              }
            })
          );
        }, 10);

        await expect(controller.playVideo()).rejects.toThrow('VLC not connected');
      });
    });

    describe('addToQueue', () => {
      it('should add video to queue successfully', async () => {
        const controller = new VideoController(mockConnection);

        setTimeout(() => {
          mockConnection.dispatchEvent(
            new CustomEvent('message:received', {
              detail: {
                type: 'gm:command:ack',
                payload: { success: true, queueLength: 1 }
              }
            })
          );
        }, 10);

        const result = await controller.addToQueue('test-video.mp4');
        expect(result.queueLength).toBe(1);
      });
    });

    describe('reorderQueue', () => {
      it('should reorder queue items successfully', async () => {
        const controller = new VideoController(mockConnection);

        setTimeout(() => {
          mockConnection.dispatchEvent(
            new CustomEvent('message:received', {
              detail: {
                type: 'gm:command:ack',
                payload: { success: true }
              }
            })
          );
        }, 10);

        await expect(controller.reorderQueue(0, 2)).resolves.toEqual({ success: true });
      });
    });
  });

  describe('SystemMonitor', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('should initialize with null health states', () => {
      const monitor = new SystemMonitor(mockConnection);
      expect(monitor.backendHealth).toBeNull();
      expect(monitor.vlcHealth).toBeNull();
    });

    describe('checkHealth', () => {
      it('should return healthy when backend responds ok', async () => {
        const monitor = new SystemMonitor(mockConnection);

        global.fetch.mockResolvedValue({ ok: true });

        const result = await monitor.checkHealth();
        expect(result).toBe('healthy');
        expect(monitor.backendHealth).toBe('healthy');
      });

      it('should return unhealthy when backend response not ok', async () => {
        const monitor = new SystemMonitor(mockConnection);

        global.fetch.mockResolvedValue({ ok: false });

        const result = await monitor.checkHealth();
        expect(result).toBe('unhealthy');
      });

      it('should throw and set error state when fetch fails', async () => {
        const monitor = new SystemMonitor(mockConnection);

        global.fetch.mockRejectedValue(new Error('Network error'));

        await expect(monitor.checkHealth()).rejects.toThrow('Network error');
        expect(monitor.backendHealth).toBe('error');
      });
    });

    // SystemMonitor checkVLC() and refresh() - DEPRECATED (removed 11/14/2025)
    //
    // These methods were never implemented and are unnecessary in the event-driven architecture.
    //
    // WHY DEPRECATED:
    // 1. VLC health monitoring: Handled via WebSocket sync:full events in MonitoringDisplay
    //    - See: MonitoringDisplay._handleSyncFull() (adminModule.js:963-972)
    //    - Backend broadcasts VLC status: syncData.systemStatus.vlc
    //    - UI updates automatically via event listeners
    //
    // 2. Manual refresh(): Not needed - UI auto-updates from WebSocket broadcasts
    //    - message:received event triggers MonitoringDisplay updates
    //    - No polling overhead, real-time updates
    //    - Event-driven pattern is architecturally superior
    //
    // REPLACEMENT:
    // - VLC status: Listen to sync:full broadcasts (real-time, no HTTP polling)
    // - Health checks: SystemMonitor.checkHealth() for backend (HTTP fetch OK)
    // - UI updates: Automatic via MonitoringDisplay event listeners
  });

  describe('AdminOperations', () => {
    it('should send system restart command', async () => {
      const ops = new AdminOperations(mockConnection);

      setTimeout(() => {
        mockConnection.dispatchEvent(
          new CustomEvent('message:received', {
            detail: {
              type: 'gm:command:ack',
              payload: { success: true }
            }
          })
        );
      }, 10);

      await expect(ops.restartSystem()).resolves.toEqual({ success: true });
    });

    it('should send clear data command', async () => {
      const ops = new AdminOperations(mockConnection);

      setTimeout(() => {
        mockConnection.dispatchEvent(
          new CustomEvent('message:received', {
            detail: {
              type: 'gm:command:ack',
              payload: { success: true }
            }
          })
        );
      }, 10);

      await expect(ops.clearData()).resolves.toEqual({ success: true });
    });

    describe('Score Management', () => {
      it('should reset scores via _sendCommand', async () => {
        const ops = new AdminOperations(mockConnection);

        setTimeout(() => {
          mockConnection.dispatchEvent(
            new CustomEvent('message:received', {
              detail: {
                type: 'gm:command:ack',
                payload: { success: true }
              }
            })
          );
        }, 10);

        await expect(ops.resetScores()).resolves.toEqual({ success: true });

        // Verify gm:command was sent with correct action
        expect(mockConnection.send).toHaveBeenCalledWith('gm:command', {
          action: 'score:reset',
          payload: {}
        });
      });

      it('should adjust team score via _sendCommand', async () => {
        const ops = new AdminOperations(mockConnection);

        setTimeout(() => {
          mockConnection.dispatchEvent(
            new CustomEvent('message:received', {
              detail: {
                type: 'gm:command:ack',
                payload: { success: true }
              }
            })
          );
        }, 10);

        await expect(ops.adjustScore('001', 500, 'Manual adjustment')).resolves.toEqual({
          success: true
        });

        // Verify gm:command was sent with correct payload
        expect(mockConnection.send).toHaveBeenCalledWith('gm:command', {
          action: 'score:adjust',
          payload: { teamId: '001', delta: 500, reason: 'Manual adjustment' }
        });
      });

      it('should delete transaction via _sendCommand', async () => {
        const ops = new AdminOperations(mockConnection);

        setTimeout(() => {
          mockConnection.dispatchEvent(
            new CustomEvent('message:received', {
              detail: {
                type: 'gm:command:ack',
                payload: { success: true }
              }
            })
          );
        }, 10);

        await expect(ops.deleteTransaction('tx-12345')).resolves.toEqual({ success: true });

        // Verify gm:command was sent with correct payload
        expect(mockConnection.send).toHaveBeenCalledWith('gm:command', {
          action: 'transaction:delete',
          payload: { transactionId: 'tx-12345' }
        });
      });

      it(
        'should timeout if no acknowledgment received within 5s',
        async () => {
          const ops = new AdminOperations(mockConnection);

          // Don't send any ack - let it timeout
          await expect(ops.resetScores()).rejects.toThrow('score:reset timeout');
        },
        6000
      ); // 6s timeout to allow 5s method timeout + buffer

      it('should reject if command fails', async () => {
        const ops = new AdminOperations(mockConnection);

        setTimeout(() => {
          mockConnection.dispatchEvent(
            new CustomEvent('message:received', {
              detail: {
                type: 'gm:command:ack',
                payload: { success: false, message: 'No active session' }
              }
            })
          );
        }, 10);

        await expect(ops.adjustScore('001', 100, 'Test')).rejects.toThrow('No active session');
      });
    });
  });

  describe('MonitoringDisplay', () => {
    // Tests updated 11/14/2025 to match actual ES6 implementation
    // DOM structure matches index.html admin panel (session-status-container, etc.)
    let display;
    let mockDataManager;

    beforeEach(() => {
      // Mock DOM structure matching actual index.html admin panel
      document.body.innerHTML = `
        <div id="session-status-container"></div>
        <div id="admin-current-video"></div>
        <div id="admin-queue-length"></div>
        <div id="orchestrator-status" class="status-dot"></div>
        <div id="vlc-status" class="status-dot"></div>
        <div id="admin-score-board"></div>
        <div id="admin-transaction-log"></div>
        <div id="device-count"></div>
        <div id="device-list"></div>
      `;

      mockDataManager = {
        transactions: [],
        scannedTokens: new Set(),
        addTransaction: jest.fn(),
      };

      display = new MonitoringDisplay(mockConnection, mockDataManager);
    });

    describe('updateSessionDisplay', () => {
      it('should render active session with rich HTML', () => {
        const session = {
          name: 'Test Session',
          status: 'active',
          startTime: new Date('2025-11-14T10:00:00Z').toISOString(),
          metadata: { totalScans: 42 }
        };

        display.updateSessionDisplay(session);

        const container = document.getElementById('session-status-container');
        expect(container.innerHTML).toContain('Test Session');
        expect(container.querySelector('.session-status.active')).toBeTruthy();
        expect(container.innerHTML).toContain('Active');
        expect(container.innerHTML).toContain('42'); // total scans
        expect(container.querySelector('button[data-action="app.adminPauseSession"]')).toBeTruthy();
      });

      it('should render empty state when session is null', () => {
        display.updateSessionDisplay(null);

        const container = document.getElementById('session-status-container');
        expect(container.innerHTML).toContain('No Active Session');
        expect(container.innerHTML).toContain('Create New Session');
        expect(container.querySelector('button[data-action="app.adminCreateSession"]')).toBeTruthy();
      });
    });

    describe('updateVideoDisplay', () => {
      it('should update video status in DOM', () => {
        const videoStatus = {
          status: 'playing',
          tokenId: 'intro.mp4',
          queueLength: 2,
          progress: 0.45
        };

        display.updateVideoDisplay(videoStatus);

        const currentVideo = document.getElementById('admin-current-video');
        expect(currentVideo.textContent).toContain('intro.mp4');
        expect(currentVideo.textContent).toContain('45%'); // progress

        const queueLength = document.getElementById('admin-queue-length');
        expect(queueLength.textContent).toBe('2');
      });

      it('should show idle state when no video playing', () => {
        const videoStatus = {
          status: 'idle',
          tokenId: null,
          queueLength: 0
        };

        display.updateVideoDisplay(videoStatus);

        const currentVideo = document.getElementById('admin-current-video');
        expect(currentVideo.textContent).toContain('None');
        expect(currentVideo.textContent).toContain('idle loop');
      });
    });

    describe('health status updates', () => {
      it('should update orchestrator connection status', () => {
        mockConnection.isConnected = true;

        display.updateSystemDisplay();

        const orchestratorElem = document.getElementById('orchestrator-status');
        expect(orchestratorElem.className).toBe('status-dot connected');
      });

      it('should show disconnected state when offline', () => {
        mockConnection.isConnected = false;

        display.updateSystemDisplay();

        const orchestratorElem = document.getElementById('orchestrator-status');
        expect(orchestratorElem.className).toBe('status-dot disconnected');
      });

      it('should update VLC status from sync:full event', () => {
        const syncData = {
          systemStatus: { vlc: 'connected' }
        };

        display.updateAllDisplays(syncData);

        const vlcElem = document.getElementById('vlc-status');
        expect(vlcElem.className).toBe('status-dot connected');
      });
    });
  });
});
