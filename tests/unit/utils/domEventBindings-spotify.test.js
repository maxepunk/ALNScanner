/**
 * domEventBindings - Spotify Action Tests
 *
 * Tests the admin.spotify* data-action routing including:
 * - spotifyStop, serviceCheck (click actions)
 * - spotifySetVolume (input event on range slider, debounced)
 * - Range input click guard (click on range is ignored)
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import { bindDOMEvents } from '../../../src/utils/domEventBindings.js';

describe('domEventBindings - spotify actions', () => {
  const mockSpotifyController = {
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    next: jest.fn(),
    previous: jest.fn(),
    setVolume: jest.fn()
  };

  const mockAdminOperations = {
    checkService: jest.fn()
  };

  const mockSessionManager = {
    startGame: jest.fn()
  };

  const mockAdminController = {
    initialized: true,
    getModule: jest.fn((name) => {
      switch (name) {
        case 'spotifyController': return mockSpotifyController;
        case 'adminOperations': return mockAdminOperations;
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

  describe('admin.spotifyStop', () => {
    it('should call spotifyController.stop()', () => {
      const btn = document.createElement('button');
      btn.dataset.action = 'admin.spotifyStop';
      document.body.appendChild(btn);

      clickAction(btn);

      expect(mockAdminController.getModule).toHaveBeenCalledWith('spotifyController');
      expect(mockSpotifyController.stop).toHaveBeenCalled();
    });
  });

  describe('admin.serviceCheck', () => {
    it('should call adminOperations.checkService with service id from data attribute', () => {
      const btn = document.createElement('button');
      btn.dataset.action = 'admin.serviceCheck';
      btn.setAttribute('data-service-id', 'spotify');
      document.body.appendChild(btn);

      clickAction(btn);

      expect(mockAdminController.getModule).toHaveBeenCalledWith('adminOperations');
      expect(mockAdminOperations.checkService).toHaveBeenCalledWith('spotify');
    });
  });

  describe('admin.spotifyPlay', () => {
    it('should call spotifyController.play()', () => {
      const btn = document.createElement('button');
      btn.dataset.action = 'admin.spotifyPlay';
      document.body.appendChild(btn);

      clickAction(btn);

      expect(mockSpotifyController.play).toHaveBeenCalled();
    });
  });

  describe('admin.spotifyPause', () => {
    it('should call spotifyController.pause()', () => {
      const btn = document.createElement('button');
      btn.dataset.action = 'admin.spotifyPause';
      document.body.appendChild(btn);

      clickAction(btn);

      expect(mockSpotifyController.pause).toHaveBeenCalled();
    });
  });

  describe('admin.spotifyNext', () => {
    it('should call spotifyController.next()', () => {
      const btn = document.createElement('button');
      btn.dataset.action = 'admin.spotifyNext';
      document.body.appendChild(btn);

      clickAction(btn);

      expect(mockSpotifyController.next).toHaveBeenCalled();
    });
  });

  describe('admin.spotifyPrevious', () => {
    it('should call spotifyController.previous()', () => {
      const btn = document.createElement('button');
      btn.dataset.action = 'admin.spotifyPrevious';
      document.body.appendChild(btn);

      clickAction(btn);

      expect(mockSpotifyController.previous).toHaveBeenCalled();
    });
  });

  describe('admin.spotifySetVolume (input event on range)', () => {
    it('should call spotifyController.setVolume after debounce', () => {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.dataset.action = 'admin.spotifySetVolume';
      slider.value = '75';
      document.body.appendChild(slider);

      inputAction(slider);

      // Before debounce fires — no call yet
      expect(mockSpotifyController.setVolume).not.toHaveBeenCalled();

      // Advance past debounce delay (150ms)
      jest.advanceTimersByTime(150);

      expect(mockSpotifyController.setVolume).toHaveBeenCalledWith(75);
    });

    it('should debounce rapid slider movements', () => {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.dataset.action = 'admin.spotifySetVolume';
      document.body.appendChild(slider);

      // Simulate rapid drag: 30 → 50 → 75
      slider.value = '30';
      inputAction(slider);
      jest.advanceTimersByTime(50);

      slider.value = '50';
      inputAction(slider);
      jest.advanceTimersByTime(50);

      slider.value = '75';
      inputAction(slider);

      // Still within debounce window — nothing fired yet
      expect(mockSpotifyController.setVolume).not.toHaveBeenCalled();

      // Advance past debounce from last input
      jest.advanceTimersByTime(150);

      // Only the final value should be sent
      expect(mockSpotifyController.setVolume).toHaveBeenCalledTimes(1);
      expect(mockSpotifyController.setVolume).toHaveBeenCalledWith(75);
    });

});

  describe('range input click guard', () => {
    it('should not fire click handler for range inputs', () => {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.dataset.action = 'admin.spotifySetVolume';
      slider.value = '50';
      document.body.appendChild(slider);

      clickAction(slider);

      // Click should be ignored for range inputs
      // (only input event should trigger spotifySetVolume)
      expect(mockSpotifyController.setVolume).not.toHaveBeenCalled();

      // Even after debounce timer — click path should not have enqueued anything
      jest.advanceTimersByTime(200);
      expect(mockSpotifyController.setVolume).not.toHaveBeenCalled();
    });
  });
});
