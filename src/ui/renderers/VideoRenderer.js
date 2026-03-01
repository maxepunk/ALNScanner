import { escapeHtml } from '../../utils/escapeHtml.js';

/**
 * VideoRenderer - Differential DOM Rendering for Video Playback State
 *
 * First render applies all state. Subsequent renders diff state vs prev,
 * updating only changed elements. Includes client-side progress interpolation
 * using requestAnimationFrame (replaces server-pushed video:progress events).
 *
 * @module ui/renderers/VideoRenderer
 */

export class VideoRenderer {
  constructor(elements = {}) {
    this._nowPlayingEl = elements.nowPlayingEl || document.getElementById('now-showing-value');
    this._nowPlayingIcon = elements.nowPlayingIcon || document.getElementById('now-showing-icon');
    this._statusBadge = elements.statusBadge || document.getElementById('video-status-badge');
    this._progressContainer = elements.progressContainer || document.getElementById('video-progress-container');
    this._progressBar = elements.progressBar || document.getElementById('video-progress-fill');
    this._queueContainer = elements.queueContainer || document.getElementById('video-queue-list');

    // Interpolation state
    this._positionBase = 0;
    this._positionTimestamp = 0;
    this._duration = 0;
    this._animFrame = null;
  }

  /**
   * Render the current video state (differential)
   * @param {Object} state - { nowPlaying, isPlaying, progress, duration, queue? }
   * @param {Object|null} prev - Previous state (null on first render)
   */
  render(state, prev = null) {
    if (!this._nowPlayingEl) return;

    const { nowPlaying, isPlaying, progress, duration } = state || {};

    // Now Playing text
    if (nowPlaying !== prev?.nowPlaying) {
      this._nowPlayingEl.textContent = nowPlaying || 'Idle Loop';
    }

    // Icon
    if (nowPlaying !== prev?.nowPlaying || isPlaying !== prev?.isPlaying) {
      if (this._nowPlayingIcon) {
        this._nowPlayingIcon.textContent = nowPlaying ? (isPlaying ? '▶️' : '⏸️') : '🔄';
      }
    }

    // Status badge
    if (isPlaying !== prev?.isPlaying) {
      if (this._statusBadge) {
        if (isPlaying) {
          this._statusBadge.textContent = 'Playing';
          this._statusBadge.className = 'badge badge-success';
        } else {
          this._statusBadge.textContent = 'Idle';
          this._statusBadge.className = 'badge';
        }
      }
    }

    // Progress bar & interpolation
    if (this._progressContainer && this._progressBar) {
      if (isPlaying) {
        this._progressContainer.style.display = 'block';
        // Only restart interpolation if position/duration actually changed
        if (progress !== prev?.progress || duration !== prev?.duration || !prev?.isPlaying) {
          const posSeconds = (progress || 0) * (duration || 0);
          this._startInterpolation(posSeconds, duration || 0);
        }
      } else if (isPlaying !== prev?.isPlaying) {
        // Transition to not-playing: stop interpolation, hide progress
        this._stopInterpolation();
        this._progressContainer.style.display = 'none';
        this._progressBar.style.width = '0%';
      }
    }

    // Queue (if included in state)
    if (state?.queue !== undefined && state?.queue !== prev?.queue) {
      this.renderQueue(state.queue);
    }
  }

  /**
   * Render the video queue
   * @param {Array} queueItems - Array of { tokenId, duration, ... }
   */
  renderQueue(queueItems) {
    if (!this._queueContainer) return;

    if (!queueItems || queueItems.length === 0) {
      this._queueContainer.innerHTML = '<div class="empty-state">Queue empty</div>';
      this._updateQueueCount(0);
      return;
    }

    this._queueContainer.innerHTML = queueItems.map(item => `
      <div class="queue-item">
        <span class="queue-item__token">${escapeHtml(item.tokenId)}</span>
        <span class="queue-item__duration">${Math.round(item.duration || 0)}s</span>
      </div>
    `).join('');

    this._updateQueueCount(queueItems.length);
  }

  /**
   * Start client-side progress interpolation
   * Sets initial position synchronously, then starts rAF loop for smooth updates.
   */
  _startInterpolation(positionSeconds, duration) {
    this._stopInterpolation();
    this._positionBase = positionSeconds;
    this._positionTimestamp = Date.now();
    this._duration = duration;

    // Set initial position synchronously (works in test environments without rAF)
    const progress = duration > 0 ? Math.min(1, positionSeconds / duration) : 0;
    this._progressBar.style.width = `${progress * 100}%`;

    // Start rAF loop for smooth updates (browser only)
    if (duration > 0 && progress < 1 && typeof requestAnimationFrame !== 'undefined') {
      this._animFrame = requestAnimationFrame(() => this._tick());
    }
  }

  _tick() {
    const elapsed = (Date.now() - this._positionTimestamp) / 1000;
    const current = this._positionBase + elapsed;
    const progress = this._duration > 0 ? Math.min(1, current / this._duration) : 0;
    this._progressBar.style.width = `${progress * 100}%`;
    if (progress < 1 && typeof requestAnimationFrame !== 'undefined') {
      this._animFrame = requestAnimationFrame(() => this._tick());
    }
  }

  _stopInterpolation() {
    if (this._animFrame && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
  }

  _updateQueueCount(count) {
    const countEl = document.getElementById('queue-count');
    const pendingCountEl = document.getElementById('pending-queue-count');
    if (countEl) countEl.textContent = count;
    if (pendingCountEl) pendingCountEl.textContent = count;
  }

  destroy() {
    this._stopInterpolation();
  }
}
