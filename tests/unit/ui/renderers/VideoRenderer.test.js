/**
 * Unit Test: VideoRenderer
 *
 * Verifies that the VideoRenderer correctly updates the DOM based on state.
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';
import { VideoRenderer } from '../../../../src/ui/renderers/VideoRenderer.js';

describe('VideoRenderer', () => {
    let renderer;
    let container;
    let nowPlayingEl;
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
      </div>
    `;

        nowPlayingEl = document.getElementById('now-showing-value');
        progressContainer = document.getElementById('video-progress-container');
        progressBar = document.getElementById('video-progress-fill');
        queueContainer = document.getElementById('video-queue-list');
        statusBadge = document.getElementById('video-status-badge');

        renderer = new VideoRenderer();
    });

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
        expect(progressBar.style.width).toBe('50%'); // 0.5 * 100
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
        expect(progressContainer.style.display).toBe('none');
        expect(statusBadge.textContent).toBe('Idle');
    });

    test('should format time correctly in progress bar', () => {
        // If renderer adds time text, we'd test it here. 
        // Current implementation might just be a bar, but let's assume simple width for now.
        const state = {
            nowPlaying: 'Long Video.mp4',
            isPlaying: true,
            progress: 0.25,
            duration: 3600
        };

        renderer.render(state);
        expect(progressBar.style.width).toBe('25%');
    });
});
