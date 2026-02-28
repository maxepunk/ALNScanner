/**
 * domEventBindings - safeAdminAction wrapper tests
 *
 * Verifies that rejected promises from admin button clicks are caught
 * and logged to the debug panel instead of becoming unhandled rejections.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';

// Capture unhandled rejections at module level (before Jest's handler).
// Without safeAdminAction, rejected admin promises are unhandled;
// after implementation, this array should stay empty.
const unhandledRejections = [];
process.on('unhandledRejection', (reason) => { unhandledRejections.push(reason); });

import { bindDOMEvents } from '../../../src/utils/domEventBindings.js';

describe('domEventBindings - safeAdminAction', () => {
  const mockSpotifyController = {
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    next: jest.fn(),
    previous: jest.fn(),
    checkService: jest.fn(),
    setVolume: jest.fn()
  };

  const mockCueController = {
    fireCue: jest.fn(),
    enableCue: jest.fn(),
    disableCue: jest.fn(),
    pauseCue: jest.fn(),
    stopCue: jest.fn(),
    resumeCue: jest.fn(),
    releaseHeld: jest.fn(),
    discardHeld: jest.fn()
  };

  const mockBluetoothController = {
    startScan: jest.fn(),
    stopScan: jest.fn(),
    pairDevice: jest.fn(),
    connectDevice: jest.fn(),
    disconnectDevice: jest.fn()
  };

  const mockAudioController = {
    setVideoOutput: jest.fn()
  };

  const mockLightingController = {
    refreshScenes: jest.fn(),
    activateScene: jest.fn()
  };

  const mockSessionManager = {
    startGame: jest.fn()
  };

  const mockAdminController = {
    initialized: true,
    getModule: jest.fn((name) => {
      switch (name) {
        case 'spotifyController': return mockSpotifyController;
        case 'cueController': return mockCueController;
        case 'bluetoothController': return mockBluetoothController;
        case 'audioController': return mockAudioController;
        case 'lightingController': return mockLightingController;
        case 'sessionManager': return mockSessionManager;
        default: return {};
      }
    })
  };

  const mockApp = {
    networkedSession: {
      getService: jest.fn(() => mockAdminController)
    }
  };

  const mockDebug = {
    log: jest.fn()
  };

  beforeAll(() => {
    jest.useFakeTimers();
    bindDOMEvents(mockApp, {}, {}, mockDebug, {}, {}, {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
    unhandledRejections.length = 0;
    mockAdminController.initialized = true;
    mockApp.networkedSession = {
      getService: jest.fn(() => mockAdminController)
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  function clickAction(element) {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  function inputAction(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Flush microtask queue so .catch() callbacks execute */
  async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('should log to debug when a spotify action rejects', async () => {
    mockSpotifyController.play.mockRejectedValueOnce(new Error('Connection lost'));

    const btn = document.createElement('button');
    btn.dataset.action = 'admin.spotifyPlay';
    document.body.appendChild(btn);

    clickAction(btn);
    await flushMicrotasks();

    expect(mockDebug.log).toHaveBeenCalledWith(
      expect.stringContaining('Connection lost'),
      true
    );
  });

  it('should log to debug when a cue action rejects', async () => {
    mockCueController.fireCue.mockRejectedValueOnce(new Error('Service down'));

    const btn = document.createElement('button');
    btn.dataset.action = 'admin.fireCue';
    btn.dataset.cueId = 'cue-1';
    document.body.appendChild(btn);

    clickAction(btn);
    await flushMicrotasks();

    expect(mockDebug.log).toHaveBeenCalledWith(
      expect.stringContaining('Service down'),
      true
    );
  });

  it('should log to debug when a bluetooth action rejects', async () => {
    mockBluetoothController.startScan.mockRejectedValueOnce(new Error('Adapter busy'));

    const btn = document.createElement('button');
    btn.dataset.action = 'admin.startBtScan';
    document.body.appendChild(btn);

    clickAction(btn);
    await flushMicrotasks();

    expect(mockDebug.log).toHaveBeenCalledWith(
      expect.stringContaining('Adapter busy'),
      true
    );
  });

  it('should log to debug when a lighting action rejects', async () => {
    mockLightingController.activateScene.mockRejectedValueOnce(new Error('HA unreachable'));

    const btn = document.createElement('button');
    btn.dataset.action = 'admin.activateScene';
    btn.dataset.sceneId = 'scene_pregame';
    document.body.appendChild(btn);

    clickAction(btn);
    await flushMicrotasks();

    expect(mockDebug.log).toHaveBeenCalledWith(
      expect.stringContaining('HA unreachable'),
      true
    );
  });

  it('should not throw for void/synchronous admin actions', () => {
    mockSessionManager.startGame.mockReturnValue(undefined);

    const btn = document.createElement('button');
    btn.dataset.action = 'admin.startGame';
    document.body.appendChild(btn);

    expect(() => clickAction(btn)).not.toThrow();
  });

  it('should catch rejected promise inside debounced volume callback', async () => {
    mockSpotifyController.setVolume.mockRejectedValueOnce(new Error('Volume failed'));

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.dataset.action = 'admin.spotifySetVolume';
    slider.value = '50';
    document.body.appendChild(slider);

    inputAction(slider);
    jest.advanceTimersByTime(150);
    await flushMicrotasks();

    expect(mockSpotifyController.setVolume).toHaveBeenCalledWith(50);
    expect(mockDebug.log).toHaveBeenCalledWith(
      expect.stringContaining('Volume failed'),
      true
    );
  });

  it('should include action name in the error log message', async () => {
    mockSpotifyController.pause.mockRejectedValueOnce(new Error('timeout'));

    const btn = document.createElement('button');
    btn.dataset.action = 'admin.spotifyPause';
    document.body.appendChild(btn);

    clickAction(btn);
    await flushMicrotasks();

    // The log message should mention which command failed
    const logCall = mockDebug.log.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('timeout')
    );
    expect(logCall).toBeDefined();
    expect(logCall[0]).toMatch(/spotify/i);
  });

  it('should not produce unhandled rejections when wrapper is in place', async () => {
    mockSpotifyController.next.mockRejectedValueOnce(new Error('network error'));

    const btn = document.createElement('button');
    btn.dataset.action = 'admin.spotifyNext';
    document.body.appendChild(btn);

    clickAction(btn);
    await flushMicrotasks();

    expect(unhandledRejections).toHaveLength(0);
  });
});
