import { MonitoringDisplay } from '../../../src/admin/MonitoringDisplay.js';

describe('MonitoringDisplay - Phase 1', () => {
  let display, mockClient, mockDataManager, container;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <div id="session-status-container"></div>
      <div id="game-clock-display"></div>
    `;

    // Mock client (EventTarget)
    mockClient = new EventTarget();
    mockClient.socket = { connected: true, emit: jest.fn() };

    // Mock DataManager
    mockDataManager = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };

    // Create display instance
    display = new MonitoringDisplay(mockClient, mockDataManager);
    container = document.getElementById('session-status-container');
  });

  afterEach(() => {
    display.destroy();
    document.body.innerHTML = '';
  });

  describe('session setup state', () => {
    it('should show Start Game button when session status is setup', () => {
      const session = {
        id: 'test-session',
        name: 'Test Game',
        status: 'setup',
        teams: [],
        startTime: null
      };

      display.sessionRenderer.render(session);

      const startButton = container.querySelector('button[data-action="admin.startGame"]');
      expect(startButton).toBeTruthy();
      expect(startButton.textContent).toContain('Start Game');
    });

    it('should hide Start Game button when session is active', () => {
      const session = {
        id: 'test-session',
        name: 'Test Game',
        status: 'active',
        teams: ['Team A'],
        startTime: new Date().toISOString(),
        metadata: { totalScans: 5 }
      };

      display.sessionRenderer.render(session);

      const startButton = container.querySelector('button[data-action="admin.startGame"]');
      expect(startButton).toBeFalsy();

      const pauseButton = container.querySelector('button[data-action="app.adminPauseSession"]');
      expect(pauseButton).toBeTruthy();
    });
  });

  describe('game clock display', () => {
    beforeEach(() => {
      // Simulate active session with game clock display
      const session = {
        id: 'test-session',
        name: 'Test Game',
        status: 'active',
        startTime: new Date().toISOString()
      };
      display.sessionRenderer.render(session);
    });

    it('should show elapsed time from gameclock:status event', () => {
      const payload = { state: 'running', elapsed: 3661 };

      // Trigger event via mock client
      const event = new CustomEvent('message:received', {
        detail: { type: 'gameclock:status', payload }
      });
      mockClient.dispatchEvent(event);

      const clockDisplay = document.getElementById('game-clock-display');
      expect(clockDisplay).toBeTruthy();
      expect(clockDisplay.textContent).toContain('61:01');
    });

    it('should show paused indicator when clock is paused', () => {
      const payload = { state: 'paused', elapsed: 1800 };

      const event = new CustomEvent('message:received', {
        detail: { type: 'gameclock:status', payload }
      });
      mockClient.dispatchEvent(event);

      const clockDisplay = document.getElementById('game-clock-display');
      expect(clockDisplay).toBeTruthy();
      expect(clockDisplay.textContent).toContain('30:00');
      expect(clockDisplay.classList.contains('clock-paused')).toBe(true);
    });

    it('should show stopped state when clock is stopped', () => {
      const payload = { state: 'stopped', elapsed: 0 };

      const event = new CustomEvent('message:received', {
        detail: { type: 'gameclock:status', payload }
      });
      mockClient.dispatchEvent(event);

      const clockDisplay = document.getElementById('game-clock-display');
      expect(clockDisplay).toBeTruthy();
      expect(clockDisplay.textContent).toContain('00:00');
    });
  });

  describe('cue:fired toast', () => {
    it('should show toast notification when cue fires', () => {
      const payload = {
        cueId: 'business-sale',
        trigger: 'event:transaction.token-group=BusinessDeal'
      };

      // Mock showToast method
      display.showToast = jest.fn();

      const event = new CustomEvent('message:received', {
        detail: { type: 'cue:fired', payload }
      });
      mockClient.dispatchEvent(event);

      expect(display.showToast).toHaveBeenCalledWith(
        expect.stringContaining('business-sale'),
        'info',
        expect.any(Number)
      );
    });
  });

  describe('cue:error toast', () => {
    it('should show error toast when cue command fails', () => {
      const payload = {
        cueId: 'invalid-cue',
        action: 'sound:play',
        position: 0,
        error: 'Sound file not found'
      };

      // Mock showToast method
      display.showToast = jest.fn();

      const event = new CustomEvent('message:received', {
        detail: { type: 'cue:error', payload }
      });
      mockClient.dispatchEvent(event);

      expect(display.showToast).toHaveBeenCalledWith(
        expect.stringContaining('invalid-cue'),
        'error',
        expect.any(Number)
      );
    });
  });

  describe('sound:status event', () => {
    it('should handle sound status update without error', () => {
      const payload = {
        playing: [
          { file: 'tension.wav', target: 'sound:spot1', volume: 80, pid: 12345 }
        ]
      };

      const event = new CustomEvent('message:received', {
        detail: { type: 'sound:status', payload }
      });

      expect(() => mockClient.dispatchEvent(event)).not.toThrow();
    });
  });

  describe('updateAllDisplays with gameClock and cueEngine', () => {
    it('should restore game clock state from sync:full', () => {
      const syncData = {
        session: {
          id: 'test-session',
          name: 'Test Game',
          status: 'active',
          startTime: new Date().toISOString()
        },
        gameClock: {
          status: 'running',
          elapsed: 2400,
          expectedDuration: 7200
        },
        cueEngine: {
          loaded: true,
          cues: [
            { id: 'tension-hit', label: 'Tension Hit', quickFire: true }
          ]
        }
      };

      display.updateAllDisplays(syncData);

      const clockDisplay = document.getElementById('game-clock-display');
      expect(clockDisplay).toBeTruthy();
      expect(clockDisplay.textContent).toContain('40:00');
    });
  });
});
