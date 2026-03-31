import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SessionManager } from '../../../src/admin/SessionManager.js';
import { VideoController } from '../../../src/admin/VideoController.js';
import { AdminOperations } from '../../../src/admin/AdminOperations.js';
import { MonitoringDisplay } from '../../../src/admin/MonitoringDisplay.js';
import { DisplayController } from '../../../src/admin/DisplayController.js';
import { StateStore } from '../../../src/core/stateStore.js';

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
              payload: { action: 'session:create', success: true, session: expectedSession }
            }
          }));
        }, 10);

        // Test REAL behavior: promise resolves with full response object
        const result = await manager.createSession('New Session', ['001']);
        expect(result).toEqual({ action: 'session:create', success: true, session: expectedSession });
      });

      it('should reject when acknowledgment indicates failure', async () => {
        const manager = new SessionManager(mockConnection);

        // Simulate failed acknowledgment using EventTarget API
        setTimeout(() => {
          mockConnection.dispatchEvent(new CustomEvent('message:received', {
            detail: {
              type: 'gm:command:ack',
              payload: { action: 'session:create', success: false, message: 'Session already exists' }
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
                payload: { action: 'session:pause', success: true, session: { status: 'paused' } }
              }
            })
          );
        }, 10);

        const result = await manager.pauseSession();
        expect(result).toEqual({ action: 'session:pause', success: true, session: { status: 'paused' } });
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
                payload: { action: 'video:play', success: true }
              }
            })
          );
        }, 10);

        await expect(controller.playVideo()).resolves.toEqual({ action: 'video:play', success: true });
      });

      it('should reject when command fails', async () => {
        const controller = new VideoController(mockConnection);

        setTimeout(() => {
          mockConnection.dispatchEvent(
            new CustomEvent('message:received', {
              detail: {
                type: 'gm:command:ack',
                payload: { action: 'video:play', success: false, message: 'VLC not connected' }
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
                payload: { action: 'video:queue:add', success: true, queueLength: 1 }
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
                payload: { action: 'video:queue:reorder', success: true }
              }
            })
          );
        }, 10);

        await expect(controller.reorderQueue(0, 2)).resolves.toEqual({ action: 'video:queue:reorder', success: true });
      });
    });

  });

  describe('DisplayController', () => {
    it('should send display:idle-loop command via sendCommand', async () => {
      const controller = new DisplayController(mockConnection);

      setTimeout(() => {
        mockConnection.dispatchEvent(new CustomEvent('message:received', {
          detail: { type: 'gm:command:ack', payload: { action: 'display:idle-loop', success: true, mode: 'IDLE_LOOP' } }
        }));
      }, 10);

      const result = await controller.setIdleLoop();
      expect(result.success).toBe(true);
      expect(result.mode).toBe('IDLE_LOOP');
    });

    it('should send display:scoreboard command via sendCommand', async () => {
      const controller = new DisplayController(mockConnection);

      setTimeout(() => {
        mockConnection.dispatchEvent(new CustomEvent('message:received', {
          detail: { type: 'gm:command:ack', payload: { action: 'display:scoreboard', success: true, mode: 'SCOREBOARD' } }
        }));
      }, 10);

      const result = await controller.setScoreboard();
      expect(result.success).toBe(true);
      expect(result.mode).toBe('SCOREBOARD');
    });

    it('should send display:status command and return status', async () => {
      const controller = new DisplayController(mockConnection);
      const statusPayload = {
        action: 'display:status',
        success: true,
        currentMode: 'IDLE_LOOP',
        previousMode: 'IDLE_LOOP',
        pendingVideo: null
      };

      setTimeout(() => {
        mockConnection.dispatchEvent(new CustomEvent('message:received', {
          detail: { type: 'gm:command:ack', payload: statusPayload }
        }));
      }, 10);

      const result = await controller.getDisplayStatus();
      expect(result.currentMode).toBe('IDLE_LOOP');
      expect(result.pendingVideo).toBeNull();
    });

    it('should timeout after 5 seconds without acknowledgment', async () => {
      const controller = new DisplayController(mockConnection);
      // Don't dispatch any event - simulate timeout
      await expect(controller.setIdleLoop()).rejects.toThrow('display:idle-loop timeout');
    }, 6000);
  });

  // SystemMonitor — DELETED (Phase 4). Replaced by event-driven HealthRenderer.

  describe('AdminOperations', () => {
    it('should send system restart command', async () => {
      const ops = new AdminOperations(mockConnection);

      setTimeout(() => {
        mockConnection.dispatchEvent(
          new CustomEvent('message:received', {
            detail: {
              type: 'gm:command:ack',
              payload: { action: 'system:restart', success: true }
            }
          })
        );
      }, 10);

      await expect(ops.restartSystem()).resolves.toEqual({ action: 'system:restart', success: true });
    });

    it('should send clear data command', async () => {
      const ops = new AdminOperations(mockConnection);

      setTimeout(() => {
        mockConnection.dispatchEvent(
          new CustomEvent('message:received', {
            detail: {
              type: 'gm:command:ack',
              payload: { action: 'system:clear', success: true }
            }
          })
        );
      }, 10);

      await expect(ops.clearData()).resolves.toEqual({ action: 'system:clear', success: true });
    });

    describe('Score Management', () => {
      it('should reset scores via _sendCommand', async () => {
        const ops = new AdminOperations(mockConnection);

        setTimeout(() => {
          mockConnection.dispatchEvent(
            new CustomEvent('message:received', {
              detail: {
                type: 'gm:command:ack',
                payload: { action: 'score:reset', success: true }
              }
            })
          );
        }, 10);

        await expect(ops.resetScores()).resolves.toEqual({ action: 'score:reset', success: true });

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
                payload: { action: 'score:adjust', success: true }
              }
            })
          );
        }, 10);

        await expect(ops.adjustScore('001', 500, 'Manual adjustment')).resolves.toEqual({
          action: 'score:adjust', success: true
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
                payload: { action: 'transaction:delete', success: true }
              }
            })
          );
        }, 10);

        await expect(ops.deleteTransaction('tx-12345')).resolves.toEqual({ action: 'transaction:delete', success: true });

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
                payload: { action: 'score:adjust', success: false, message: 'No active session' }
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
    let store;

    beforeEach(() => {
      // Mock DOM structure matching actual index.html admin panel
      document.body.innerHTML = `
        <div id="session-status-container"></div>
        <div id="orchestrator-status" class="status-dot"></div>
        <div id="vlc-status" class="status-dot"></div>
        <div id="admin-score-board"></div>
        <div id="device-count"></div>
        <div id="device-list"></div>
      `;

      store = new StateStore();

      display = new MonitoringDisplay(mockConnection, store);
    });

    describe('session rendering via SessionRenderer', () => {
      it('should render active session', () => {
        const session = {
          name: 'Test Session',
          status: 'active',
          startTime: new Date('2025-11-14T10:00:00Z').toISOString()
        };

        display.sessionRenderer.render(session);

        const container = document.getElementById('session-status-container');
        expect(container.innerHTML).toContain('Test Session');
        expect(container.innerHTML).toContain('Active');
        expect(container.querySelector('button[data-action="app.adminPauseSession"]')).toBeTruthy();
      });

      it('should render empty state when session is null', () => {
        display.sessionRenderer.render(null);

        const container = document.getElementById('session-status-container');
        expect(container.innerHTML).toContain('No Active Session');
        expect(container.querySelector('button[data-action="app.adminCreateSession"]')).toBeTruthy();
      });
    });

    // updateVideoDisplay tests removed - video rendering now handled by VideoRenderer
    // (tested in tests/unit/ui/renderers/VideoRenderer.test.js)

    describe('health status updates', () => {
      it('should update orchestrator connection status', () => {
        mockConnection.isConnected = true;

        display.updateSystemDisplay();

        const orchestratorElem = document.getElementById('orchestrator-status');
        expect(orchestratorElem.className).toBe('status-dot status-dot--connected');
      });

      it('should show disconnected state when offline', () => {
        mockConnection.isConnected = false;

        display.updateSystemDisplay();

        const orchestratorElem = document.getElementById('orchestrator-status');
        expect(orchestratorElem.className).toBe('status-dot status-dot--disconnected');
      });

      // VLC status from sync:full — removed (Phase 4: replaced by HealthRenderer)
    });

    describe('display mode event handling', () => {
      beforeEach(() => {
        // Add required DOM elements for display status
        document.body.innerHTML += `
          <span id="now-showing-value">Idle Loop</span>
          <span id="now-showing-icon">🔄</span>
          <button id="btn-idle-loop" class="btn-toggle"></button>
          <button id="btn-scoreboard" class="btn-toggle"></button>
          <span id="pending-queue-count">0</span>
        `;
      });

      it('should update Now Showing to Scoreboard when display:mode event received', () => {
        // Simulate display:mode event
        mockConnection.dispatchEvent(new CustomEvent('message:received', {
          detail: { type: 'display:mode', payload: { mode: 'SCOREBOARD', changedBy: 'gm1' } }
        }));

        expect(document.getElementById('now-showing-value').textContent).toBe('Scoreboard');
        expect(document.getElementById('now-showing-icon').textContent).toBe('🏆');
        expect(document.getElementById('btn-scoreboard').classList.contains('active')).toBe(true);
        expect(document.getElementById('btn-idle-loop').classList.contains('active')).toBe(false);
      });

      it('should update Now Showing to Idle Loop when display:mode event received', () => {
        mockConnection.dispatchEvent(new CustomEvent('message:received', {
          detail: { type: 'display:mode', payload: { mode: 'IDLE_LOOP', changedBy: 'gm1' } }
        }));

        expect(document.getElementById('now-showing-value').textContent).toBe('Idle Loop');
        expect(document.getElementById('now-showing-icon').textContent).toBe('🔄');
        expect(document.getElementById('btn-idle-loop').classList.contains('active')).toBe(true);
      });

      // video:status tests removed — now handled by VideoRenderer via DM pipeline
      // (see tests/unit/ui/renderers/VideoRenderer.test.js)
    });
  });
});
