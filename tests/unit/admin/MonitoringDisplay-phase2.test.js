import { MonitoringDisplay } from '../../../src/admin/MonitoringDisplay.js';

describe('MonitoringDisplay - Phase 2', () => {
  let display, mockClient, mockDataManager, container;

  beforeEach(() => {
    // Setup DOM with Phase 2 elements
    document.body.innerHTML = `
      <div id="session-status-container"></div>
      <div id="active-cues-list"></div>
      <div id="now-playing-section"></div>
      <div id="toast-container"></div>
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

  describe('cue:status (compound cue progress)', () => {
    it('should render active compound cue in Active Cues list', () => {
      const syncData = {
        cueEngine: {
          loaded: true,
          cues: [{ id: 'opening', label: 'Opening Sequence', quickFire: true }],
          activeCues: [{ cueId: 'opening', state: 'running', progress: 30, duration: 120 }]
        }
      };

      display.updateAllDisplays(syncData);

      const activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.textContent).toContain('Opening Sequence');
    });

    it('should update compound cue progress from cue:status event', () => {
      // First set up an active cue
      const syncData = {
        cueEngine: {
          loaded: true,
          cues: [{ id: 'opening', label: 'Opening Sequence', quickFire: true }],
          activeCues: [{ cueId: 'opening', state: 'running', progress: 30, duration: 120 }]
        }
      };
      display.updateAllDisplays(syncData);

      // Then update it via cue:status event
      const event = new CustomEvent('message:received', {
        detail: { type: 'cue:status', payload: { cueId: 'opening', state: 'running', progress: 45, duration: 120 } }
      });
      mockClient.dispatchEvent(event);

      // Verify progress indicator updated
      const activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.textContent).toContain('45');
    });

    it('should remove compound cue when cue:completed received', () => {
      // First add an active cue
      const syncData = {
        cueEngine: {
          loaded: true,
          cues: [{ id: 'opening', label: 'Opening Sequence', quickFire: true }],
          activeCues: [{ cueId: 'opening', state: 'running', progress: 30, duration: 120 }]
        }
      };
      display.updateAllDisplays(syncData);

      // Verify it's there
      let activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.textContent).toContain('Opening Sequence');

      // Then complete it
      const event = new CustomEvent('message:received', {
        detail: { type: 'cue:completed', payload: { cueId: 'opening' } }
      });
      mockClient.dispatchEvent(event);

      // Verify it's removed
      activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.textContent).not.toContain('Opening Sequence');
    });

    it('should show pause/stop/resume buttons for active cues', () => {
      const syncData = {
        cueEngine: {
          loaded: true,
          cues: [{ id: 'opening', label: 'Opening Sequence', quickFire: true }],
          activeCues: [{ cueId: 'opening', state: 'running', progress: 30, duration: 120 }]
        }
      };

      display.updateAllDisplays(syncData);

      const activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.querySelector('[data-action="admin.pauseCue"]')).toBeTruthy();
      expect(activeCuesList.querySelector('[data-action="admin.stopCue"]')).toBeTruthy();
    });

    it('should show resume button when cue is paused', () => {
      const syncData = {
        cueEngine: {
          loaded: true,
          cues: [{ id: 'opening', label: 'Opening Sequence', quickFire: true }],
          activeCues: [{ cueId: 'opening', state: 'paused', progress: 30, duration: 120 }]
        }
      };

      display.updateAllDisplays(syncData);

      const activeCuesList = document.getElementById('active-cues-list');
      expect(activeCuesList.querySelector('[data-action="admin.resumeCue"]')).toBeTruthy();
      expect(activeCuesList.querySelector('[data-action="admin.pauseCue"]')).toBeFalsy();
    });
  });

  describe('cue:conflict', () => {
    it('should show conflict toast with Override and Cancel buttons', () => {
      // Mock showToast method
      display.showToast = jest.fn();

      const event = new CustomEvent('message:received', {
        detail: {
          type: 'cue:conflict',
          payload: {
            cueId: 'evidence-reel',
            reason: 'Video conflict',
            currentVideo: 'opening.mp4'
          }
        }
      });
      mockClient.dispatchEvent(event);

      // Toast should be called with warning type and contain cue ID
      expect(display.showToast).toHaveBeenCalledWith(
        expect.stringContaining('evidence-reel'),
        'warning',
        expect.any(Number)
      );
    });

    it('should include conflict reason in toast message', () => {
      display.showToast = jest.fn();

      const event = new CustomEvent('message:received', {
        detail: {
          type: 'cue:conflict',
          payload: {
            cueId: 'evidence-reel',
            reason: 'Video conflict',
            currentVideo: 'opening.mp4'
          }
        }
      });
      mockClient.dispatchEvent(event);

      expect(display.showToast).toHaveBeenCalledWith(
        expect.stringContaining('Video conflict'),
        'warning',
        expect.any(Number)
      );
    });
  });

  describe('spotify:status', () => {
    it('should update Now Playing section when connected and playing', () => {
      const event = new CustomEvent('message:received', {
        detail: {
          type: 'spotify:status',
          payload: {
            connected: true,
            state: 'playing',
            track: { title: 'Noir Jazz', artist: 'Various Artists' },
            volume: 80
          }
        }
      });
      mockClient.dispatchEvent(event);

      const nowPlaying = document.getElementById('now-playing-section');
      expect(nowPlaying.textContent).toContain('Noir Jazz');
      expect(nowPlaying.textContent).toContain('Various Artists');
    });

    it('should show paused state in Now Playing', () => {
      const event = new CustomEvent('message:received', {
        detail: {
          type: 'spotify:status',
          payload: {
            connected: true,
            state: 'paused',
            track: { title: 'Noir Jazz', artist: 'Various Artists' },
            volume: 80
          }
        }
      });
      mockClient.dispatchEvent(event);

      const nowPlaying = document.getElementById('now-playing-section');
      expect(nowPlaying.textContent).toContain('Paused');
    });

    it('should show disconnected state when not connected', () => {
      const event = new CustomEvent('message:received', {
        detail: {
          type: 'spotify:status',
          payload: {
            connected: false,
            state: 'stopped',
            track: null,
            volume: 0
          }
        }
      });
      mockClient.dispatchEvent(event);

      const nowPlaying = document.getElementById('now-playing-section');
      expect(nowPlaying.textContent).toContain('disconnected');
    });

    it('should show transport controls when connected and playing', () => {
      const event = new CustomEvent('message:received', {
        detail: {
          type: 'spotify:status',
          payload: {
            connected: true,
            state: 'playing',
            track: { title: 'Noir Jazz', artist: 'Various' },
            volume: 80
          }
        }
      });
      mockClient.dispatchEvent(event);

      const nowPlaying = document.getElementById('now-playing-section');
      // When playing, should show pause button (not play)
      expect(nowPlaying.querySelector('[data-action="admin.spotifyPause"]')).toBeTruthy();
      expect(nowPlaying.querySelector('[data-action="admin.spotifyNext"]')).toBeTruthy();
      expect(nowPlaying.querySelector('[data-action="admin.spotifyPrevious"]')).toBeTruthy();
    });

    it('should show play button when paused', () => {
      const event = new CustomEvent('message:received', {
        detail: {
          type: 'spotify:status',
          payload: {
            connected: true,
            state: 'paused',
            track: { title: 'Noir Jazz', artist: 'Various' },
            volume: 80
          }
        }
      });
      mockClient.dispatchEvent(event);

      const nowPlaying = document.getElementById('now-playing-section');
      // When paused, should show play button (not pause)
      expect(nowPlaying.querySelector('[data-action="admin.spotifyPlay"]')).toBeTruthy();
      expect(nowPlaying.querySelector('[data-action="admin.spotifyPause"]')).toBeFalsy();
    });

    it('should update from sync:full payload', () => {
      const syncData = {
        spotify: {
          connected: true,
          state: 'playing',
          track: { title: 'Test Track', artist: 'Test Artist' },
          volume: 60
        }
      };

      display.updateAllDisplays(syncData);

      const nowPlaying = document.getElementById('now-playing-section');
      expect(nowPlaying.textContent).toContain('Test Track');
      expect(nowPlaying.textContent).toContain('Test Artist');
    });
  });
});
