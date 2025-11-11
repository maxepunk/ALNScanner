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

    mockConnection = {
      url: 'https://localhost:3000',
      socket: mockSocket,
      on: jest.fn((event, handler) => {
        // Store handlers for triggering later
        mockConnection._handlers = mockConnection._handlers || {};
        mockConnection._handlers[event] = handler;
      })
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

      // Simulate broadcast event
      const handler = mockConnection._handlers['session:update'];
      handler(sessionData);

      // Verify REAL behavior: state updated
      expect(manager.currentSession).toEqual(sessionData);
    });

    it('should update currentSession from sync:full events', () => {
      const manager = new SessionManager(mockConnection);
      const syncData = { session: { name: 'Synced Session' } };

      // Simulate sync:full event
      const handler = mockConnection._handlers['sync:full'];
      handler(syncData);

      // Verify REAL behavior: state updated
      expect(manager.currentSession).toEqual(syncData.session);
    });

    describe('createSession', () => {
      it('should resolve when acknowledgment indicates success', async () => {
        const manager = new SessionManager(mockConnection);
        const expectedSession = { name: 'New Session', teams: ['001'] };

        // Mock successful acknowledgment
        mockSocket.once.mockImplementation((event, callback) => {
          if (event === 'gm:command:ack') {
            setTimeout(() => {
              callback({
                data: { success: true, session: expectedSession }
              });
            }, 10);
          }
        });

        // Test REAL behavior: promise resolves with session data
        const result = await manager.createSession('New Session', ['001']);
        expect(result).toEqual(expectedSession);
      });

      it('should reject when acknowledgment indicates failure', async () => {
        const manager = new SessionManager(mockConnection);

        mockSocket.once.mockImplementation((event, callback) => {
          if (event === 'gm:command:ack') {
            setTimeout(() => {
              callback({
                data: { success: false, message: 'Session already exists' }
              });
            }, 10);
          }
        });

        // Test REAL behavior: promise rejects with error
        await expect(manager.createSession('Duplicate')).rejects.toThrow(
          'Session already exists'
        );
      });

      it('should timeout after 5 seconds without acknowledgment', async () => {
        const manager = new SessionManager(mockConnection);

        // Don't call the callback - simulate timeout
        mockSocket.once.mockImplementation(() => {});

        // Test REAL behavior: timeout rejection
        await expect(manager.createSession('Timeout Test')).rejects.toThrow(
          'Session creation timeout'
        );
      }, 6000);
    });

    describe('pauseSession', () => {
      it('should return early if no current session', async () => {
        const manager = new SessionManager(mockConnection);
        manager.currentSession = null;

        const result = await manager.pauseSession();
        expect(result).toBeUndefined();
        expect(mockSocket.emit).not.toHaveBeenCalled();
      });

      it('should resolve when pause succeeds', async () => {
        const manager = new SessionManager(mockConnection);
        manager.currentSession = { name: 'Active' };

        mockSocket.once.mockImplementation((event, callback) => {
          if (event === 'gm:command:ack') {
            setTimeout(() => {
              callback({ data: { success: true, session: { status: 'paused' } } });
            }, 10);
          }
        });

        const result = await manager.pauseSession();
        expect(result.status).toBe('paused');
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

        mockSocket.once.mockImplementation((event, callback) => {
          if (event === 'gm:command:ack') {
            setTimeout(() => {
              callback({ data: { success: true } });
            }, 10);
          }
        });

        await expect(controller.playVideo()).resolves.toEqual({ success: true });
      });

      it('should reject when command fails', async () => {
        const controller = new VideoController(mockConnection);

        mockSocket.once.mockImplementation((event, callback) => {
          if (event === 'gm:command:ack') {
            setTimeout(() => {
              callback({ data: { success: false, message: 'VLC not connected' } });
            }, 10);
          }
        });

        await expect(controller.playVideo()).rejects.toThrow('VLC not connected');
      });
    });

    describe('addToQueue', () => {
      it('should add video to queue successfully', async () => {
        const controller = new VideoController(mockConnection);

        mockSocket.once.mockImplementation((event, callback) => {
          if (event === 'gm:command:ack') {
            setTimeout(() => {
              callback({ data: { success: true, queueLength: 1 } });
            }, 10);
          }
        });

        const result = await controller.addToQueue('test-video.mp4');
        expect(result.queueLength).toBe(1);
      });
    });

    describe('reorderQueue', () => {
      it('should reorder queue items successfully', async () => {
        const controller = new VideoController(mockConnection);

        mockSocket.once.mockImplementation((event, callback) => {
          if (event === 'gm:command:ack') {
            setTimeout(() => {
              callback({ data: { success: true } });
            }, 10);
          }
        });

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

    describe('checkVLC', () => {
      it('should return connected when VLC is available', async () => {
        const monitor = new SystemMonitor(mockConnection);

        global.fetch.mockResolvedValue({
          json: () => Promise.resolve({ connected: true })
        });

        const result = await monitor.checkVLC();
        expect(result).toBe('connected');
        expect(monitor.vlcHealth).toBe('connected');
      });

      it('should return disconnected when VLC is not available', async () => {
        const monitor = new SystemMonitor(mockConnection);

        global.fetch.mockResolvedValue({
          json: () => Promise.resolve({ connected: false })
        });

        const result = await monitor.checkVLC();
        expect(result).toBe('disconnected');
      });
    });

    describe('refresh', () => {
      it('should check both backend and VLC health', async () => {
        const monitor = new SystemMonitor(mockConnection);

        global.fetch
          .mockResolvedValueOnce({ ok: true })
          .mockResolvedValueOnce({
            json: () => Promise.resolve({ connected: true })
          });

        const result = await monitor.refresh();
        expect(result).toEqual({
          backend: 'healthy',
          vlc: 'connected'
        });
      });

      it('should handle partial failures gracefully', async () => {
        const monitor = new SystemMonitor(mockConnection);

        global.fetch
          .mockResolvedValueOnce({ ok: true })
          .mockRejectedValueOnce(new Error('VLC error'));

        const result = await monitor.refresh();
        expect(result.backend).toBe('healthy');
        expect(result.vlc).toBe('error');
      });
    });
  });

  describe('AdminOperations', () => {
    it('should send system restart command', async () => {
      const ops = new AdminOperations(mockConnection);

      mockSocket.once.mockImplementation((event, callback) => {
        if (event === 'gm:command:ack') {
          setTimeout(() => {
            callback({ data: { success: true } });
          }, 10);
        }
      });

      await expect(ops.restartSystem()).resolves.toEqual({ success: true });
    });

    it('should send clear data command', async () => {
      const ops = new AdminOperations(mockConnection);

      mockSocket.once.mockImplementation((event, callback) => {
        if (event === 'gm:command:ack') {
          setTimeout(() => {
            callback({ data: { success: true } });
          }, 10);
        }
      });

      await expect(ops.clearData()).resolves.toEqual({ success: true });
    });
  });

  describe('MonitoringDisplay', () => {
    let display;

    beforeEach(() => {
      display = new MonitoringDisplay();

      // Mock DOM elements
      document.body.innerHTML = `
        <div id="admin-session-name"></div>
        <div id="admin-session-status"></div>
        <div id="admin-session-teams"></div>
        <div id="admin-current-video"></div>
        <div id="admin-queue-length"></div>
        <div id="admin-backend-status"></div>
        <div id="admin-vlc-status"></div>
      `;
    });

    describe('updateSessionDisplay', () => {
      it('should update DOM with session data', () => {
        const session = {
          name: 'Test Session',
          status: 'active',
          teams: ['001', '002', '003']
        };

        display.updateSessionDisplay(session);

        expect(document.getElementById('admin-session-name').textContent).toBe('Test Session');
        expect(document.getElementById('admin-session-status').textContent).toBe('active');
        expect(document.getElementById('admin-session-teams').textContent).toBe('3');
      });

      it('should show defaults when session is null', () => {
        display.updateSessionDisplay(null);

        expect(document.getElementById('admin-session-name').textContent).toBe(
          'No active session'
        );
        expect(document.getElementById('admin-session-status').textContent).toBe('N/A');
        expect(document.getElementById('admin-session-teams').textContent).toBe('0');
      });
    });

    describe('updateVideoDisplay', () => {
      it('should update video status in DOM', () => {
        const videoStatus = {
          current: 'intro.mp4',
          queue: ['video1.mp4', 'video2.mp4']
        };

        display.updateVideoDisplay(videoStatus);

        expect(document.getElementById('admin-current-video').textContent).toBe('intro.mp4');
        expect(document.getElementById('admin-queue-length').textContent).toBe('2');
      });
    });

    describe('updateHealthDisplay', () => {
      it('should update health status with correct styling', () => {
        const health = {
          backend: 'healthy',
          vlc: 'connected'
        };

        display.updateHealthDisplay(health);

        const backendElement = document.getElementById('admin-backend-status');
        expect(backendElement.textContent).toBe('healthy');
        expect(backendElement.className).toBe('status-ok');

        const vlcElement = document.getElementById('admin-vlc-status');
        expect(vlcElement.textContent).toBe('connected');
        expect(vlcElement.className).toBe('status-ok');
      });

      it('should apply error styling for unhealthy states', () => {
        const health = {
          backend: 'unhealthy',
          vlc: 'error'
        };

        display.updateHealthDisplay(health);

        const backendElement = document.getElementById('admin-backend-status');
        expect(backendElement.className).toBe('status-error');
      });
    });
  });
});
