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
    this._progressTime = elements.progressTime || document.getElementById('video-progress-time');
    this._queueContainer = elements.queueContainer || document.getElementById('video-queue-list');

    // Interpolation state
    this._positionBase = 0;
    this._positionTimestamp = 0;
    this._duration = 0;
    this._animFrame = null;

    // Now Showing single-writer state (F-GMCMD-06): this renderer is the
    // ONLY writer of #now-showing-value/#now-showing-icon. It reconciles the
    // display mode (from display:mode events, via setDisplayMode) with the
    // video domain state — while the TV shows the scoreboard, video pushes
    // must not repaint "Scoreboard" away.
    this._displayMode = null;       // 'SCOREBOARD' | 'IDLE_LOOP' | 'VIDEO' | null
    this._lastVideoState = null;    // { nowPlaying, isPlaying, isPaused }
  }

  /**
   * Set the current HDMI display mode (called from MonitoringDisplay on
   * display:mode events) and repaint Now Showing accordingly.
   * @param {string} mode - 'SCOREBOARD' | 'IDLE_LOOP' | 'VIDEO'
   */
  setDisplayMode(mode) {
    this._displayMode = mode;
    this._renderNowShowing();
  }

  /**
   * Single writer for Now Showing (F-GMCMD-06).
   * SCOREBOARD mode wins; otherwise reflect the video domain state.
   * Elements are looked up lazily — MonitoringDisplay constructs this
   * renderer before the admin panel markup may exist.
   * @private
   */
  _renderNowShowing() {
    if (!this._nowPlayingEl && typeof document !== 'undefined') {
      this._nowPlayingEl = document.getElementById('now-showing-value');
    }
    if (!this._nowPlayingIcon && typeof document !== 'undefined') {
      this._nowPlayingIcon = document.getElementById('now-showing-icon');
    }
    if (!this._nowPlayingEl) return;

    if (this._displayMode === 'SCOREBOARD') {
      this._nowPlayingEl.textContent = 'Scoreboard';
      if (this._nowPlayingIcon) this._nowPlayingIcon.textContent = '🏆';
      return;
    }

    const { nowPlaying, isPlaying } = this._lastVideoState || {};
    this._nowPlayingEl.textContent = nowPlaying || 'Idle Loop';
    if (this._nowPlayingIcon) {
      this._nowPlayingIcon.textContent = nowPlaying ? (isPlaying ? '▶️' : '⏸️') : '🔄';
    }
  }

  /**
   * Render the current video state (differential)
   * @param {Object} state - { nowPlaying, isPlaying, isPaused, progress, duration, queue? }
   * @param {Object|null} prev - Previous state (null on first render)
   */
  render(state, prev = null) {
    const { nowPlaying, isPlaying, isPaused, progress, duration } = state || {};
    const statusChanged = isPlaying !== prev?.isPlaying || isPaused !== prev?.isPaused;

    // Now Showing text + icon — via the single display-mode-aware writer
    // (F-GMCMD-06): a video push while the scoreboard is up must not
    // repaint "Scoreboard" away.
    this._lastVideoState = { nowPlaying: nowPlaying || null, isPlaying: !!isPlaying, isPaused: !!isPaused };
    if (nowPlaying !== prev?.nowPlaying || statusChanged || !prev) {
      this._renderNowShowing();
    }

    // Status badge (F-GMCMD-01: paused is a first-class state — the backend
    // video domain emits status 'paused' with a frozen position)
    if (statusChanged) {
      if (this._statusBadge) {
        if (isPlaying) {
          this._statusBadge.textContent = 'Playing';
          this._statusBadge.className = 'badge badge-success';
        } else if (isPaused) {
          this._statusBadge.textContent = 'Paused';
          this._statusBadge.className = 'badge badge-warning';
        } else {
          this._statusBadge.textContent = 'Idle';
          this._statusBadge.className = 'badge';
        }
      }
    }

    // Progress bar & interpolation
    if (this._progressContainer && this._progressBar) {
      const posSeconds = (progress || 0) * (duration || 0);
      if (isPlaying) {
        this._progressContainer.style.display = 'block';
        // Only restart interpolation if position/duration actually changed
        if (progress !== prev?.progress || duration !== prev?.duration || statusChanged || !prev) {
          this._startInterpolation(posSeconds, duration || 0);
        }
      } else if (isPaused) {
        // F-GMCMD-01: frozen progress — show the paused position statically,
        // and STOP the rAF loop so the bar doesn't keep advancing.
        this._progressContainer.style.display = 'block';
        this._stopInterpolation();
        this._setProgressDisplay(posSeconds, duration || 0);
      } else if (statusChanged) {
        // Transition to not-playing: stop interpolation, hide progress
        this._stopInterpolation();
        this._progressContainer.style.display = 'none';
        this._progressBar.style.width = '0%';
        if (this._progressTime) {
          this._progressTime.textContent = '';
        }
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
    const progress = this._setProgressDisplay(positionSeconds, duration);

    // Start rAF loop for smooth updates (browser only)
    if (duration > 0 && progress < 1 && typeof requestAnimationFrame !== 'undefined') {
      this._animFrame = requestAnimationFrame(() => this._tick());
    }
  }

  /**
   * Set the progress bar + time display to a static position (no rAF).
   * Used for the synchronous part of interpolation AND the frozen paused
   * position (F-GMCMD-01).
   * @returns {number} progress fraction 0..1
   * @private
   */
  _setProgressDisplay(positionSeconds, duration) {
    const progress = duration > 0 ? Math.min(1, positionSeconds / duration) : 0;
    this._progressBar.style.width = `${progress * 100}%`;
    if (this._progressTime) {
      this._progressTime.textContent = `${this._formatTime(positionSeconds)} / ${this._formatTime(duration)}`;
    }
    return progress;
  }

  _tick() {
    const elapsed = (Date.now() - this._positionTimestamp) / 1000;
    const current = this._positionBase + elapsed;
    const progress = this._duration > 0 ? Math.min(1, current / this._duration) : 0;
    this._progressBar.style.width = `${progress * 100}%`;
    if (this._progressTime) {
      this._progressTime.textContent = `${this._formatTime(current)} / ${this._formatTime(this._duration)}`;
    }
    if (progress < 1 && typeof requestAnimationFrame !== 'undefined') {
      this._animFrame = requestAnimationFrame(() => this._tick());
    }
  }

  _formatTime(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
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
