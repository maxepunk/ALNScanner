/**
 * Unit Test: VideoRenderer
 *
 * Verifies differential rendering, progress interpolation, and queue display.
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import { VideoRenderer } from '../../../../src/ui/renderers/VideoRenderer.js';

describe('VideoRenderer', () => {
  let renderer;
  let nowPlayingEl;
  let nowPlayingIcon;
  let progressContainer;
  let progressBar;
  let queueContainer;
  let statusBadge;

  beforeEach(() => {
    // Setup Mock DOM
    document.body.innerHTML = `
      <div id="video-control-panel">
        <span id="now-showing-value">Waiting...</span>
        <span id="now-showing-icon"></span>
        <div id="video-status-badge" class="badge">Idle</div>
        <div id="video-progress-container" style="display: none;">
          <div id="video-progress-fill" style="width: 0%"></div>
        </div>
        <div id="video-queue-list"></div>
        <span id="queue-count">0</span>
        <span id="pending-queue-count">0</span>
      </div>
    `;

    nowPlayingEl = document.getElementById('now-showing-value');
    nowPlayingIcon = document.getElementById('now-showing-icon');
    progressContainer = document.getElementById('video-progress-container');
    progressBar = document.getElementById('video-progress-fill');
    queueContainer = document.getElementById('video-queue-list');
    statusBadge = document.getElementById('video-status-badge');

    renderer = new VideoRenderer();
  });

  afterEach(() => {
    renderer.destroy();
    document.body.innerHTML = '';
  });

  describe('render()', () => {
    test('should render playing state correctly', () => {
      const state = {
        nowPlaying: 'Test Video.mp4',
        isPlaying: true,
        progress: 0.5,
        duration: 120
      };

      renderer.render(state);

      expect(nowPlayingEl.textContent).toBe('Test Video.mp4');
      expect(progressContainer.style.display).toBe('block');
      expect(progressBar.style.width).toBe('50%'); // 0.5 * 120 = 60s / 120 = 50%
      expect(statusBadge.textContent).toBe('Playing');
      expect(statusBadge.classList.contains('badge-success')).toBe(true);
    });

    test('should render idle/stopped state correctly', () => {
      const state = {
        nowPlaying: null,
        isPlaying: false,
        progress: 0,
        duration: 0
      };

      renderer.render(state);

      expect(nowPlayingEl.textContent).toBe('Idle Loop');
      expect(statusBadge.textContent).toBe('Idle');
    });

    test('should format progress bar width correctly', () => {
      const state = {
        nowPlaying: 'Long Video.mp4',
        isPlaying: true,
        progress: 0.25,
        duration: 3600
      };

      renderer.render(state);
      expect(progressBar.style.width).toBe('25%');
    });

    test('should not exceed 100% progress', () => {
      const state = {
        nowPlaying: 'Video.mp4',
        isPlaying: true,
        progress: 1.5, // Over 100%
        duration: 100
      };

      renderer.render(state);
      expect(progressBar.style.width).toBe('100%');
    });

    test('should show play icon when playing', () => {
      renderer.render({ nowPlaying: 'Test.mp4', isPlaying: true, progress: 0, duration: 60 });
      expect(nowPlayingIcon.textContent).toBe('▶️');
    });

    test('should show pause icon when paused', () => {
      renderer.render({ nowPlaying: 'Test.mp4', isPlaying: false, progress: 0, duration: 60 });
      expect(nowPlayingIcon.textContent).toBe('⏸️');
    });

    test('should show loop icon when idle', () => {
      renderer.render({ nowPlaying: null, isPlaying: false, progress: 0, duration: 0 });
      expect(nowPlayingIcon.textContent).toBe('🔄');
    });

    test('should handle null state gracefully', () => {
      expect(() => renderer.render(null)).not.toThrow();
    });

    test('should handle missing DOM elements gracefully', () => {
      const noElRenderer = new VideoRenderer({ nowPlayingEl: null });
      expect(() => noElRenderer.render({ nowPlaying: 'Video.mp4', isPlaying: true })).not.toThrow();
    });
  });

  describe('differential updates', () => {
    const playingState = {
      nowPlaying: 'Video A.mp4',
      isPlaying: true,
      progress: 0.3,
      duration: 120
    };

    test('should only update changed fields on state change', () => {
      renderer.render(playingState);
      const titleBefore = nowPlayingEl.textContent;

      // Only volume/progress changed — title should stay
      const newState = { ...playingState, progress: 0.6 };
      renderer.render(newState, playingState);

      expect(nowPlayingEl.textContent).toBe(titleBefore);
      // Progress updated via interpolation
      expect(progressBar.style.width).toBe('60%');
    });

    test('should update now playing text on video change', () => {
      renderer.render(playingState);
      const newState = { ...playingState, nowPlaying: 'Video B.mp4' };
      renderer.render(newState, playingState);
      expect(nowPlayingEl.textContent).toBe('Video B.mp4');
    });

    test('should hide progress and show idle on stop', () => {
      renderer.render(playingState);
      expect(progressContainer.style.display).toBe('block');

      const stopped = { nowPlaying: null, isPlaying: false, progress: 0, duration: 0 };
      renderer.render(stopped, playingState);
      expect(progressContainer.style.display).toBe('none');
      expect(statusBadge.textContent).toBe('Idle');
    });

    test('should preserve DOM elements across updates', () => {
      renderer.render(playingState);
      const badgeBefore = statusBadge;

      const newState = { ...playingState, nowPlaying: 'Other.mp4' };
      renderer.render(newState, playingState);

      // Same badge element (not rebuilt)
      expect(document.getElementById('video-status-badge')).toBe(badgeBefore);
    });
  });

  describe('progress interpolation', () => {
    test('should set initial progress synchronously', () => {
      renderer.render({
        nowPlaying: 'Video.mp4',
        isPlaying: true,
        progress: 0.4,
        duration: 100
      });
      // 0.4 * 100 = 40s / 100 = 40%
      expect(progressBar.style.width).toBe('40%');
    });

    test('should stop interpolation on pause', () => {
      const playing = { nowPlaying: 'Video.mp4', isPlaying: true, progress: 0.5, duration: 100 };
      renderer.render(playing);

      const paused = { ...playing, isPlaying: false };
      renderer.render(paused, playing);

      expect(progressContainer.style.display).toBe('none');
      expect(renderer._animFrame).toBeNull();
    });

    test('should resync interpolation on new state update', () => {
      const state1 = { nowPlaying: 'Video.mp4', isPlaying: true, progress: 0.2, duration: 100 };
      renderer.render(state1);
      expect(progressBar.style.width).toBe('20%');

      const state2 = { nowPlaying: 'Video.mp4', isPlaying: true, progress: 0.8, duration: 100 };
      renderer.render(state2, state1);
      expect(progressBar.style.width).toBe('80%');
    });

    test('should handle zero duration gracefully', () => {
      renderer.render({
        nowPlaying: 'Video.mp4',
        isPlaying: true,
        progress: 0,
        duration: 0
      });
      expect(progressBar.style.width).toBe('0%');
    });

    test('destroy stops interpolation', () => {
      renderer.render({ nowPlaying: 'V.mp4', isPlaying: true, progress: 0.5, duration: 100 });
      renderer.destroy();
      expect(renderer._animFrame).toBeNull();
    });
  });

  describe('renderQueue()', () => {
    test('should render queue items', () => {
      renderer.renderQueue([
        { tokenId: 'token1', duration: 30 },
        { tokenId: 'token2', duration: 60 }
      ]);

      const items = queueContainer.querySelectorAll('.queue-item');
      expect(items).toHaveLength(2);
      expect(items[0].querySelector('.queue-item__token').textContent).toBe('token1');
      expect(items[1].querySelector('.queue-item__duration').textContent).toBe('60s');
    });

    test('should show empty state for empty queue', () => {
      renderer.renderQueue([]);
      expect(queueContainer.querySelector('.empty-state')).toBeTruthy();
      expect(queueContainer.textContent).toContain('Queue empty');
    });

    test('should update queue count elements', () => {
      renderer.renderQueue([{ tokenId: 't1', duration: 10 }, { tokenId: 't2', duration: 20 }]);
      expect(document.getElementById('queue-count').textContent).toBe('2');
      expect(document.getElementById('pending-queue-count').textContent).toBe('2');
    });

    test('should handle null queue items', () => {
      renderer.renderQueue(null);
      expect(queueContainer.querySelector('.empty-state')).toBeTruthy();
    });

    test('should render queue from state.queue in render()', () => {
      const state = {
        nowPlaying: 'Video.mp4',
        isPlaying: true,
        progress: 0.5,
        duration: 100,
        queue: [{ tokenId: 'q1', duration: 45 }]
      };
      renderer.render(state);

      const items = queueContainer.querySelectorAll('.queue-item');
      expect(items).toHaveLength(1);
      expect(items[0].querySelector('.queue-item__token').textContent).toBe('q1');
    });
  });
});
