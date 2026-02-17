/**
 * VideoRenderer
 * Handles rendering of video playback state in the Admin Panel.
 *
 * @module ui/renderers/VideoRenderer
 */

export class VideoRenderer {
    constructor() {
        this.container = document.getElementById('video-control-panel');
        this.nowPlayingEl = document.getElementById('now-showing-value');
        this.nowPlayingIcon = document.getElementById('now-showing-icon');
        this.statusBadge = document.getElementById('video-status-badge');
        this.progressContainer = document.getElementById('video-progress-container');
        this.progressBar = document.getElementById('video-progress-fill');
        this.queueContainer = document.getElementById('video-queue-list');
    }

    /**
     * Render the current video state
     * @param {Object} state - Video state object
     * @param {string|null} state.nowPlaying - Filename or null
     * @param {boolean} state.isPlaying - True if playing
     * @param {number} state.progress - 0.0 to 1.0
     * @param {number} state.duration - Duration in seconds
     */
    render(state) {
        if (!this.nowPlayingEl) return; // Guard against missing DOM

        const { nowPlaying, isPlaying, progress } = state;

        // 1. Update Now Playing Text
        if (nowPlaying) {
            this.nowPlayingEl.textContent = nowPlaying;
            if (this.nowPlayingIcon) this.nowPlayingIcon.textContent = isPlaying ? '▶️' : '⏸️';
        } else {
            this.nowPlayingEl.textContent = 'Idle Loop';
            if (this.nowPlayingIcon) this.nowPlayingIcon.textContent = '🔄';
        }

        // 2. Update Status Badge
        if (this.statusBadge) {
            if (isPlaying) {
                this.statusBadge.textContent = 'Playing';
                this.statusBadge.className = 'badge badge-success';
            } else {
                this.statusBadge.textContent = 'Idle';
                this.statusBadge.className = 'badge';
            }
        }

        // 3. Update Progress Bar
        if (this.progressContainer && this.progressBar) {
            if (isPlaying) {
                this.progressContainer.style.display = 'block';
                const percent = Math.min(100, Math.max(0, progress * 100));
                this.progressBar.style.width = `${percent}%`;
            } else {
                this.progressContainer.style.display = 'none';
                this.progressBar.style.width = '0%';
            }
        }
    }

    /**
     * Render the video queue
     * @param {Array} queueItems - Array of { tokenId, duration, ... }
     */
    renderQueue(queueItems) {
        if (!this.queueContainer) return;

        if (!queueItems || queueItems.length === 0) {
            this.queueContainer.innerHTML = '<div class="empty-state">Queue empty</div>';
            this._updateQueueCount(0);
            return;
        }

        this.queueContainer.innerHTML = queueItems.map(item => `
            <div class="queue-item">
                <span class="queue-item__token">${item.tokenId}</span>
                <span class="queue-item__duration">${Math.round(item.duration || 0)}s</span>
            </div>
        `).join('');

        this._updateQueueCount(queueItems.length);
    }

    _updateQueueCount(count) {
        const countEl = document.getElementById('queue-count');
        const pendingCountEl = document.getElementById('pending-queue-count');
        if (countEl) countEl.textContent = count;
        if (pendingCountEl) pendingCountEl.textContent = count;
    }
}
